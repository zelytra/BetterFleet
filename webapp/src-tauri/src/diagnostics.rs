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
use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;

use crate::fetch_informations::{create_raw_socket, get_hostname, is_plausible_sot_port};

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

/// Sniffs every local interface for `window`, aggregating per-flow UDP stats for
/// the given game ports, and returns the flows ranked by volume (desc). Shared by
/// the diagnostic report and by live detection, so both observe traffic identically.
pub async fn capture_flows(game_ports: Vec<u16>, window: Duration) -> Vec<FlowStat> {
    let port_set: HashSet<u16> = game_ports.into_iter().collect();
    let aggregator = Arc::new(Mutex::new(FlowAggregator::default()));

    // We don't know which interface carries the game traffic, so watch them all
    // and merge the results into one ranking.
    let host = format!("{}:0", get_hostname().unwrap_or_else(|_| "localhost".into()));
    let ips: Vec<IpAddr> = match host.to_socket_addrs() {
        Ok(addrs) => addrs.map(|socket_addr| socket_addr.ip()).collect(),
        Err(e) => {
            error!("[capture] cannot resolve local IPs: {}", e);
            Vec::new()
        }
    };

    let mut handles = Vec::new();
    for ip in ips {
        let addr = SocketAddr::new(ip, 0);
        let aggregator = Arc::clone(&aggregator);
        let ports = port_set.clone();
        handles.push(tokio::spawn(async move {
            sniff_interface(addr, ports, aggregator, window).await;
        }));
    }
    for handle in handles {
        let _ = handle.await;
    }

    let flows = aggregator.lock().unwrap().take_sorted_flows();
    flows
}

/// Picks the dominant Sea of Thieves server flow: the highest-volume flow whose
/// remote port is in the SoT server range and that carries at least `min_packets`.
/// Returns None when nothing qualifies (e.g. the main menu, which sends no server
/// traffic). Volume is the discriminator — the real server pushes sustained traffic
/// while the many Steam Datagram Relay flows are sparse, even though both can fall
/// inside the plausible port range.
pub fn pick_server_flow(flows: &[FlowStat], min_packets: u32) -> Option<&FlowStat> {
    flows
        .iter()
        .filter(|flow| flow.plausible_sot_port && flow.packets >= min_packets)
        .max_by(|a, b| a.packets.cmp(&b.packets).then(a.bytes.cmp(&b.bytes)))
}

