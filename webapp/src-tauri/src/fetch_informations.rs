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

/// How long each detection window sniffs traffic before ranking flows. Sized with the session
/// flow in mind: it can drip as slowly as one packet every ~5s (live capture, 2026-07-21: 4
/// packets in 20s), so together with the short in-game gap the loop must keep a high duty cycle
/// or resolving the session identity takes the better part of a minute.
const CAPTURE_WINDOW_MS: u64 = 2000;
/// Minimum packets a plausible-SoT flow must carry within a window to be accepted as the busy
/// gameplay host — our "in a game" signal AND the guard on the connection identity. The host
/// pushes ~50-90 packets per second (corpus-weakest: 941 pkts/20s ≈ 94 per 2s window) while the
/// session coordinator peaks around 5-6 packets per window, so 25 sits far above any sparse
/// burst and far below any real host. It must stay well above the coordinator's burst rate:
/// were a coordinator burst ever taken as "the host", its (ip, local port) would fake a
/// connection change and wipe the whole accumulated identity. A genuinely stalling host that
/// drops under this floor is simply treated as absent, which the 12s grace absorbs.
const MIN_SERVER_PACKETS: u32 = 25;
/// Minimum ACCUMULATED packets for the sparse per-server session flow to be trusted as the server
/// identity. Unlike the busy host, this flow is only a handful of packets spread across the whole
/// session, so it is caught across several capture windows (see the accumulator in `init`) — the
/// floor is low and only rejects one-off stray packets. pick_session_flow also requires it to be
/// bidirectional. Tunable if in-game validation shows the session resolves too slowly / too eagerly.
const MIN_SESSION_PACKETS: u32 = 3;
/// Keep showing the last known server through brief gaps in traffic; only fall back to
/// the main menu once no host flow has been seen for this long. Avoids flapping.
const SERVER_LOST_GRACE_SECS: u64 = 12;

/// Decides which session endpoint `(local_port, remote_ip, remote_port)` to report for the CURRENT
/// game connection, given the flows accumulated so far. Once an endpoint is locked it is sticky:
/// it only moves to a different candidate when that candidate has accumulated at least TWICE the
/// locked flow's packets — a genuine early mispick being corrected — never on transient ranking
/// noise. Without the stickiness the reported server (and its card in the fleet) flaps whenever
/// two sparse flows trade places in the accumulation. A quiet spell (no candidate this cycle)
/// keeps the lock: the session flow duty-cycles, and identity is not a liveness signal — the busy
/// host flow is. Pure so the locking policy is unit-tested deterministically.
pub(crate) fn update_session_lock(
    locked: Option<(u16, String, u16)>,
    accumulated: &[crate::diagnostics::FlowStat],
    min_packets: u32,
) -> Option<(u16, String, u16)> {
    let candidate = match crate::diagnostics::pick_session_flow(accumulated, min_packets) {
        Some(c) => c,
        None => return locked,
    };
    let candidate_key = (
        candidate.local_port,
        candidate.remote_ip.clone(),
        candidate.remote_port,
    );
    let lock = match locked {
        Some(lock) => lock,
        None => return Some(candidate_key),
    };
    if candidate_key == lock {
        return Some(lock);
    }
    let locked_packets = accumulated
        .iter()
        .find(|f| {
            (f.local_port, f.remote_ip.as_str(), f.remote_port)
                == (lock.0, lock.1.as_str(), lock.2)
        })
        .map_or(0, |f| f.packets);
    // The locked flow vanished from the accumulation (cleared under us) or is dwarfed: relock.
    if locked_packets == 0 || candidate.packets >= locked_packets.saturating_mul(2) {
        info!(
            "Session relock: {}:{} -> {}:{} ({} vs {} pkts accumulated)",
            lock.1, lock.2, candidate.remote_ip, candidate.remote_port, locked_packets, candidate.packets
        );
        Some(candidate_key)
    } else {
        Some(lock)
    }
}

/// Drops from a captured window every flow whose exact (local_port, remote_ip, remote_port) key
/// was quarantined at the last connection change — the previous game's flows, still visible while
/// its socket tears down. New-game flows always carry fresh keys, so they pass untouched.
pub(crate) fn drop_quarantined(
    window: &[crate::diagnostics::FlowStat],
    quarantine: &std::collections::HashSet<(u16, String, u16)>,
) -> Vec<crate::diagnostics::FlowStat> {
    window
        .iter()
        .filter(|f| !quarantine.contains(&(f.local_port, f.remote_ip.clone(), f.remote_port)))
        .cloned()
        .collect()
}

