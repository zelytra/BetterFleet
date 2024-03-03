use std::string::String;
use std::io::{BufRead, BufReader};
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
use std::process::{Command, Stdio};
use std::ptr::null_mut;
use winapi::shared::minwindef::DWORD;
use winapi::um::winsock2;
use crate::api::GameStatus;
use sysinfo::{System};

const SIO_RCVALL: DWORD = 0x98000001;


pub async fn init() -> std::result::Result<Arc<RwLock<Api>>, anyhow::Error> {
    let api_base = Arc::new(RwLock::new(Api::new()));
    let api  = Arc::clone(&api_base);

    tokio::spawn(async move {
        loop {
            let pid = find_pid_of("SoTGame.exe");
            //println!("PID: {:?}", pid);

            if pid.is_empty() {
                api.write().await.game_status = GameStatus::Closed;
            } else {
                let pid = pid[0].parse().unwrap();
                let udp_connections = get_udp_connections(pid);
                //println!("UDP connections: {:?}", udp_connections);

                // Update game_status
                if udp_connections.len() != 2 {
                    api.write().await.game_status = match udp_connections.len() { //TODO Optimization: Cache game_status and only update when it changes
                        0 => GameStatus::Started,
                        1 => GameStatus::MainMenu,
                        _ => GameStatus::Unknown
                    };
                }

                if udp_connections.len() == 2 {
                    // Get UDP Listen port
                    let listen_port = udp_connections[1]; // The first one is for MainMenu

                    // Get IPs associated to hostname
                    let hostname = match get_local_hostname() {
                        Ok(hn) => hn,
                        Err(e) => {
                            eprintln!("Error getting local hostname: {}", e);
                            continue;
                        }
                    };

                    let hostname = format!("{}:0", hostname);

                    let ip_addresses = match hostname.to_socket_addrs() { //TODO Optimization: Cache IP ADDRESSES
                        Ok(addrs) => addrs.map(|socket_addr| socket_addr.ip()).collect::<Vec<IpAddr>>(),
                        Err(e) => {
                            eprintln!("Error getting IP addresses: {}", e);
                            continue;
                        }
                    };

                    println!("IP addresses: {:?}", ip_addresses);

                    let socket_addresses: Vec<SocketAddr> = ip_addresses.into_iter().map(|ip| SocketAddr::new(ip, 0)).collect();

                    for socket_addr in socket_addresses {
                        // One thread / ip
                        let api_clone = Arc::clone(&api);
                        tokio::spawn(async move {
                            let socket = match create_raw_socket(socket_addr).await {
                                Ok(socket) => socket,
                                Err(e) => {
                                    eprintln!("Error creating raw socket: {}", e);
                                    return;
                                }
                            };

                            match capture_ip(socket, listen_port).await {
                                Some((ip, port)) => {
                                    // Acquire the lock for modifying shared data
                                    let mut api_lock = api_clone.write().await;
                                    api_lock.game_status = GameStatus::InGame;
                                    api_lock.server_ip = ip;
                                    api_lock.server_port = port;
                                    api_lock.last_updated_server_ip = Instant::now();

                                    // Release the lock
                                    drop(api_lock);
                                }

                                None => {
                                    let last_updated_server_ip = api_clone.read().await.last_updated_server_ip;

                                    // When no result since > 20 seconds reset server_ip
                                    // This should never happen since when the player is not connected to a server, the game_status is MainMenu
                                    api_clone.write().await.game_status = GameStatus::InGameNotLoaded;

                                    if last_updated_server_ip.elapsed() > Duration::from_secs(20) {
                                        println!("Resetting server_ip, no result");
                                        let mut api_lock = api_clone.write().await;

                                        api_lock.game_status = GameStatus::Unknown;
                                        api_lock.server_ip = String::new();
                                        api_lock.server_port = 0;
                                        api_lock.last_updated_server_ip = Instant::now();

                                        drop(api_lock);
                                    }
                                }
                            }
                        });
                    }
                }
            }

            let game_status = api.read().await.game_status.clone();
            let dynamic_time = match game_status {
                GameStatus::Closed => 5000,
                GameStatus::Started => 3000,
                GameStatus::MainMenu => 1000,
                GameStatus::InGameNotLoaded => 1000,
                GameStatus::InGame => 3000,
                GameStatus::Unknown => 2000,
            };
            println!("Game status: {:?}", game_status);
            println!("Dynamic time: {}", dynamic_time);
            tokio::time::sleep(Duration::from_millis(dynamic_time)).await;
        }
    });

    Ok(api_base)
}