/// Runs a diagnostic capture and wraps the ranked flows in a shareable report.
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
    let started = Instant::now();
    let flows = capture_flows(game_ports, duration).await;
    let total_packets: u32 = flows.iter().map(|flow| flow.packets).sum();
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

    // Real capture from issue #364 (in game): two flows, BOTH in the SoT port
    // range, but the real server carries 1247 packets vs 8. Volume must decide.
    fn in_game_flows_from_issue_364() -> Vec<FlowStat> {
        vec![
            FlowStat {
                local_port: 59230,
                remote_ip: "20.216.148.125".to_string(),
                remote_port: 30101,
                packets: 1247,
                bytes: 151176,
                inbound: 600,
                outbound: 647,
                plausible_sot_port: true,
                first_seen_ms: 8,
                last_seen_ms: 20008,
            },
            FlowStat {
                local_port: 57709,
                remote_ip: "20.157.115.138".to_string(),
                remote_port: 30368,
                packets: 8,
                bytes: 608,
                inbound: 4,
                outbound: 4,
                plausible_sot_port: true,
                first_seen_ms: 7862,
                last_seen_ms: 17887,
            },
        ]
    }

    #[test]
    fn picks_the_sustained_server_over_a_sparse_same_range_flow() {
        let flows = in_game_flows_from_issue_364();
        let server = pick_server_flow(&flows, 5).expect("a server should be picked");
        assert_eq!(server.remote_ip, "20.216.148.125");
        assert_eq!(server.remote_port, 30101);
        assert_eq!(server.local_port, 59230);
    }

    // The #364 corpus: real in-game captures, each scenario tagged with the in-game ground truth
    // (sameServer). Every player has two plausible-SoT flows — a busy one (~1000 packets, the game
    // host) and a sparse one (~4-8 packets, the session). Loaded from
    // tests/fixtures/detection-corpus.json.
    #[derive(Deserialize)]
    struct Corpus {
        scenarios: Vec<Scenario>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Scenario {
        case: String,
        same_server: bool,
        captures: Vec<Capture>,
    }
    #[derive(Deserialize)]
    struct Capture {
        #[allow(dead_code)]
        player: String,
        flows: Vec<FlowStat>,
    }

    fn load_corpus() -> Corpus {
        serde_json::from_str(include_str!("../tests/fixtures/detection-corpus.json"))
            .expect("the detection corpus fixture must parse")
    }

    /// The low-volume plausible flow. pick_server_flow takes the busiest; this takes the sparsest.
    fn sparse_flow(flows: &[FlowStat]) -> Option<&FlowStat> {
        flows
            .iter()
            .filter(|f| f.plausible_sot_port)
            .min_by_key(|f| f.packets)
    }

    // The finding out of #364: the server a player is on is identified by the SPARSE flow, not the
    // busy gameplay flow. Across every scenario — same-server and different-server, including two
    // servers sharing one Azure host — grouping the captures by the sparse flow's ip:port matches the
    // ground truth exactly. The busy flow cannot: see the next test.
    #[test]
    fn the_session_is_the_sparse_flow_across_the_whole_corpus() {
        let corpus = load_corpus();
        assert!(corpus.scenarios.len() >= 4, "corpus lost scenarios");

        for s in &corpus.scenarios {
            let sparse_ids: HashSet<(String, u16)> = s
                .captures
                .iter()
                .map(|c| {
                    let f = sparse_flow(&c.flows)
                        .unwrap_or_else(|| panic!("case {}: a capture has no sparse flow", s.case));
                    (f.remote_ip.clone(), f.remote_port)
                })
                .collect();
            let one_session = sparse_ids.len() == 1;
            assert_eq!(
                one_session, s.same_server,
                "case {}: sparse-flow grouping saw {} session(s), ground truth sameServer={}",
                s.case,
                sparse_ids.len(),
                s.same_server
            );
        }
    }

    // Why the shipped identity is wrong. #656 hashes the busy flow's IP, and cases B and D are two
    // players on DIFFERENT servers that share one host IP (51.103.72.36) — so the busy IP merges
    // them. This is the false positive #364 was reopened for; the test pins that it is real, and that
    // ip:port would instead over-split the same-server case A.
    #[test]
    fn the_busy_flow_ip_merges_two_servers_on_one_host() {
        let corpus = load_corpus();
        let busy_ip_ids = |s: &Scenario| -> usize {
            s.captures
                .iter()
                .filter_map(|c| pick_server_flow(&c.flows, 5).map(|f| f.remote_ip.clone()))
                .collect::<HashSet<_>>()
                .len()
        };

        // A different-server scenario that the busy IP wrongly collapses to one.
        let false_merge = corpus
            .scenarios
            .iter()
            .any(|s| !s.same_server && busy_ip_ids(s) == 1);
        assert!(
            false_merge,
            "expected a different-server scenario that the busy-IP identity merges (the #364 bug)"
        );
    }

    #[test]
    fn main_menu_capture_yields_no_server() {
        // Real main-menu capture from issue #364: zero traffic on the game ports.
        let flows: Vec<FlowStat> = Vec::new();
        assert!(pick_server_flow(&flows, 5).is_none());
    }

    #[test]
    fn a_high_volume_floor_rejects_the_sparse_secondary_flow() {
        // Only the sparse 8-packet flow is present; a floor above it finds nothing.
        let flows = vec![in_game_flows_from_issue_364()[1].clone()];
        assert!(pick_server_flow(&flows, 50).is_none());
        assert!(pick_server_flow(&flows, 5).is_some());
    }

    #[test]
    fn a_busy_non_sot_port_is_never_the_server() {
        // A very busy Steam-relay-like flow on a non-SoT port must be ignored.
        let flows = vec![FlowStat {
            local_port: 50000,
            remote_ip: "162.254.1.1".to_string(),
            remote_port: 27017,
            packets: 5000,
            bytes: 600000,
            inbound: 2500,
            outbound: 2500,
            plausible_sot_port: false,
            first_seen_ms: 0,
            last_seen_ms: 20000,
        }];
        assert!(pick_server_flow(&flows, 5).is_none());
    }
}
