//! Shared packet-capture core for BetterFleet server detection, and the primitives the
//! privilege-separated capture helper is built on (#726).
//!
//! Sea of Thieves server detection watches the game's UDP flows and ranks them by volume to tell the
//! real game server apart from the many sparse Steam Datagram Relay flows. Reaching those packets
//! needs a privileged socket on every OS: `AF_PACKET` (`CAP_NET_RAW`) on Linux, a promiscuous
//! `SOCK_RAW` driven by `WSAIoctl(SIO_RCVALL)` (Administrator) on Windows. Both backends live here,
//! in a crate that never links Tauri, behind one entry point - [`run_capture`] - so the privileged
//! work can run outside the GUI: the `betterfleet-netcap` binary already does that on Linux, and
//! #732 gives Windows the same shape through a service.
//!
//! Everything below the socket - [`parse_game_flow`], [`FlowAggregator`], the ranking - is shared
//! verbatim, so a capture is identical whichever OS and whichever process runs it.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use etherparse::PacketHeaders;
use serde::{Deserialize, Serialize};

#[cfg(any(target_os = "linux", windows))]
use log::error;
#[cfg(any(target_os = "linux", windows))]
use socket2::{Domain, Protocol, Socket, Type};
#[cfg(any(target_os = "linux", windows))]
use std::time::Instant;

#[cfg(windows)]
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
// Used by the Windows backend and by the tests that pin its read loop on every platform.
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(windows)]
use std::sync::Arc;
use std::sync::Mutex;

// The capture service's wire protocol (#816): pure frames + validation, testable on every
// platform. The pipe transport itself only exists where named pipes do.
pub mod service_proto;
#[cfg(windows)]
pub mod service_ipc;

/// One observed UDP conversation between a game-owned local port and a remote peer.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FlowStat {
    pub local_port: u16,
    pub remote_ip: String,
    pub remote_port: u16,
    pub packets: u32,
    pub bytes: u64,
    pub inbound: u32,
    pub outbound: u32,
    /// Remote port sits in the range Sea of Thieves game servers use.
    pub plausible_sot_port: bool,
    pub first_seen_ms: u64,
    pub last_seen_ms: u64,
}

/// Returns true when a remote UDP port falls in the range Sea of Thieves game servers use.
/// Extracted as a pure function so the core detection heuristic can be unit-tested.
pub fn is_plausible_sot_port(port: u16) -> bool {
    (30000..40000).contains(&port)
}

/// Aggregates observed UDP packets into per-flow statistics. Deliberately free of
/// any I/O so the aggregation and ranking can be unit-tested deterministically.
#[derive(Default)]
pub struct FlowAggregator {
    map: HashMap<(u16, String, u16), FlowStat>,
}

impl FlowAggregator {
    /// Record one packet on the flow (local_port <-> remote_ip:remote_port).
    /// `inbound` is true when the game is the destination, false when it's the source.
    pub fn observe(
        &mut self,
        local_port: u16,
        remote_ip: &str,
        remote_port: u16,
        len: usize,
        inbound: bool,
        t_ms: u64,
    ) {
        let entry = self
            .map
            .entry((local_port, remote_ip.to_string(), remote_port))
            .or_insert_with(|| FlowStat {
                local_port,
                remote_ip: remote_ip.to_string(),
                remote_port,
                packets: 0,
                bytes: 0,
                inbound: 0,
                outbound: 0,
                plausible_sot_port: is_plausible_sot_port(remote_port),
                first_seen_ms: t_ms,
                last_seen_ms: t_ms,
            });
        entry.packets += 1;
        entry.bytes += len as u64;
        if inbound {
            entry.inbound += 1;
        } else {
            entry.outbound += 1;
        }
        entry.last_seen_ms = t_ms;
    }

    /// Drains the aggregated flows, sorted by packet volume (desc), then bytes
    /// (desc), then local port (asc) for a stable order.
    pub fn take_sorted_flows(&mut self) -> Vec<FlowStat> {
        let mut flows: Vec<FlowStat> = std::mem::take(&mut self.map).into_values().collect();
        flows.sort_by(|a, b| {
            b.packets
                .cmp(&a.packets)
                .then(b.bytes.cmp(&a.bytes))
                .then(a.local_port.cmp(&b.local_port))
        });
        flows
    }
}

