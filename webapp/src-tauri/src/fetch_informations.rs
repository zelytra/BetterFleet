use std::io::{BufRead, BufReader};
use std::string::String;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::api::Api;
use etherparse::PacketHeaders;
use anyhow::{Result, bail};
use std::time::{Duration, Instant};
use socket2::{Domain, Protocol, Socket, Type};
use std::mem::size_of_val;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
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
use log::{info, warn, error};

const SIO_RCVALL: DWORD = 0x98000001;


pub async fn init() -> std::result::Result<Arc<RwLock<Api>>, anyhow::Error> {
    let api_base = Arc::new(RwLock::new(Api::new()));
    let api = Arc::clone(&api_base);

    tokio::spawn(async move {
        loop {
            // Fetch pid game
            let pid = find_pid_of("SoTGame.exe");
            let game_status = api.read().await.game_status.clone();
            if pid.is_empty() {
                if game_status != GameStatus::Closed {
                    api.write().await.game_status = GameStatus::Closed;
                    info!("Game is closed");
                }
            } else {
                let pid = pid[0].parse().unwrap();
                // List of udp sockets used by the game
                let udp_connections = get_udp_connections(pid);
                let port_count = udp_connections.len();
                info!("{:?} | Port count: {}", udp_connections, port_count);

                // Update game_status
                if port_count == 0 { // 0 = First menu/launching
                    if game_status != GameStatus::Started {
                        api.write().await.game_status = GameStatus::Started;
                        info!("Game has started on PID {}", pid);
                    }
                } else if port_count == 1 { // Main menu
                    if game_status != GameStatus::MainMenu {
                        api.write().await.game_status = GameStatus::MainMenu;
                        api.write().await.main_menu_port = udp_connections[0];
                        info!("Game is in main menu with main menu port: {}", udp_connections[0]);
                    }
                } else {
                    // [old method] 2 sockets = connected to a server
                    // Some users uncounted problems with more than 2 UDP sockets connections changing to "else" instead of elseif

                    let mut listen_ports : Vec<u16>;
                    let mut main_menu_port = api.read().await.main_menu_port;
                    if main_menu_port == 0 {
                        // This may happen when BetterFleet was launched after the connection to the server
                        // So we use the old technic of netstat powershell which output in order, mainmenu = first udp socket
                        info!("Using netstat powershell to get main_menu_port");
                        let udp_connections = get_udp_connections_powershell(pid);
                        info!("{:?}", udp_connections);

                        //We absolutely need this in every case to get it filtered out later
                        main_menu_port = udp_connections[0];
                        api.write().await.main_menu_port = main_menu_port;
                    }

                    if port_count == 2 {
                        // Easy classical case with 2 udp connections
                        // Get UDP Listen port, that's the other one that is not main_menu_port
                        if udp_connections[0] == main_menu_port {
                            listen_ports = vec![udp_connections[1]];
                        } else {
                            listen_ports = vec![udp_connections[0]];
                        }
                    } else {
                        // More than 2 udp connections, this becomes more complex
                        // We're gonna try every ports except main menu
                        // This is not perfect but it's the best we can do
                        // 27 ports for main menu and 28 for in game ?

                        let old_port_count = api.read().await.port_count;
                        if old_port_count > 2 && old_port_count - 1 == port_count as i8 {
                            //Port count is decreasing, we can assume that the game is in the main menu
                            api.write().await.game_status = GameStatus::MainMenu;
                            info!("Port count decreased ({} -> {}), game is in main menu", old_port_count, port_count);
                            listen_ports = vec!();
                        } else {
                            if game_status == GameStatus::Unknown {
                                api.write().await.game_status = GameStatus::MainMenu;
                                info!("Game status is unknown, setting to main menu");
                            }
                            //listen_ports = find_outliers_iqr(&udp_connections);
                            listen_ports = udp_connections;
                        }
                    }

                    //Filter out main menu port
                    listen_ports.retain(|&x| x != main_menu_port);

                    info!("Listen ports: {:?} | Listen ports count: {}", listen_ports, listen_ports.len());

                    // Get hostname
                    let hostname = get_hostname().unwrap();

                    // We need to add the port to the hostname to get the IP
                    let hostname = format!("{}:0", hostname);
                    let ip_addresses = match hostname.to_socket_addrs() { //TODO Optimization: Cache ip_addresses
                        Ok(addrs) => addrs.map(|socket_addr| socket_addr.ip()).collect::<Vec<IpAddr>>(),
                        Err(e) => {
                            error!("Error getting IP addresses: {}", e);
                            continue;
                        }
                    };

                    // Object for each "local" IP used by every network interface (ipv4 and ipv6)
                    let socket_addresses: Vec<SocketAddr> = ip_addresses.into_iter().map(|ip| SocketAddr::new(ip, 0)).collect();
                    for socket_addr in socket_addresses {
                        let api_clone = Arc::clone(&api);
                        let listen_ports_clone = listen_ports.clone();

                        spawn_thread(socket_addr, api_clone, listen_ports_clone);
                    }
                }
                api.write().await.port_count = port_count as i8;

            }

            let dynamic_time = match game_status {
                GameStatus::Closed => 5000,
                GameStatus::Started => 3000,
                GameStatus::MainMenu => 500,
                GameStatus::InGame => 3000,
                GameStatus::Unknown => 2000,
            };

            info!("Sleeping for {} | Game status: {:?} ", dynamic_time, game_status);
            tokio::time::sleep(Duration::from_millis(dynamic_time)).await;
        }
    });

    Ok(api_base)
}

