use std::io::{BufRead, BufReader};
use std::string::String;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::api::Api;
use anyhow::{Result, bail};
use std::time::{Duration, Instant};
use socket2::{Domain, Protocol, Socket, Type};
use std::mem::size_of_val;
use std::net::{IpAddr, SocketAddr};
use std::net::UdpSocket as StdSocket;
use tokio::net::UdpSocket;
use std::os::windows::io::{AsRawSocket, FromRawSocket, IntoRawSocket};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::ptr::null_mut;
use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};
use winapi::shared::minwindef::DWORD;
use winapi::um::winsock2;
use crate::api::GameStatus;
use sysinfo::{System};
use idna::domain_to_ascii;
use log::{info, error};

const SIO_RCVALL: DWORD = 0x98000001;

/// Returns true when a remote UDP port falls in the range Sea of Thieves game servers use.
/// Extracted as a pure function so the core detection heuristic can be unit-tested.
pub(crate) fn is_plausible_sot_port(port: u16) -> bool {
    port >= 30000 && port < 40000
}

/// Poll interval (in milliseconds) between detection windows, adapted to game state.
fn dynamic_sleep_ms(status: &GameStatus) -> u64 {
    match status {
        GameStatus::Closed => 5000,
        GameStatus::Started => 3000,
        GameStatus::MainMenu => 500,
        GameStatus::InGame => 3000,
        GameStatus::Unknown => 2000,
    }
}

/// How long each detection window sniffs traffic before ranking flows.
const CAPTURE_WINDOW_MS: u64 = 1500;
/// Minimum packets a plausible-SoT flow must carry within a window to be accepted as
/// the server. The real server pushes dozens of packets per second while the sparse
/// Steam Datagram Relay flows push almost none, so a small floor cleanly separates
/// them (see the issue #364 captures).
const MIN_SERVER_PACKETS: u32 = 5;
/// Keep showing the last known server through brief gaps in traffic; only fall back to
/// the main menu once no server flow has been seen for this long. Avoids flapping.
const SERVER_LOST_GRACE_SECS: u64 = 12;