/// Parses one raw IP packet and, when it belongs to one of the game's UDP ports,
/// returns (game_local_port, remote_ip, remote_port, inbound).
pub fn parse_game_flow(bytes: &[u8], game_ports: &HashSet<u16>) -> Option<(u16, String, u16, bool)> {
    let packet = PacketHeaders::from_ip_slice(bytes).ok()?;

    let (source_ip, destination_ip) = match packet.net? {
        etherparse::NetHeaders::Ipv4(header, _) => (
            std::net::Ipv4Addr::from(header.source).to_string(),
            std::net::Ipv4Addr::from(header.destination).to_string(),
        ),
        etherparse::NetHeaders::Ipv6(header, _) => (
            std::net::Ipv6Addr::from(header.source).to_string(),
            std::net::Ipv6Addr::from(header.destination).to_string(),
        ),
    };

    let (source_port, destination_port) = match packet.transport? {
        etherparse::TransportHeader::Udp(header) => (header.source_port, header.destination_port),
        _ => return None,
    };

    if game_ports.contains(&source_port) {
        // Game is the source -> outbound
        Some((source_port, destination_ip, destination_port, false))
    } else if game_ports.contains(&destination_port) {
        // Game is the destination -> inbound
        Some((destination_port, source_ip, source_port, true))
    } else {
        None
    }
}

/// Runs one Linux `AF_PACKET` capture over `window` for the given game ports and returns the flows
/// ranked by volume (desc). This is the single entry point the capture helper and the in-process
/// fallback both call, so a capture is identical whichever process runs it.
#[cfg(target_os = "linux")]
pub fn run_capture(game_ports: Vec<u16>, window: Duration) -> Vec<FlowStat> {
    capture_af_packet(game_ports.into_iter().collect(), window)
}

/// What one capture window observed: the ranked flows, and how many packets the socket(s) received
/// *before* the game-port filter where the backend can count them.
///
/// The count is what tells "the capture itself received nothing" (a filter driver starving
/// `SIO_RCVALL`, a missing privilege) apart from "the game simply had no matching traffic" - both
/// otherwise yield zero flows. `None` means the backend cannot report it, which is deliberately
/// distinct from `Some(0)`.
#[derive(Debug, Clone, PartialEq)]
pub struct CaptureOutcome {
    pub flows: Vec<FlowStat>,
    pub raw_packets: Option<u64>,
}

/// Runs one Windows capture over `window` for the given game ports and returns the flows ranked by
/// volume (desc). Same entry point as the Linux arm, so the GUI, the helper and (from #732) the
/// capture service all drive an identical capture.
#[cfg(windows)]
pub fn run_capture(game_ports: Vec<u16>, window: Duration) -> Vec<FlowStat> {
    // Live detection does not need the raw count; give it a throwaway counter.
    capture_raw_sockets(
        game_ports.into_iter().collect(),
        window,
        &AtomicU64::new(0),
    )
    .0
}

/// Windows capture that also reports the raw packet count backing [`CaptureOutcome::raw_packets`].
#[cfg(windows)]
pub fn run_capture_counted(game_ports: Vec<u16>, window: Duration) -> CaptureOutcome {
    let raw_packets = AtomicU64::new(0);
    let (flows, opened) =
        capture_raw_sockets(game_ports.into_iter().collect(), window, &raw_packets);
    CaptureOutcome {
        flows,
        // No socket ever opened - no interface resolved, or every one refused the ioctl. That is
        // "we could not listen", not "we listened and heard nothing": reporting Some(0) here would
        // have the diagnostic accuse something of starving a capture that never ran.
        raw_packets: (opened > 0).then(|| raw_packets.load(Ordering::Relaxed)),
    }
}

/// Non-Windows: the raw count is not available (Linux captures through a helper process that does
/// not surface it), so it stays `None` - never `Some(0)`, which would read as "capture blocked".
#[cfg(not(windows))]
pub fn run_capture_counted(game_ports: Vec<u16>, window: Duration) -> CaptureOutcome {
    CaptureOutcome {
        flows: run_capture(game_ports, window),
        raw_packets: None,
    }
}