fn spawn_thread(socket_addr: SocketAddr, api_clone: Arc<RwLock<Api>>, listen_ports_clone: Vec<u16>) {
    // One thread / IP
    tokio::spawn(async move {
        // Init RAW listen socket
        let socket = match create_raw_socket(socket_addr).await {
            Ok(socket) => socket,
            Err(e) => {
                error!("Error creating raw socket: {}", e);
                return;
            }
        };

        // Capture the IP by filtering headers
        match capture_ip(socket, listen_ports_clone).await {
            Some((ip, port, local_port)) => {
                info!("Found IP: {} | Distant port: {} | Local port: {}", ip, port, local_port);
                // Got an IP, lock api and update every information
                let mut api_lock = api_clone.write().await;
                api_lock.game_status = GameStatus::InGame;
                api_lock.server_ip = ip;
                api_lock.server_port = port;
                api_lock.last_updated_server_ip = Instant::now();

                // Release the lock
                drop(api_lock);
            }

            None => {
                // Got no result, get the last update time and check if it's too old
                // This is not a typical timeout and should never happen, it's a security
                let last_updated_server_ip = api_clone.read().await.last_updated_server_ip;
                let last_server_ip = api_clone.read().await.server_ip.clone();
                if last_updated_server_ip.elapsed() > Duration::from_secs(15) && last_server_ip != ""{
                    info!("Resetting server_ip, no result");
                    let mut api_lock = api_clone.write().await;

                    api_lock.game_status = GameStatus::MainMenu; //We assume that since the great "udp socket disaster"
                    api_lock.server_ip = String::new();
                    api_lock.server_port = 0;
                    api_lock.last_updated_server_ip = Instant::now();

                    drop(api_lock);
                }
            }
        }
    });
}

// Fetch game UDP connections
fn get_udp_connections(target_pid: usize) -> Vec<u16> {
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
fn get_udp_connections_powershell(pid: usize) -> Vec<u16> {
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

// Receive & filter packets to get the server IP
async fn capture_ip(socket: UdpSocket, listen_ports: Vec<u16>) -> Option<(String, u16, u16)> {
    let mut buf = [0u8; (256 * 256) - 1];
    let timeout = Duration::from_millis(500); // This needs to be lower than the main loop sleep duration
    let start_time = Instant::now();

    loop {
        if start_time.elapsed() > timeout {
            // Timeout reached without receiving a packet
            return None;
        }

        // select! macro is used to wait for the first of two futures to complete, returning the result of that future.
        tokio::select! {
            recv_result = socket.recv(&mut buf) => {
                match recv_result {
                    Ok(len) if len > 0 => {
                        // We got a packet, let's parse it
                        let recv_result = socket.recv(&mut buf).await;
                        return match recv_result {
                            Ok(len) => {
                                let packet = PacketHeaders::from_ip_slice(&buf[0..len]).ok()?;

                                let net = packet.net.unwrap();
                                let transport = packet.transport.unwrap();

                                // Parse source_ip and destination_ip
                                let (source_ip, destination_ip) = match net {
                                    etherparse::NetHeaders::Ipv4(header, _) => {
                                        let source = std::net::Ipv4Addr::new(header.source[0], header.source[1], header.source[2], header.source[3]);
                                        let destination = std::net::Ipv4Addr::new(header.destination[0], header.destination[1], header.destination[2], header.destination[3]);
                                        (source.to_string(), destination.to_string())
                                    },
                                    etherparse::NetHeaders::Ipv6(header, _) => {
                                        let source = std::net::Ipv6Addr::from(header.source);
                                        let destination = std::net::Ipv6Addr::from(header.destination);
                                        (source.to_string(), destination.to_string())
                                    },
                                };

                                let source_port;
                                let destination_port;

                                // Parse ports, we don't need to support anything else than UDP
                                match transport {
                                    etherparse::TransportHeader::Udp(header) => {
                                        source_port = header.source_port;
                                        destination_port = header.destination_port;
                                    },
                                    _ => return None
                                }

                                let mut remote_ip = String::new();
                                let mut remote_port = 0;
                                let mut local_port = 0;

                                if listen_ports.contains(&source_port) {
                                    // We are the source
                                    remote_ip = destination_ip;
                                    remote_port = destination_port;
                                    local_port = source_port;
                                } else if listen_ports.contains(&destination_port) {
                                    // We are the destination
                                    remote_ip = source_ip;
                                    remote_port = source_port;
                                    local_port = destination_port;
                                }

                                if remote_port >= 30000 && remote_port < 40000 {
                                    // Got a plausible result
                                    Some((remote_ip, remote_port, local_port))
                                } else {
                                    // Result make no sense for SoT
                                    // port 3075 may happen when switching from main menu to "rise anchor" interface.
                                    if remote_port != 0 && remote_port != 3075 {
                                        warn!("Result make no sense for SoT: {} {} (Local port {})", remote_ip, remote_port, local_port);
                                    }
                                    continue;
                                }
                            }
                            Err(err) => {
                                error!("Error receiving packet: {}", err);
                                None
                            }
                        }
                    },

                    Ok(_) => continue,
                    Err(e) => error!("Error receiving packet: {}", e),
                }
            }
            _ = tokio::time::sleep(timeout) => {
                // Timeout reached without receiving a packet
                return None;
            }
        }
    }
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