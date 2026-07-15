// Passive diagnostic capture for issue #364 (bad server detection since the
// Steam Datagram Relay change). Sniffs the game's UDP flows over a fixed window
// and reports per-flow packet volume, so the real game-server flow (sustained
// traffic, remote port 30000-40000) can be told apart from the many sparse SDR
// relay flows. This is purely additive instrumentation — it never touches the
// live detection state, it only observes.

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use etherparse::PacketHeaders;
use log::error;
use serde::Serialize;
use tokio::net::UdpSocket;

use crate::fetch_informations::{create_raw_socket, get_hostname, is_plausible_sot_port};

/// One observed UDP conversation between a game-owned local port and a remote peer.
#[derive(Serialize, Clone, Debug, PartialEq)]
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

/// The full result of a diagnostic capture, ready to be serialized and shared.
#[derive(Serialize, Clone, Debug)]
pub struct DiagnosticReport {
    /// Free-text label supplied by the tester, e.g. "main menu" or "in game".
    pub note: String,
    pub game_status: String,
    pub pid: Option<u32>,
    pub duration_ms: u64,
    pub main_menu_port: u16,
    /// Game UDP ports as returned by netstat2 (deduplicated, unordered).
    pub udp_ports_netstat2: Vec<u16>,
    /// Game UDP ports as returned by `Get-NetUDPEndpoint` (kept in emission order).
    pub udp_ports_powershell: Vec<u16>,
    pub total_packets: u32,
    pub distinct_flows: usize,
    /// Flows whose remote port looks like a SoT server, ranked by volume — the
    /// server should stand out here.
    pub top_candidates: Vec<FlowStat>,
    /// Every observed flow, ranked by volume.
    pub flows: Vec<FlowStat>,
}

/// Aggregates observed UDP packets into per-flow statistics. Deliberately free of
/// any I/O so the aggregation and ranking can be unit-tested deterministically.
#[derive(Default)]
pub struct FlowAggregator {
    map: HashMap<(u16, String, u16), FlowStat>,
    total: u32,
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
        self.total += 1;
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

    pub fn total(&self) -> u32 {
        self.total
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
fn parse_game_flow(bytes: &[u8], game_ports: &HashSet<u16>) -> Option<(u16, String, u16, bool)> {
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

/// Sniffs a single local interface for `duration`, feeding every game-owned UDP
/// packet into the shared aggregator.
async fn sniff_interface(
    addr: SocketAddr,
    game_ports: HashSet<u16>,
    aggregator: Arc<Mutex<FlowAggregator>>,
    duration: Duration,
) {
    let socket: UdpSocket = match create_raw_socket(addr).await {
        Ok(socket) => socket,
        Err(e) => {
            error!("[diagnostic] raw socket on {} failed: {}", addr.ip(), e);
            return;
        }
    };

    let mut buf = [0u8; (256 * 256) - 1];
    let start = Instant::now();
    while start.elapsed() < duration {
        tokio::select! {
            received = socket.recv(&mut buf) => {
                if let Ok(len) = received {
                    if len == 0 {
                        continue;
                    }
                    if let Some((local_port, remote_ip, remote_port, inbound)) =
                        parse_game_flow(&buf[..len], &game_ports)
                    {
                        let t_ms = start.elapsed().as_millis() as u64;
                        aggregator
                            .lock()
                            .unwrap()
                            .observe(local_port, &remote_ip, remote_port, len, inbound, t_ms);
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(250)) => {}
        }
    }
}

/// Runs a diagnostic capture: sniffs every local interface for `duration`,
/// aggregates per-flow UDP stats for the game's ports, and returns a ranked report.
#[allow(clippy::too_many_arguments)]
pub async fn run_diagnostic(
    game_ports: Vec<u16>,
    duration: Duration,
    note: String,
    game_status: String,
    main_menu_port: u16,
    pid: Option<u32>,
    udp_ports_netstat2: Vec<u16>,
    udp_ports_powershell: Vec<u16>,
) -> DiagnosticReport {
    let port_set: HashSet<u16> = game_ports.into_iter().collect();
    let aggregator = Arc::new(Mutex::new(FlowAggregator::default()));
    let started = Instant::now();

    // Sniff on every local IP, exactly like live detection — we don't know which
    // interface carries the game traffic, so we watch them all and merge results.
    let host = format!("{}:0", get_hostname().unwrap_or_else(|_| "localhost".into()));
    let ips: Vec<IpAddr> = match host.to_socket_addrs() {
        Ok(addrs) => addrs.map(|socket_addr| socket_addr.ip()).collect(),
        Err(e) => {
            error!("[diagnostic] cannot resolve local IPs: {}", e);
            Vec::new()
        }
    };

    let mut handles = Vec::new();
    for ip in ips {
        let addr = SocketAddr::new(ip, 0);
        let aggregator = Arc::clone(&aggregator);
        let ports = port_set.clone();
        handles.push(tokio::spawn(async move {
            sniff_interface(addr, ports, aggregator, duration).await;
        }));
    }
    for handle in handles {
        let _ = handle.await;
    }

    let (total_packets, flows) = {
        let mut guard = aggregator.lock().unwrap();
        (guard.total(), guard.take_sorted_flows())
    };
    let top_candidates: Vec<FlowStat> = flows
        .iter()
        .filter(|flow| flow.plausible_sot_port)
        .cloned()
        .collect();

    DiagnosticReport {
        note,
        game_status,
        pid,
        duration_ms: started.elapsed().as_millis() as u64,
        main_menu_port,
        udp_ports_netstat2,
        udp_ports_powershell,
        total_packets,
        distinct_flows: flows.len(),
        top_candidates,
        flows,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

        assert_eq!(agg.total(), 22);
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