/// True when this process can open a promiscuous capture socket, i.e. it runs elevated. The twin of
/// the Linux `CAP_NET_RAW` probe: creating the socket and running `SIO_RCVALL` is the only honest
/// test, since both steps are the ones that require Administrator.
#[cfg(windows)]
pub fn can_open_capture_socket() -> bool {
    // Must probe against a REAL local address: SIO_RCVALL requires the socket to be bound to an
    // explicit interface, and binding the unspecified address fails the ioctl outright - a probe
    // that did so would answer "cannot capture" even for an elevated process.
    let Some(ip) = local_capture_ips().into_iter().next() else {
        error!("[capture] no local interface resolved; cannot probe the capture socket");
        return false;
    };
    match open_promiscuous_socket(SocketAddr::new(ip, 0)) {
        Ok(_) => true,
        Err(e) => {
            error!("[capture] promiscuous socket probe on {ip} failed: {e}");
            false
        }
    }
}

/// Opens one promiscuous `SOCK_RAW` socket bound to `addr`, ready to read whole IP packets.
///
/// `Type::RAW` + `WSAIoctl(SIO_RCVALL)` both require Administrator; that pair is why the capture
/// runs in the LocalSystem BetterFleetCapture service (#732) - the GUI itself ships `asInvoker`
/// since #819 - and why this lives in the Tauri-free crate the service links.
#[cfg(windows)]
fn open_promiscuous_socket(addr: SocketAddr) -> std::io::Result<Socket> {
    use std::os::windows::io::AsRawSocket;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::winsock2;

    // SIO_RCVALL: receive every packet the interface sees, not just those addressed to us.
    const SIO_RCVALL: DWORD = 0x9800_0001;

    let domain = match addr.ip() {
        IpAddr::V4(_) => Domain::IPV4,
        IpAddr::V6(_) => Domain::IPV6,
    };
    let socket = Socket::new(domain, Type::RAW, Some(Protocol::UDP))?;
    socket.bind(&addr.into())?;

    let rc = unsafe {
        let in_value: DWORD = 1;
        let mut returned: DWORD = 0;
        winsock2::WSAIoctl(
            socket.as_raw_socket() as usize,
            SIO_RCVALL,
            &in_value as *const _ as *mut _,
            std::mem::size_of_val(&in_value) as DWORD,
            std::ptr::null_mut(),
            0,
            &mut returned as *mut _,
            std::ptr::null_mut(),
            None,
        )
    };
    if rc == winsock2::SOCKET_ERROR {
        return Err(std::io::Error::from_raw_os_error(unsafe {
            winsock2::WSAGetLastError()
        }));
    }

    // A read timeout lets the loop honour the window deadline even when no packet arrives, the same
    // way the Linux arm does. Blocking reads, not the GUI's old non-blocking socket driven by
    // tokio::select!: this crate has no async runtime, and a service cannot assume one.
    socket.set_read_timeout(Some(Duration::from_millis(200)))?;
    Ok(socket)
}

/// The local addresses to watch. Windows has no single socket that sees every interface (the Linux
/// `AF_PACKET` arm does), so the capture fans out: one promiscuous socket per local IP, merged into
/// one ranking.
#[cfg(windows)]
fn local_capture_ips() -> Vec<IpAddr> {
    let host = match hostname::get() {
        Ok(name) => name.into_string().unwrap_or_else(|_| "localhost".into()),
        Err(e) => {
            error!("[capture] cannot read the hostname: {e}");
            "localhost".into()
        }
    };
    // A hostname with non-ASCII characters does not resolve as-is; punycode it first, exactly as the
    // GUI's get_hostname does, so those machines keep capturing.
    let host = match idna::domain_to_ascii(&host) {
        Ok(ascii) => ascii,
        Err(e) => {
            error!("[capture] cannot punycode the hostname: {e}");
            host
        }
    };
    match format!("{host}:0").to_socket_addrs() {
        Ok(addrs) => dedup_capture_ips(addrs.map(|addr| addr.ip())),
        Err(e) => {
            error!("[capture] cannot resolve local IPs: {e}");
            Vec::new()
        }
    }
}

/// Pure half of [`local_capture_ips`]: keeps resolution order and drops duplicates, so an address
/// listed twice does not get two sockets (and double-count every packet it sees).
///
/// Deliberately platform-neutral rather than `#[cfg(windows)]`: the logic is worth unit-testing on
/// the Linux CI leg too, where nothing calls it.
#[cfg_attr(not(windows), allow(dead_code))]
fn dedup_capture_ips(ips: impl Iterator<Item = std::net::IpAddr>) -> Vec<std::net::IpAddr> {
    let mut seen = HashSet::new();
    ips.filter(|ip| seen.insert(*ip)).collect()
}