pub async fn init() -> std::result::Result<Arc<RwLock<Api>>, anyhow::Error> {
    let api_base = Arc::new(RwLock::new(Api::new()));
    let api = Arc::clone(&api_base);

    tokio::spawn(async move {
        // Per-game accumulator of UDP flows. The sparse per-server session flow is only a handful of
        // packets across the whole session, so a single capture window often misses it; merging
        // windows lets us lock onto it reliably. Reset on leaving the game or when the connection
        // changes.
        let mut game_flows: std::collections::HashMap<(u16, String, u16), crate::diagnostics::FlowStat> =
            std::collections::HashMap::new();
        // The game CONNECTION we are accumulating for: (host remote ip, host LOCAL port). The local
        // port — not the host IP — is what identifies a game: consecutive servers very often share
        // one Azure host IP (the whole #364 story; live testing hit 51.103.72.36 across several
        // distinct servers in a row), but the game opens a fresh socket per server, so a new local
        // port means a new game even on an identical host IP. Keying the reset on the host IP alone
        // let the previous game's session flow — which had the entire session to accumulate — stay
        // in the map and outweigh the new server's coordinator forever (stale identity, seen live
        // on 2026-07-21 as two split players still showing one shared card).
        let mut game_connection: Option<(String, u16)> = None;
        // The session endpoint locked for this connection (see update_session_lock).
        let mut locked_session: Option<(u16, String, u16)> = None;
        // Flow keys of the PREVIOUS game, quarantined at the connection change. The window that
        // reveals a server switch was captured while the old socket was still open, so it carries
        // the old host's teardown and the old coordinator's stragglers; merged unfiltered, they
        // would re-seed the freshly cleared accumulator and get locked as the "session" (the old
        // server's identity, or a phantom per-client host endpoint). Old flows keep their exact
        // (local_port, remote_ip, remote_port) key, so key-level filtering removes them without
        // touching the new game's flows, however long the teardown lingers.
        let mut quarantine: std::collections::HashSet<(u16, String, u16)> =
            std::collections::HashSet::new();

        loop {
            let pid = find_pid_of("SoTGame.exe");

            // No game process -> closed.
            if pid.is_empty() {
                let mut api_lock = api.write().await;
                if api_lock.game_status != GameStatus::Closed {
                    api_lock.game_status = GameStatus::Closed;
                    api_lock.server_ip = String::new();
                    api_lock.server_port = 0;
                    game_flows.clear();
                    game_connection = None;
                    locked_session = None;
                    quarantine.clear();
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

            // Game process but no UDP sockets -> still launching. UNLESS we are mid-game: an empty
            // list there is almost always a transient socket-table enumeration failure
            // (get_udp_connections returns empty on error too), and regressing the status to
            // Started makes the frontend leave + rejoin the server — a fleet-visible flap from one
            // failed netstat call. Hold the InGame state instead and let the 12s host-silence
            // grace decide, exactly as for a quiet capture window.
            let udp_ports = get_udp_connections(pid);
            if udp_ports.is_empty() {
                if game_connection.is_none() {
                    let mut api_lock = api.write().await;
                    if api_lock.game_status != GameStatus::Started {
                        api_lock.game_status = GameStatus::Started;
                        info!("Game is launching (no UDP sockets yet) on PID {}", pid);
                    }
                    drop(api_lock);
                } else {
                    let last_updated = api.read().await.last_updated_server_ip;
                    if last_updated.elapsed() > Duration::from_secs(SERVER_LOST_GRACE_SECS) {
                        game_flows.clear();
                        game_connection = None;
                        locked_session = None;
                        quarantine.clear();
                        let mut api_lock = api.write().await;
                        api_lock.game_status = GameStatus::MainMenu;
                        api_lock.server_ip = String::new();
                        api_lock.server_port = 0;
                        api_lock.last_updated_server_ip = Instant::now();
                        drop(api_lock);
                        info!(
                            "Left the game (no UDP sockets for {}s), back to main menu",
                            SERVER_LOST_GRACE_SECS
                        );
                    }
                }
                tokio::time::sleep(Duration::from_millis(dynamic_sleep_ms(&GameStatus::Started)))
                    .await;
                continue;
            }

            // Sniff every game UDP port for a short window and rank the flows by volume. The busy
            // plausible-SoT flow is the Azure gameplay host — a reliable "in a game" signal, but its
            // IP is reused across different servers, so it is NOT the server identity. The identity is
            // the sparse per-server session flow (issue #364): a handful of packets spread over the
            // whole session, shared by everyone on the world instance. Because a single window often
            // misses it, we accumulate windows per game and lock onto it once it appears.
            let port_count = udp_ports.len();
            let window_flows = crate::diagnostics::capture_flows(
                udp_ports,
                Duration::from_millis(CAPTURE_WINDOW_MS),
            )
            .await;

            match crate::diagnostics::pick_server_flow(&window_flows, MIN_SERVER_PACKETS) {
                Some(host) => {
                    // In a game. A new CONNECTION (host ip + local port) means a new game — drop the
                    // old accumulation and lock. Comparing host IPs is not enough: different servers
                    // share one Azure host, and the previous game's session flow would otherwise
                    // out-accumulate the new one forever.
                    let connection = (host.remote_ip.clone(), host.local_port);
                    if game_connection.as_ref() != Some(&connection) {
                        if game_connection.is_some() {
                            info!(
                                "New game connection to {} (local port {}), dropping the previous game's flows",
                                host.remote_ip, host.local_port
                            );
                        }
                        // Everything accumulated so far belongs to the previous game; quarantine
                        // those exact flow keys so the very window that revealed the switch (and
                        // any lingering teardown after it) cannot re-seed them into the fresh
                        // accumulator. See the quarantine declaration for the failure this stops.
                        quarantine = game_flows.keys().cloned().collect();
                        game_flows.clear();
                        locked_session = None;
                        game_connection = Some(connection);
                    }

                    // Accumulate this window — minus quarantined old-game flows — then (re)settle
                    // the locked session endpoint.
                    let clean_window = drop_quarantined(&window_flows, &quarantine);
                    crate::diagnostics::merge_flows(&mut game_flows, &clean_window);
                    let accumulated: Vec<crate::diagnostics::FlowStat> =
                        game_flows.values().cloned().collect();
                    locked_session =
                        update_session_lock(locked_session.take(), &accumulated, MIN_SESSION_PACKETS);

                    // Until the session flow resolves, report in-game with NO server rather than the
                    // ambiguous host IP — the fleet must never group players merely by a shared host.
                    let (ip, port) = match &locked_session {
                        Some((_, ip, port)) => (ip.clone(), *port),
                        None => (String::new(), 0),
                    };

                    let mut api_lock = api.write().await;
                    let changed = api_lock.game_status != GameStatus::InGame
                        || api_lock.server_ip != ip
                        || api_lock.server_port != port;
                    api_lock.game_status = GameStatus::InGame;
                    api_lock.server_ip = ip.clone();
                    api_lock.server_port = port;
                    api_lock.last_updated_server_ip = Instant::now();
                    drop(api_lock);
                    if changed {
                        if ip.is_empty() {
                            info!(
                                "In game on host {} — resolving the session flow ({} game ports)",
                                host.remote_ip, port_count
                            );
                        } else {
                            let session_packets = locked_session
                                .as_ref()
                                .and_then(|(lp, sip, sport)| {
                                    game_flows.get(&(*lp, sip.clone(), *sport))
                                })
                                .map_or(0, |f| f.packets);
                            info!(
                                "Server detected: session {}:{} on host {} ({} pkts accumulated, {} game ports)",
                                ip, port, host.remote_ip, session_packets, port_count
                            );
                        }
                    }
                }
                None => {
                    if game_connection.is_some() {
                        // We were in a game; hold through brief gaps in host traffic to avoid flapping,
                        // then fall back to the menu once the host has been silent past the grace.
                        let last_updated = api.read().await.last_updated_server_ip;
                        if last_updated.elapsed() > Duration::from_secs(SERVER_LOST_GRACE_SECS) {
                            game_flows.clear();
                            game_connection = None;
                            locked_session = None;
                            quarantine.clear();
                            let mut api_lock = api.write().await;
                            api_lock.game_status = GameStatus::MainMenu;
                            api_lock.server_ip = String::new();
                            api_lock.server_port = 0;
                            api_lock.last_updated_server_ip = Instant::now();
                            drop(api_lock);
                            info!(
                                "Left the game (no host traffic for {}s), back to main menu",
                                SERVER_LOST_GRACE_SECS
                            );
                        } else {
                            // Still holding: the game is deemed alive, so the window's packets count.
                            // The session flow drips ~1 packet every 2.5-5s and the host is known to
                            // gap — discarding host-silent windows would throw away exactly the
                            // packets the identity is waiting for and stretch resolution.
                            let clean_window = drop_quarantined(&window_flows, &quarantine);
                            crate::diagnostics::merge_flows(&mut game_flows, &clean_window);
                            let accumulated: Vec<crate::diagnostics::FlowStat> =
                                game_flows.values().cloned().collect();
                            locked_session = update_session_lock(
                                locked_session.take(),
                                &accumulated,
                                MIN_SESSION_PACKETS,
                            );
                            // If this very window completed the lock, publish it — the status is
                            // still InGame under the grace, only the identity was missing.
                            if let Some((_, ip, port)) = &locked_session {
                                let mut api_lock = api.write().await;
                                if api_lock.game_status == GameStatus::InGame
                                    && api_lock.server_ip.is_empty()
                                {
                                    api_lock.server_ip = ip.clone();
                                    api_lock.server_port = *port;
                                    info!(
                                        "Server detected during a host gap: session {}:{}",
                                        ip, port
                                    );
                                }
                            }
                        }
                    } else {
                        let mut api_lock = api.write().await;
                        if api_lock.game_status != GameStatus::MainMenu {
                            api_lock.game_status = GameStatus::MainMenu;
                            info!("In main menu (no host flow on {} game ports)", port_count);
                        }
                    }
                }
            }

            // The capture window itself paces the loop; add a small gap before the next window.
            // In game the gap stays SHORT: the session flow drips a packet every few seconds and
            // every closed-window second is a chance to miss one, delaying identity resolution.
            let in_game = api.read().await.game_status == GameStatus::InGame;
            let gap_ms = if in_game { 1000 } else { 400 };
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

    use crate::diagnostics::FlowStat;

    fn flow(local: u16, ip: &str, port: u16, packets: u32, inbound: u32, outbound: u32) -> FlowStat {
        FlowStat {
            local_port: local,
            remote_ip: ip.to_string(),
            remote_port: port,
            packets,
            bytes: packets as u64 * 76,
            inbound,
            outbound,
            plausible_sot_port: is_plausible_sot_port(port),
            first_seen_ms: 0,
            last_seen_ms: 1000,
        }
    }

    /// The busy host flow present in every in-game accumulation.
    fn host() -> FlowStat {
        flow(55306, "51.103.72.36", 31037, 1109, 596, 513)
    }

    #[test]
    fn the_session_lock_is_acquired_once_a_candidate_qualifies() {
        let accumulated = [host(), flow(52354, "145.190.66.42", 30034, 4, 2, 2)];
        let lock = update_session_lock(None, &accumulated, 3);
        assert_eq!(lock, Some((52354, "145.190.66.42".to_string(), 30034)));
    }

    #[test]
    fn no_candidate_keeps_the_current_lock_through_quiet_spells() {
        // The session flow duty-cycles (live capture: active 10s out of 20s). Its silence must not
        // drop the lock — identity is not liveness.
        let lock = Some((52354, "145.190.66.42".to_string(), 30034));
        let accumulated = [host()];
        assert_eq!(update_session_lock(lock.clone(), &accumulated, 3), lock);
    }

    #[test]
    fn a_slightly_busier_rival_does_not_steal_the_lock() {
        // Two sparse flows trading places in the accumulation must not flap the reported server.
        let lock = Some((52354, "145.190.66.42".to_string(), 30034));
        let accumulated = [
            host(),
            flow(52354, "145.190.66.42", 30034, 6, 3, 3),
            flow(52999, "20.33.49.115", 31260, 8, 4, 4), // busier, but < 2x
        ];
        assert_eq!(update_session_lock(lock.clone(), &accumulated, 3), lock);
    }

    #[test]
    fn a_dominant_rival_corrects_an_early_mispick() {
        // If the first lock was noise, the real coordinator out-accumulates it 2x and takes over.
        let lock = Some((52999, "20.9.9.9".to_string(), 35001));
        let accumulated = [
            host(),
            flow(52999, "20.9.9.9", 35001, 3, 2, 1),
            flow(52354, "145.190.66.42", 30034, 7, 4, 3), // >= 2x the locked flow
        ];
        assert_eq!(
            update_session_lock(lock, &accumulated, 3),
            Some((52354, "145.190.66.42".to_string(), 30034))
        );
    }

    #[test]
    fn the_stale_previous_game_session_flow_must_be_cleared_not_outranked() {
        // The live false positive of 2026-07-21: after a server switch on the SAME Azure host, the
        // previous game's session flow (a whole session of accumulation) can never be outranked by
        // the new server's coordinator within a play session — 2x of hundreds is unreachable at
        // ~1 packet per 2.5s. This pins WHY the loop must clear the accumulation per CONNECTION
        // (host ip + local port) instead of per host IP: with the stale flow still in the map, the
        // lock stays on the OLD server's endpoint.
        let stale_lock = Some((52354, "145.190.66.42".to_string(), 30034));
        let accumulated = [
            flow(60445, "51.103.72.36", 30686, 970, 596, 374), // NEW connection, same host IP
            flow(52354, "145.190.66.42", 30034, 240, 120, 120), // stale: a full session accumulated
            flow(55329, "145.190.66.42", 30099, 8, 4, 4),      // the new server's coordinator
        ];
        // Without clearing, the stale endpoint wins — the false merge observed live.
        assert_eq!(
            update_session_lock(stale_lock, &accumulated, 3),
            Some((52354, "145.190.66.42".to_string(), 30034))
        );
        // After the per-connection clear (what the loop now does), the new coordinator locks.
        let cleared = [
            flow(60445, "51.103.72.36", 30686, 970, 596, 374),
            flow(55329, "145.190.66.42", 30099, 8, 4, 4),
        ];
        assert_eq!(
            update_session_lock(None, &cleared, 3),
            Some((55329, "145.190.66.42".to_string(), 30099))
        );
    }

    #[test]
    fn quarantine_drops_exactly_the_old_games_flows() {
        // The window that reveals a server switch still carries the old game's teardown; the keys
        // quarantined at the switch must vanish from it while the new game's flows pass untouched.
        let quarantine: std::collections::HashSet<(u16, String, u16)> = [
            (55306u16, "51.103.72.36".to_string(), 31037u16), // old host
            (52354u16, "145.190.66.42".to_string(), 30034u16), // old coordinator
        ]
        .into_iter()
        .collect();
        let window = [
            flow(55306, "51.103.72.36", 31037, 30, 15, 15), // old host teardown residual
            flow(52354, "145.190.66.42", 30034, 3, 2, 1),   // old coordinator straggler
            flow(60445, "51.103.72.36", 30686, 450, 226, 224), // NEW host (same host IP!)
            flow(55329, "145.190.66.42", 30099, 2, 1, 1),   // NEW coordinator
        ];

        let clean = drop_quarantined(&window, &quarantine);
        let kept: Vec<(u16, u16)> = clean.iter().map(|f| (f.local_port, f.remote_port)).collect();
        assert_eq!(kept, vec![(60445, 30686), (55329, 30099)]);
    }

    #[test]
    fn a_transition_window_cannot_lock_the_old_game_onto_a_fresh_accumulator() {
        // The full straddling-window scenario from the adversarial review: server switch on one
        // Azure host, the revealing window carries the old host's teardown AND the old
        // coordinator's last exchange. After quarantine + the sparse-vs-host guard, neither can be
        // locked; the session stays unresolved until the NEW coordinator accumulates.
        let quarantine: std::collections::HashSet<(u16, String, u16)> = [
            (55306u16, "51.103.72.36".to_string(), 31037u16),
            (52354u16, "145.190.66.42".to_string(), 30034u16),
        ]
        .into_iter()
        .collect();
        let window = [
            flow(60445, "51.103.72.36", 30686, 450, 226, 224), // new host
            flow(55306, "51.103.72.36", 31037, 300, 150, 150), // old host, bidirectional, plausible
            flow(52354, "145.190.66.42", 30034, 3, 2, 1),      // old coordinator's last exchange
        ];

        let clean = drop_quarantined(&window, &quarantine);
        assert_eq!(
            update_session_lock(None, &clean, 3),
            None,
            "nothing from the old game may be locked as the new game's session"
        );
    }
}