pub async fn init() -> std::result::Result<Arc<RwLock<Api>>, anyhow::Error> {
    let api_base = Arc::new(RwLock::new(Api::new()));
    let api = Arc::clone(&api_base);

    tokio::spawn(async move {
        loop {
            let pid = find_pid_of("SoTGame.exe");

            // No game process -> closed.
            if pid.is_empty() {
                let mut api_lock = api.write().await;
                if api_lock.game_status != GameStatus::Closed {
                    api_lock.game_status = GameStatus::Closed;
                    api_lock.server_ip = String::new();
                    api_lock.server_port = 0;
                    info!("Game is closed");
                }
                drop(api_lock);
                tokio::time::sleep(Duration::from_millis(dynamic_sleep_ms(&GameStatus::Closed)))
                    .await;
                continue;
            }

            let pid: usize = match pid[0].parse() {
                Ok(pid) => pid,
                Err(e) => {
                    error!("Could not parse game PID: {}", e);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };

            // Game process but no UDP sockets yet -> still launching.
            let udp_ports = get_udp_connections(pid);
            if udp_ports.is_empty() {
                let mut api_lock = api.write().await;
                if api_lock.game_status != GameStatus::Started {
                    api_lock.game_status = GameStatus::Started;
                    info!("Game is launching (no UDP sockets yet) on PID {}", pid);
                }
                drop(api_lock);
                tokio::time::sleep(Duration::from_millis(dynamic_sleep_ms(&GameStatus::Started)))
                    .await;
                continue;
            }

            // Sniff every game UDP port for a short window and rank the flows by
            // volume. The real server flow dominates; the many Steam Datagram Relay
            // sockets are sparse (issue #364), so the busiest plausible-SoT flow is the
            // server. This replaces the old "first plausible packet wins" guess, which
            // raced between 25+ sockets and could latch onto the wrong one.
            let port_count = udp_ports.len();
            let flows = crate::diagnostics::capture_flows(
                udp_ports,
                Duration::from_millis(CAPTURE_WINDOW_MS),
            )
            .await;

            match crate::diagnostics::pick_server_flow(&flows, MIN_SERVER_PACKETS) {
                Some(server) => {
                    let mut api_lock = api.write().await;
                    let changed = api_lock.game_status != GameStatus::InGame
                        || api_lock.server_ip != server.remote_ip
                        || api_lock.server_port != server.remote_port;
                    api_lock.game_status = GameStatus::InGame;
                    api_lock.server_ip = server.remote_ip.clone();
                    api_lock.server_port = server.remote_port;
                    api_lock.last_updated_server_ip = Instant::now();
                    drop(api_lock);
                    if changed {
                        info!(
                            "Server detected: {}:{} (local port {}, {} pkts / {} bytes in {}ms, {} game ports)",
                            server.remote_ip,
                            server.remote_port,
                            server.local_port,
                            server.packets,
                            server.bytes,
                            CAPTURE_WINDOW_MS,
                            port_count
                        );
                    }
                }
                None => {
                    let (had_server, last_updated) = {
                        let api_lock = api.read().await;
                        (
                            !api_lock.server_ip.is_empty(),
                            api_lock.last_updated_server_ip,
                        )
                    };
                    if had_server {
                        // Hold the last server through short traffic gaps to avoid flapping.
                        if last_updated.elapsed() > Duration::from_secs(SERVER_LOST_GRACE_SECS) {
                            let mut api_lock = api.write().await;
                            api_lock.game_status = GameStatus::MainMenu;
                            api_lock.server_ip = String::new();
                            api_lock.server_port = 0;
                            api_lock.last_updated_server_ip = Instant::now();
                            drop(api_lock);
                            info!(
                                "Server lost (no traffic for {}s), back to main menu",
                                SERVER_LOST_GRACE_SECS
                            );
                        }
                    } else {
                        let mut api_lock = api.write().await;
                        if api_lock.game_status != GameStatus::MainMenu {
                            api_lock.game_status = GameStatus::MainMenu;
                            info!("In main menu (no server flow on {} game ports)", port_count);
                        }
                    }
                }
            }

            // The capture window itself paces the loop; add a small gap (longer once in
            // game, where the server is stable) before opening the next window.
            let in_game = api.read().await.game_status == GameStatus::InGame;
            let gap_ms = if in_game { 2000 } else { 400 };
            tokio::time::sleep(Duration::from_millis(gap_ms)).await;
        }
    });

    Ok(api_base)
}

// Fetch game UDP connections
pub(crate) fn get_udp_connections(target_pid: usize) -> Vec<u16> {
    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::UDP;
    let sockets_info = match get_sockets_info(af_flags, proto_flags) {
        Ok(sockets_info) => sockets_info,
        Err(e) => {
            error!("Failed to get socket information: {}", e);
            return Vec::new();
        }
    };

    let ports: Vec<u16> = sockets_info.iter().filter_map(|si| {
        if let ProtocolSocketInfo::Udp(udp_si) = &si.protocol_socket_info {
            // Check if any of the associated PIDs match the target PID
            if si.associated_pids.iter().any(|&pid| pid == (target_pid as u32)) {
                Some(udp_si.local_port)
            } else { None }
        } else {
            None // This line is technically unnecessary due to the UDP filter applied earlier
        }
    }).collect();

    //Filter out duplicates
    return ports.into_iter().collect::<std::collections::HashSet<u16>>().into_iter().collect();
}

// In this netstat powershell command, we get the UDP endpoints of a process
pub(crate) fn get_udp_connections_powershell(pid: usize) -> Vec<u16> {
    let ps_script = format!(
        "Get-NetUDPEndpoint -OwningProcess {} | Select-Object -ExpandProperty LocalPort",
        pid
    );

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut command = Command::new("powershell");
    command.args(&["-Command", &ps_script])
        .stdout(Stdio::piped());

    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.spawn()
        .expect("Failed to start PowerShell command")
        .stdout
        .expect("Failed to open stdout");

    let reader = BufReader::new(output);
    let mut ports = Vec::new();

    for line in reader.lines().filter_map(|l| l.ok()) {
        if let Ok(port) = line.parse::<u16>() {
            ports.push(port);
        }
    }

    ports
}

// Get local hostname
pub fn get_hostname() -> std::io::Result<String> {
    let mut hostname = hostname::get()?.into_string().unwrap_or_else(|_| "localhost".into());

    match domain_to_ascii(&hostname) { //PC with hostname using non-english characters can cause issues
        Ok(punycode) => {
            hostname = punycode;
        }
        Err(e) => {
            error!("Error converting hostname to Punycode: {}", e);
        }
    }
    Ok(hostname)
}

// Get game PID
pub fn find_pid_of(process_name: &str) -> Vec<String> {
    let mut system = System::new_all();
    let mut pids = Vec::new();
    system.refresh_all();

    for (pid, process) in system.processes() {
        if process.name().to_lowercase() == process_name.to_lowercase() {
            pids.push(pid.to_string());
        }
    }

    pids
}

// Puts a socket into promiscuous mode so that it can receive all packets.
async fn enter_promiscuous(socket: &mut StdSocket) -> Result<()> {
    let rc = unsafe {
        let in_value: DWORD = 1;

        let mut out: DWORD = 0;
        winsock2::WSAIoctl(
            socket.as_raw_socket() as usize,
            SIO_RCVALL,
            &in_value as *const _ as *mut _,
            size_of_val(&in_value) as DWORD,
            null_mut(), //out value
            0, //size of out value
            &mut out as *mut _, //byte returned
            null_mut(), //pointer zero
            None,
        )
    };
    if rc == winsock2::SOCKET_ERROR {
        bail!("WSAIoctl() failed: {}", unsafe { winsock2::WSAGetLastError() })
    } else {
        Ok(())
    }
}

// Creates a raw socket used to capture packets (disguised as a UdpSocket)
pub async fn create_raw_socket(socket_addr: SocketAddr) -> Result<UdpSocket> {
    // Specify protocol
    let protocol = Protocol::UDP; // IPPROTO_IP is typically 0

    // Check if IPv4 or IPv6
    let domain = match socket_addr.ip() {
        IpAddr::V4(_) => Domain::IPV4,
        IpAddr::V6(_) => Domain::IPV6,
    };

    // Create a raw socket with domain, Type::RAW, and IPPROTO_IP
    let socket = Socket::new(domain, Type::RAW, Some(protocol))?;
    socket.set_nonblocking(true)?;

    // Convert SocketAddr to SockAddr
    let sock_addr = socket2::SockAddr::from(socket_addr);

    // Bind the socket using a reference to the parsed address
    socket.bind(&sock_addr)?;

    // Raw socket
    let raw_socket = socket.into_raw_socket();
    let mut socket = unsafe { StdSocket::from_raw_socket(raw_socket) };
    enter_promiscuous(&mut socket).await?;

    // Set a read timeout of 500ms
    socket.set_read_timeout(Some(Duration::from_millis(500)))?;

    let socket = UdpSocket::from_std(socket)?;
    Ok(socket)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plausible_sot_ports_are_in_the_expected_range() {
        // Sea of Thieves game servers live in [30000, 40000)
        assert!(is_plausible_sot_port(30000));
        assert!(is_plausible_sot_port(35000));
        assert!(is_plausible_sot_port(39999));

        assert!(!is_plausible_sot_port(29999));
        assert!(!is_plausible_sot_port(40000));
        assert!(!is_plausible_sot_port(0));
        assert!(!is_plausible_sot_port(3075));
        assert!(!is_plausible_sot_port(443));
    }

    #[test]
    fn dynamic_sleep_matches_game_state() {
        assert_eq!(dynamic_sleep_ms(&GameStatus::Closed), 5000);
        assert_eq!(dynamic_sleep_ms(&GameStatus::Started), 3000);
        assert_eq!(dynamic_sleep_ms(&GameStatus::MainMenu), 500);
        assert_eq!(dynamic_sleep_ms(&GameStatus::InGame), 3000);
        assert_eq!(dynamic_sleep_ms(&GameStatus::Unknown), 2000);
    }
}