/// Blocking promiscuous capture backing [`run_capture`] on Windows: one thread per local IP, each
/// feeding the SAME [`parse_game_flow`] + [`FlowAggregator`] the Linux arm uses, so ranking is
/// shared verbatim.
///
/// A failure to open one socket is logged and skipped rather than fatal: an interface that refuses
/// the promiscuous ioctl should not cost us the ones that accept it.
#[cfg(windows)]
fn capture_raw_sockets(
    game_ports: HashSet<u16>,
    window: Duration,
    raw_packets: &AtomicU64,
) -> (Vec<FlowStat>, usize) {
    // Resolve BEFORE starting the clock. Enumeration is a blocking getaddrinfo, and on a
    // domain-joined or VPN-attached machine a suffix search list can take hundreds of milliseconds;
    // counting that against the window would shorten every capture, and a resolution slower than the
    // window would leave every thread exiting before its first read - reported as "we captured and
    // saw nothing", which is exactly the wrong conclusion.
    let ips = local_capture_ips();
    let aggregator = Arc::new(Mutex::new(FlowAggregator::default()));
    // One clock shared by every interface, so the flow timestamps land on a single timeline and
    // spans stay comparable when the flows are merged.
    let start = Instant::now();
    let opened = AtomicU64::new(0);

    std::thread::scope(|scope| {
        for ip in ips {
            let aggregator = Arc::clone(&aggregator);
            let ports = game_ports.clone();
            let opened = &opened;
            scope.spawn(move || {
                let socket = match open_promiscuous_socket(SocketAddr::new(ip, 0)) {
                    Ok(socket) => socket,
                    Err(e) => {
                        // One interface refusing the ioctl must not cost us the ones that accept it.
                        error!("[capture] raw socket on {ip} failed: {e}");
                        return;
                    }
                };
                opened.fetch_add(1, Ordering::Relaxed);
                let mut buf = [std::mem::MaybeUninit::<u8>::uninit(); 65535];
                drain_capture(
                    |b| socket.recv(b),
                    &mut buf,
                    &ports,
                    &aggregator,
                    window,
                    raw_packets,
                    start,
                );
            });
        }
    });

    let flows = aggregator.lock().unwrap().take_sorted_flows();
    (flows, opened.load(Ordering::Relaxed) as usize)
}

/// Reads one capture source until the window closes, counting every packet before the game-port
/// filter.
///
/// Takes the read as a closure rather than a socket so the error handling below - the part that can
/// silently cost a player their detection - is unit-testable without a privileged socket, which no
/// CI runner can open.
#[cfg_attr(not(windows), allow(dead_code))]
fn drain_capture<R>(
    mut read: R,
    buf: &mut [std::mem::MaybeUninit<u8>],
    game_ports: &HashSet<u16>,
    aggregator: &Mutex<FlowAggregator>,
    window: Duration,
    raw_packets: &AtomicU64,
    start: Instant,
) where
    R: FnMut(&mut [std::mem::MaybeUninit<u8>]) -> std::io::Result<usize>,
{
    while start.elapsed() < window {
        match read(buf) {
            Ok(0) => {}
            Ok(len) => {
                // Counted before the game-port filter: a zero here over a full window means the
                // capture received nothing at all, not that the game had no matching ports.
                raw_packets.fetch_add(1, Ordering::Relaxed);
                // SAFETY: the reader reports `len` bytes written, so the first `len` bytes are
                // initialised; MaybeUninit<u8> and u8 share layout, so viewing them as `&[u8]` is
                // sound.
                let data = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, len) };
                if let Some((local_port, remote_ip, remote_port, inbound)) =
                    parse_game_flow(data, game_ports)
                {
                    let t_ms = start.elapsed().as_millis() as u64;
                    aggregator
                        .lock()
                        .unwrap()
                        .observe(local_port, &remote_ip, remote_port, len, inbound, t_ms);
                }
            }
            Err(e) if is_recoverable_capture_error(&e) => {}
            Err(e) => {
                error!("[capture] promiscuous recv error, stopping this interface: {e}");
                break;
            }
        }
    }
}

