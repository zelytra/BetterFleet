//! Shared packet-capture core for BetterFleet server detection, and the primitives the
//! privilege-separated capture helper is built on (#726).
//!
//! Sea of Thieves server detection watches the game's UDP flows and ranks them by volume to tell the
//! real game server apart from the many sparse Steam Datagram Relay flows. On Linux that means an
//! `AF_PACKET` capture socket, which needs `CAP_NET_RAW`. To spare the unprivileged Tauri GUI from
//! holding that capability, everything that touches the raw socket lives here, in a crate that never
//! links Tauri, and the GUI drives it out-of-process through the `betterfleet-netcap` binary. The
//! same aggregation and ranking are reused verbatim by the Windows in-process sniff, so both
//! platforms observe traffic identically.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use etherparse::PacketHeaders;
use serde::{Deserialize, Serialize};

#[cfg(target_os = "linux")]
use log::error;
#[cfg(target_os = "linux")]
use socket2::{Domain, Protocol, Socket, Type};
#[cfg(target_os = "linux")]
use std::time::Instant;

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
    port >= 30000 && port < 40000
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

/// Non-Linux stub: there is no `AF_PACKET` backend, so there is no in-process capture here. The
/// desktop app ships for Windows and Linux; Windows captures in-process with a promiscuous socket
/// that lives in the GUI crate, and macOS has no capture backend yet.
#[cfg(not(target_os = "linux"))]
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

/// Non-Linux stub: there is no `AF_PACKET` socket to open, so the helper reports it cannot capture.
#[cfg(not(target_os = "linux"))]
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