fn get_udp_connections(pid: usize) -> Vec<u16> {
    let ps_script = format!(
        "Get-NetUDPEndpoint -OwningProcess {} | Select-Object -ExpandProperty LocalPort",
        pid
    );
    let output = Command::new("powershell")
        .args(&["-Command", &ps_script])
        .stdout(Stdio::piped())
        .spawn()
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

fn get_local_hostname() -> std::io::Result<String> {
    Ok(hostname::get()?.into_string().unwrap_or_else(|_| "localhost".into()))
}

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

async fn capture_ip(socket: UdpSocket, listen_port: u16) -> Option<(String, u16)> {
    let mut buf = [0u8; (256 * 256) - 1];
    let timeout = Duration::from_millis(3000);
    let start_time = Instant::now();

    loop {
        if start_time.elapsed() > timeout {
            // Timeout reached without receiving a packet
            return None;
        }

        tokio::select! {
            recv_result = socket.recv(&mut buf) => {
                match recv_result {
                    Ok(len) if len > 0 => {
                        let recv_result = socket.recv(&mut buf).await;
                        //println!("{:?}", recv_result);
                        return match recv_result {
                            Ok(len) => {
                                let packet = PacketHeaders::from_ip_slice(&buf[0..len]).ok()?;
                                //println!("{:?}", packet.transport);

                                let net = packet.net.unwrap();
                                let transport = packet.transport.unwrap();

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

                                match transport {
                                    etherparse::TransportHeader::Tcp(header) => {
                                        source_port = header.source_port;
                                        destination_port = header.destination_port;
                                    },
                                    etherparse::TransportHeader::Udp(header) => {
                                        source_port = header.source_port;
                                        destination_port = header.destination_port;
                                    },
                                    _ => {
                                        eprintln!("Unsupported transport protocol");
                                        return None;
                                    }
                                }

                                let mut remote_ip = String::new();
                                let mut remote_port = 0;

                                if source_port == listen_port {
                                    remote_ip = destination_ip;
                                    remote_port = destination_port;
                                } else if destination_port == listen_port {
                                    remote_ip = source_ip;
                                    remote_port = source_port;
                                }

                                if remote_port > 30000 && remote_port < 40000 {
                                    println!("---------------------------------");
                                    println!("Remote IP: {} Remote Port: {}", remote_ip, remote_port);
                                    println!("---------------------------------");
                                    Some((remote_ip, remote_port))
                                } else {
                                    // Result make no sense for SoT
                                    None
                                }
                            }
                            Err(err) => {
                                eprintln!("Error receiving packet: {}", err);
                                None
                            }
                        }
                    },

                    Ok(_) => println!("No data received."),
                    Err(e) => eprintln!("Error receiving packet: {}", e),
                }
            }
            _ = tokio::time::sleep(timeout) => {
                // Timeout reached without receiving a packet
                return None;
            }
        }
    }
}


/// Puts a socket into promiscuous mode so that it can receive all packets.
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

/// Creates a raw socket used to capture packets (disguised as a UdpSocket)
pub async fn create_raw_socket(socket_addr: SocketAddr) -> Result<UdpSocket> {

    // Specify IPPROTO_IP explicitly by using Protocol::from_raw(0)
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

    let raw_socket = socket.into_raw_socket();
    let mut socket = unsafe { StdSocket::from_raw_socket(raw_socket) };
    enter_promiscuous(&mut socket).await?;

    // Set a read timeout of 500ms
    socket.set_read_timeout(Some(Duration::from_millis(500)))?;

    let socket = UdpSocket::from_std(socket)?;

    Ok(socket)
}