/// Whether a `recv` error is one to keep reading through rather than abandon the interface for.
///
/// This is the trap the Linux arm does not have. Beyond the read timeout, a promiscuous `SOCK_RAW`
/// routinely surfaces Winsock errors that are NOT fatal: `WSAEMSGSIZE` (10040) when a datagram is
/// larger than the buffer - truncated, socket still usable; `WSAECONNRESET` (10054) and
/// `WSAENETRESET` (10052), which Windows delivers on a UDP socket after an ICMP unreachable/TTL
/// expiry for an unrelated peer; and `WSAENOBUFS` (10055) when the driver's receive buffers are
/// momentarily exhausted under load - exactly when a busy game host matters most. Treating any of
/// them as fatal would silently kill capture on that interface for the rest of the window, and
/// detection would degrade to "no server" with nothing in the logs.
///
/// The predecessor of this loop ignored *every* recv error and simply kept reading, so the bar to
/// clear is high: only errors that mean the socket itself is gone stop a capture.
///
/// Platform-neutral for the same reason as [`dedup_capture_ips`]: this classification is the single
/// most dangerous line in the Windows backend, so it is unit-tested on every CI leg.
#[cfg_attr(not(windows), allow(dead_code))]
fn is_recoverable_capture_error(e: &std::io::Error) -> bool {
    const WSAEMSGSIZE: i32 = 10040;
    const WSAENETRESET: i32 = 10052;
    const WSAECONNRESET: i32 = 10054;
    const WSAENOBUFS: i32 = 10055;
    matches!(
        e.kind(),
        std::io::ErrorKind::WouldBlock
            | std::io::ErrorKind::TimedOut
            | std::io::ErrorKind::Interrupted
    ) || matches!(
        e.raw_os_error(),
        Some(WSAEMSGSIZE) | Some(WSAENETRESET) | Some(WSAECONNRESET) | Some(WSAENOBUFS)
    )
}

/// No capture backend on this OS (macOS): detection reports "no server" rather than crashing.
#[cfg(not(any(target_os = "linux", windows)))]
pub fn run_capture(_game_ports: Vec<u16>, _window: Duration) -> Vec<FlowStat> {
    Vec::new()
}

/// True when this process can open the `AF_PACKET` capture socket, i.e. it holds `CAP_NET_RAW`. The
/// capture helper checks this up front so a missing capability surfaces as a nonzero exit and the GUI
/// falls back to in-process capture, instead of a silent empty result that looks like an idle game.
#[cfg(target_os = "linux")]
pub fn can_open_capture_socket() -> bool {
    // ETH_P_ALL in network byte order, matching capture_af_packet. Opening (and immediately dropping)
    // the socket is a clean capability probe: it needs CAP_NET_RAW just like the real capture does.
    const ETH_P_ALL: u16 = 0x0003;
    let protocol = Protocol::from(i32::from(ETH_P_ALL.to_be()));
    Socket::new(Domain::PACKET, Type::DGRAM, Some(protocol)).is_ok()
}

/// No capture backend on this OS (macOS), so the helper reports it cannot capture.
#[cfg(not(any(target_os = "linux", windows)))]
pub fn can_open_capture_socket() -> bool {
    false
}

/// Blocking `AF_PACKET` capture loop backing [`run_capture`]. A single `AF_PACKET`/`SOCK_DGRAM`
/// socket sees every IP packet crossing the host in both directions across all interfaces (no
/// per-interface fan-out like the Windows path), and the kernel strips the link-layer header, so each
/// datagram arrives network-layer-first and feeds the SAME [`parse_game_flow`] + [`FlowAggregator`]
/// the Windows sniff does. Ranking-by-volume is therefore shared verbatim.
///
/// Needs `CAP_NET_RAW`: normally the betterfleet-netcap helper carries it (#726); a permission
/// failure is logged and simply yields no flows, so detection degrades to "no server" rather than
/// crashing.
#[cfg(target_os = "linux")]
fn capture_af_packet(game_ports: HashSet<u16>, window: Duration) -> Vec<FlowStat> {
    use std::mem::MaybeUninit;

    // ETH_P_ALL, in network byte order because AF_PACKET takes its protocol big-endian (== htons).
    // SOCK_DGRAM (not SOCK_RAW) tells the kernel to strip the link-layer header, so recv() yields the
    // IP packet directly - exactly what parse_game_flow (from_ip_slice) expects, as on Windows.
    const ETH_P_ALL: u16 = 0x0003;
    let protocol = Protocol::from(i32::from(ETH_P_ALL.to_be()));
    let socket = match Socket::new(Domain::PACKET, Type::DGRAM, Some(protocol)) {
        Ok(socket) => socket,
        Err(e) => {
            error!(
                "[capture] AF_PACKET socket failed: {e} (needs CAP_NET_RAW: grant it to the \
                 betterfleet-netcap helper with `sudo setcap cap_net_raw+ep`, or to this binary for \
                 the in-process fallback)"
            );
            return Vec::new();
        }
    };
    // A read timeout lets the loop honour the window deadline even when no packet arrives.
    if let Err(e) = socket.set_read_timeout(Some(Duration::from_millis(200))) {
        error!("[capture] AF_PACKET set_read_timeout failed: {e}");
        return Vec::new();
    }

    let mut aggregator = FlowAggregator::default();
    // A full IP datagram fits in 64 KiB; one buffer, reused per packet.
    let mut buf = [MaybeUninit::<u8>::uninit(); 65535];
    let start = Instant::now();
    while start.elapsed() < window {
        match socket.recv(&mut buf) {
            Ok(0) => {}
            Ok(len) => {
                // SAFETY: recv reports `len` bytes written, so the first `len` bytes are initialised;
                // MaybeUninit<u8> and u8 share layout, so viewing them as `&[u8]` is sound.
                let data = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, len) };
                if let Some((local_port, remote_ip, remote_port, inbound)) =
                    parse_game_flow(data, &game_ports)
                {
                    let t_ms = start.elapsed().as_millis() as u64;
                    aggregator.observe(local_port, &remote_ip, remote_port, len, inbound, t_ms);
                }
            }
            // Read timeout (SO_RCVTIMEO surfaces as WouldBlock/TimedOut): re-check the deadline.
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => {
                error!("[capture] AF_PACKET recv error: {e}");
                break;
            }
        }
    }
    aggregator.take_sorted_flows()
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    #[test]
    fn dedup_capture_ips_keeps_order_and_drops_repeats() {
        let v4 = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 10));
        let v6 = IpAddr::V6(Ipv6Addr::LOCALHOST);
        let other = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));
        // Resolution routinely lists the same address twice (one entry per socket type); one socket
        // each, in the order the resolver gave them.
        let ips = dedup_capture_ips(vec![v4, v6, v4, other, v6].into_iter());
        assert_eq!(ips, vec![v4, v6, other]);
    }

    #[test]
    fn dedup_capture_ips_handles_an_empty_resolution() {
        assert!(dedup_capture_ips(Vec::new().into_iter()).is_empty());
    }

    /// Drives the real read loop with a scripted sequence of results and reports how many packets
    /// it counted before giving up. `Ok(1)` stands for a packet: one byte never parses as a game
    /// flow, so the aggregator stays empty and the raw counter is what the assertions read.
    fn drive_loop(script: Vec<std::io::Result<usize>>) -> u64 {
        let mut remaining = script.into_iter();
        let ports: HashSet<u16> = HashSet::new();
        let aggregator = Mutex::new(FlowAggregator::default());
        let counted = AtomicU64::new(0);
        let mut buf = [std::mem::MaybeUninit::<u8>::uninit(); 64];
        drain_capture(
            // Once the script runs out, report a timeout: the loop then spins harmlessly until the
            // window closes, exactly as a quiet interface does.
            |_| remaining.next().unwrap_or(Err(std::io::ErrorKind::TimedOut.into())),
            &mut buf,
            &ports,
            &aggregator,
            // Short window: these tests are about control flow, not duration.
            Duration::from_millis(30),
            &counted,
            Instant::now(),
        );
        counted.load(Ordering::Relaxed)
    }

    #[test]
    fn winsock_noise_does_not_end_the_capture_window() {
        // The regression this whole classification exists for: a promiscuous socket raises these
        // routinely, and the packet AFTER them must still be captured.
        let counted = drive_loop(vec![
            Err(std::io::Error::from_raw_os_error(10040)), // WSAEMSGSIZE
            Err(std::io::Error::from_raw_os_error(10054)), // WSAECONNRESET
            Err(std::io::Error::from_raw_os_error(10052)), // WSAENETRESET
            Err(std::io::Error::from_raw_os_error(10055)), // WSAENOBUFS
            Ok(1),
        ]);
        assert_eq!(counted, 1, "the read loop must survive routine Winsock noise");
    }

    #[test]
    fn a_dead_socket_ends_the_capture_window() {
        // WSAENOTSOCK: the handle is gone. Reading on would spin until the window closes.
        let counted = drive_loop(vec![Err(std::io::Error::from_raw_os_error(10038)), Ok(1)]);
        assert_eq!(counted, 0, "a dead socket must stop the loop, not be read through");
    }

    #[test]
    fn every_packet_is_counted_before_the_port_filter() {
        // The counter must not depend on a packet parsing as a game flow: that is what tells
        // "captured nothing" apart from "captured, nothing matched".
        assert_eq!(drive_loop(vec![Ok(1), Ok(1), Ok(0), Ok(1)]), 3);
    }

    #[test]
    fn read_timeouts_and_winsock_noise_never_stop_a_capture() {
        use std::io::{Error, ErrorKind};
        // SO_RCVTIMEO surfaces as one of these two, depending on the platform.
        assert!(is_recoverable_capture_error(&Error::from(
            ErrorKind::WouldBlock
        )));
        assert!(is_recoverable_capture_error(&Error::from(
            ErrorKind::TimedOut
        )));
        assert!(is_recoverable_capture_error(&Error::from(
            ErrorKind::Interrupted
        )));
        // WSAEMSGSIZE: a datagram larger than the buffer. Truncated, socket still fine.
        assert!(is_recoverable_capture_error(&Error::from_raw_os_error(10040)));
        // WSAECONNRESET: an ICMP port-unreachable for an unrelated peer, delivered on our UDP
        // socket. Treating it as fatal would silently kill capture for the rest of the window.
        assert!(is_recoverable_capture_error(&Error::from_raw_os_error(10054)));
    }

    #[test]
    fn a_real_socket_failure_still_stops_the_capture() {
        use std::io::{Error, ErrorKind};
        // WSAENOTSOCK: the handle is gone; reading forever would spin on a dead socket.
        assert!(!is_recoverable_capture_error(&Error::from_raw_os_error(10038)));
        assert!(!is_recoverable_capture_error(&Error::from(
            ErrorKind::PermissionDenied
        )));
    }

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
    fn busiest_plausible_flow_ranks_first() {
        let mut agg = FlowAggregator::default();
        // Two sparse SDR-like relay flows (Steam-owned peers, non-SoT ports).
        agg.observe(50001, "162.254.1.1", 27017, 60, true, 10);
        agg.observe(50002, "162.254.1.2", 27018, 60, true, 20);
        // The busy game-server flow (plausible SoT remote port), sustained traffic.
        for i in 0..20u64 {
            agg.observe(59639, "20.1.2.3", 35000, 120, i % 2 == 0, 100 + i);
        }

        let flows = agg.take_sorted_flows();
        assert_eq!(flows.len(), 3);

        // Highest-volume flow wins and is flagged as a plausible server.
        assert_eq!(flows[0].local_port, 59639);
        assert_eq!(flows[0].packets, 20);
        assert_eq!(flows[0].bytes, 20 * 120);
        assert!(flows[0].plausible_sot_port);
        assert_eq!(flows[0].inbound, 10);
        assert_eq!(flows[0].outbound, 10);

        // The sparse relay flows are not flagged as SoT candidates.
        assert!(!flows[1].plausible_sot_port);
        assert!(!flows[2].plausible_sot_port);
    }

    #[test]
    fn packets_on_the_same_flow_accumulate() {
        let mut agg = FlowAggregator::default();
        agg.observe(59639, "20.1.2.3", 35000, 100, false, 0);
        agg.observe(59639, "20.1.2.3", 35000, 140, true, 5);

        let flows = agg.take_sorted_flows();
        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].packets, 2);
        assert_eq!(flows[0].bytes, 240);
        assert_eq!(flows[0].inbound, 1);
        assert_eq!(flows[0].outbound, 1);
        assert_eq!(flows[0].first_seen_ms, 0);
        assert_eq!(flows[0].last_seen_ms, 5);
    }

    #[test]
    fn different_remotes_on_one_local_port_are_distinct_flows() {
        // A single local port talking to two different peers must not be merged.
        let mut agg = FlowAggregator::default();
        agg.observe(60000, "1.1.1.1", 35000, 50, true, 0);
        agg.observe(60000, "2.2.2.2", 35001, 50, true, 1);
        assert_eq!(agg.take_sorted_flows().len(), 2);
    }
}
