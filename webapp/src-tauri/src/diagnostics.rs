// The capture layer: every packet capture the app runs goes through here, live detection and the
// Help-tab diagnostic alike. Born as passive instrumentation for issue #364 (per-flow UDP volume,
// so the real game-server flow stands out from the sparse SDR relays), it grew into the capture
// path itself: on Windows it drives the BetterFleetCapture service over its named pipe and owns
// the capture-health state the repair banner polls (#819); on Linux it drives the privileged
// betterfleet-netcap helper with an in-process fallback (#726). The diagnostic remains additive -
// it pauses live detection while it holds the service pipe, but never mutates detection state.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use log::error;
#[cfg(target_os = "linux")]
use log::info;
use serde::Serialize;

// Every capture backend lives in the Tauri-free better_fleet_netcap crate (#726, #732), re-exported
// as better_fleet::capture by src/lib.rs: this module only decides which one to drive and how to
// keep it off the async runtime.
use better_fleet::capture::FlowStat;

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
    /// Packets on the game's ports, i.e. those that fed the ranking below.
    pub total_packets: u32,
    /// Every packet the capture socket(s) actually received, BEFORE the game-port filter, or `null`
    /// where it is not measured (Linux captures in a separate helper process). This is what tells
    /// "the capture is blocked" (0 - e.g. a VPN or an Npcap/Wireshark NDIS filter starving the
    /// SIO_RCVALL raw socket) apart from "the capture works but the game exposed no matching UDP
    /// ports" (>0 while `total_packets` is 0, which points at the port enumeration instead).
    pub raw_packets: Option<u64>,
    pub distinct_flows: usize,
    /// True when not one captured flow carried a single outbound packet, i.e. the capture socket is
    /// receive-only (#837: SIO_RCVALL delivers received packets but never locally sent ones on a
    /// range of NIC/driver combinations). Detection compensates - the session flow is picked without
    /// its return leg there - but the report says so, because a receive-only capture also explains
    /// away every "the client sends nothing" reading of these numbers.
    pub receive_only_capture: bool,
    /// Flows whose remote port looks like a SoT server, ranked by volume: the
    /// server should stand out here.
    pub top_candidates: Vec<FlowStat>,
    /// Every observed flow, ranked by volume.
    pub flows: Vec<FlowStat>,
    /// Which capture path served these numbers (#819): the service (with its protocol version),
    /// the elevated in-process stopgap, or nothing - a report that says "no packets" reads
    /// completely differently depending on who failed to hear them.
    pub capture_backend: String,
}

/// How the Windows capture backend is doing, as one small state the frontend polls (#819): the
/// GUI runs unelevated and simply cannot capture without the service, so "the service is gone"
/// must surface as a banner with a real next step, never as silent no-detection. Kept in a static
/// rather than threaded through the capture call chain: many callers, one reader.
#[cfg(windows)]
mod capture_health_state {
    use std::sync::atomic::{AtomicU8, AtomicU32, Ordering};
    pub const OK: u8 = 0;
    pub const SERVICE_UNREACHABLE: u8 = 1;
    pub const SERVICE_INCOMPATIBLE: u8 = 2;
    pub const DEGRADED_ELEVATED: u8 = 3;
    static STATE: AtomicU8 = AtomicU8::new(OK);
    static TRANSIENT_STREAK: AtomicU32 = AtomicU32::new(0);
    pub fn set(state: u8) {
        STATE.store(state, Ordering::Relaxed);
    }
    pub fn get() -> u8 {
        STATE.load(Ordering::Relaxed)
    }
    /// Counts consecutive Transient outcomes; returns the streak INCLUDING this one. A service
    /// that is "busy" forever is not busy, it is wedged - the caller escalates past a threshold.
    pub fn count_transient() -> u32 {
        TRANSIENT_STREAK.fetch_add(1, Ordering::Relaxed) + 1
    }
    pub fn reset_transients() {
        TRANSIENT_STREAK.store(0, Ordering::Relaxed);
    }
}

/// The capture-health label `get_game_object` ships to the frontend repair banner. Stringly on
/// purpose: it crosses the Tauri boundary, and the frontend switch is the single consumer.
/// Non-Windows is always "ok" - the Linux helper chain has its own in-process fallback and needs
/// no repair UX.
pub fn capture_health_label() -> &'static str {
    #[cfg(windows)]
    {
        match capture_health_state::get() {
            capture_health_state::SERVICE_UNREACHABLE => "service-unreachable",
            capture_health_state::SERVICE_INCOMPATIBLE => "service-incompatible",
            capture_health_state::DEGRADED_ELEVATED => "degraded-elevated",
            _ => "ok",
        }
    }
    #[cfg(not(windows))]
    {
        "ok"
    }
}

/// Why the service path did not serve a capture, folded to what the caller can act on. Not
/// cfg-gated: `decide_health` reasons about these on every platform so the policy is testable on
/// both CI legs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ServiceFailure {
    /// The service exists but could not take this request (busy with another capture, or slow).
    /// Not a repair condition: the health state is left alone and this window simply has no flows.
    Transient,
    /// No service at the pipe: not installed, not running, or the pipe is unreachable.
    Unreachable,
    /// The service answered but the pair does not speak the same protocol (version skew after a
    /// half-applied update, or a refused request that a matching build would never send).
    Incompatible,
}

/// One capture through the service pipe - each failure branch logged distinctly, because "no
/// service" vs "service refused" vs "no answer" is what the repair banner and the Help-tab
/// diagnostic are built on (#819).
#[cfg(windows)]
fn capture_via_service(
    game_ports: &[u16],
    window: Duration,
    connect_timeout: Duration,
) -> Result<(Vec<FlowStat>, Option<u64>), ServiceFailure> {
    use better_fleet::capture::service_ipc::{request_capture, ClientError};
    use better_fleet::capture::service_proto::{CaptureRequest, PIPE_NAME, PROTOCOL_VERSION};

    let request = CaptureRequest {
        version: PROTOCOL_VERSION,
        game_ports: game_ports.to_vec(),
        // Live detection asks in whole seconds (2 s windows); never round a sub-second ask to 0.
        window_secs: window.as_secs().max(1),
    };
    // Connecting is local and fast or not happening; the answer takes the capture window itself,
    // plus margin for the service to aggregate and serialize.
    let io_deadline = window + Duration::from_secs(5);
    match request_capture(PIPE_NAME, &request, connect_timeout, io_deadline) {
        Ok(response) => Ok((response.flows, response.raw_packets)),
        Err(ClientError::ServiceUnavailable) => {
            error!("[capture] the capture service is not running (pipe not found); no flows");
            Err(ServiceFailure::Unreachable)
        }
        Err(ClientError::Busy) => {
            error!("[capture] the capture service is busy with another request; no flows");
            Err(ServiceFailure::Transient)
        }
        Err(ClientError::TimedOut) => {
            error!("[capture] the capture service did not answer before the deadline; no flows");
            Err(ServiceFailure::Transient)
        }
        Err(ClientError::Protocol(e)) => {
            error!("[capture] capture service protocol mismatch: {e}; no flows");
            Err(ServiceFailure::Incompatible)
        }
        Err(ClientError::Service(e)) => {
            error!("[capture] the capture service refused the request: {e}; no flows");
            Err(ServiceFailure::Incompatible)
        }
        Err(ClientError::Io(e)) => {
            error!("[capture] capture service pipe I/O failed: {e}; no flows");
            Err(ServiceFailure::Unreachable)
        }
    }
}

/// What a capture cycle's outcome means for the health state and the fallback, decided in one
/// pure place (#859): the policy is the only thing standing between a broken service and silent
/// no-detection, and it was previously inlined in a Windows-only function no test could reach.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HealthDecision {
    /// The capture served flows: healthy, streak cleared.
    Healthy,
    /// A transient failure inside the tolerated streak: no flows this window, health untouched.
    HoldTransient,
    /// Fall back to the in-process capture, at degraded health (an elevated stopgap user).
    FallBackElevated,
    /// No capture and no fallback: the repair banner's business.
    Unreachable,
    Incompatible,
}

/// Maps one capture outcome to its decision.
///
/// `transient_streak` counts consecutive transient outcomes INCLUDING this one; past
/// [`TRANSIENT_ESCALATE_AFTER`] a "transient" failure is not transient any more - a wedged
/// capture thread answers Busy or times out forever, and without escalation the banner never
/// arms. `elevated` is whether this process could capture in-process itself.
pub(crate) fn decide_health(
    outcome: Result<(), ServiceFailure>,
    transient_streak: u32,
    elevated: bool,
) -> HealthDecision {
    let failure = match outcome {
        Ok(()) => return HealthDecision::Healthy,
        Err(kind) => kind,
    };
    let failure = match failure {
        ServiceFailure::Transient if transient_streak < TRANSIENT_ESCALATE_AFTER => {
            return HealthDecision::HoldTransient
        }
        // A permanently "busy" service is a wedged one: treat it as unreachable so the repair
        // path can act.
        ServiceFailure::Transient => ServiceFailure::Unreachable,
        other => other,
    };
    if elevated {
        return HealthDecision::FallBackElevated;
    }
    match failure {
        ServiceFailure::Unreachable => HealthDecision::Unreachable,
        ServiceFailure::Incompatible => HealthDecision::Incompatible,
        ServiceFailure::Transient => unreachable!("mapped to Unreachable above"),
    }
}

/// Consecutive Transient capture outcomes tolerated before they stop being "transient": a
/// service that answers Busy or times out on every window for this many cycles is wedged, not
/// busy, and gets treated as unreachable so the repair banner can do its job. At the live
/// cadence (a window every ~3s) this is ~15s of sustained failure, under the frontend's own 30s
/// debounce - a genuinely busy service (one long diagnostic capture) never gets near it because
/// the diagnostic pauses live detection instead of racing it.
const TRANSIENT_ESCALATE_AFTER: u32 = 5;

/// Whether this process can open the promiscuous socket itself, probed ONCE: elevation is fixed
/// at process start, and the probe costs interface enumeration (hostname resolution included) -
/// not something to pay on every failed 2s cycle.
#[cfg(windows)]
fn process_is_elevated() -> bool {
    use std::sync::OnceLock;
    static ELEVATED: OnceLock<bool> = OnceLock::new();
    *ELEVATED.get_or_init(better_fleet::capture::can_open_capture_socket)
}

/// True while a Help-tab diagnostic capture holds the service pipe (#819 review): the service
/// serves one client at a time, so live detection PAUSES instead of racing the diagnostic -
/// otherwise every live window during a 20s diagnostic returns Busy, the silence clock runs out,
/// and the player flaps to MainMenu fleet-wide, caused by the very tool used to debug detection.
#[cfg(windows)]
static DIAGNOSTIC_IN_PROGRESS: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// The detection loop polls this to hold its captures (and its silence clock) while a diagnostic
/// owns the pipe. Always false off Windows: there the two captures use independent sockets.
pub fn diagnostic_capture_in_progress() -> bool {
    #[cfg(windows)]
    {
        DIAGNOSTIC_IN_PROGRESS.load(std::sync::atomic::Ordering::Relaxed)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Resets the capture health to Ok. Called when the game closes: with no game there is nothing
/// to capture, the banner's premise ("detection is dead") is moot, and a player who repairs the
/// service while the game is closed must not keep a stale banner - the next in-game capture
/// re-evaluates within seconds anyway.
pub fn reset_capture_health() {
    #[cfg(windows)]
    {
        capture_health_state::set(capture_health_state::OK);
        capture_health_state::reset_transients();
    }
}

/// One Windows capture, service-first (#819): the GUI runs unelevated, so the service IS the
/// capture. The one fallback is deliberate and visible: a player following the documented stopgap
/// - launching the app "as administrator" while the service is broken - still gets the in-process
/// capture, at degraded health, because stranding exactly the player who followed the support
/// advice would be absurd. Unelevated with no service yields no flows and a health state the
/// repair banner turns into a next step.
///
/// `connect_timeout` differs by caller: live detection gives up fast (500ms - its next window is
/// 2s away), the diagnostic waits out an in-flight live window (4s) since it runs once on demand.
///
/// Returns the flows, the raw packet count, and the backend label the Help-tab diagnostic prints.
#[cfg(windows)]
fn capture_windows_blocking(
    game_ports: Vec<u16>,
    window: Duration,
    connect_timeout: Duration,
) -> (Vec<FlowStat>, Option<u64>, &'static str) {
    use better_fleet::capture::service_proto::PROTOCOL_VERSION;
    // The label is pinned to the protocol the golden-frame tests freeze; this breaks the build if
    // PROTOCOL_VERSION ever moves without the string moving with it.
    const _: () = assert!(PROTOCOL_VERSION == 1);
    let served = capture_via_service(&game_ports, window, connect_timeout);
    let streak = match served {
        Err(ServiceFailure::Transient) => capture_health_state::count_transient(),
        _ => {
            capture_health_state::reset_transients();
            0
        }
    };
    let decision = decide_health(
        served.as_ref().map(|_| ()).map_err(|failure| *failure),
        streak,
        process_is_elevated(),
    );
    match decision {
        HealthDecision::Healthy => {
            capture_health_state::set(capture_health_state::OK);
            let (flows, raw_packets) = served.expect("Healthy implies a served capture");
            (flows, raw_packets, "capture-service (protocol v1)")
        }
        HealthDecision::HoldTransient => {
            // The service is alive but this window got nothing; health is left as it was.
            (Vec::new(), None, "unavailable (capture service busy or slow)")
        }
        HealthDecision::FallBackElevated => {
            capture_health_state::set(capture_health_state::DEGRADED_ELEVATED);
            log::info!(
                "[capture] service path failed but this process is elevated; capturing in-process (stopgap)"
            );
            let outcome = better_fleet::capture::run_capture_counted(game_ports, window);
            (outcome.flows, outcome.raw_packets, "in-process (elevated stopgap)")
        }
        HealthDecision::Unreachable => {
            if streak >= TRANSIENT_ESCALATE_AFTER {
                log::error!(
                    "[capture] the capture service has been busy or silent for {TRANSIENT_ESCALATE_AFTER} consecutive windows; treating it as unreachable"
                );
            }
            capture_health_state::set(capture_health_state::SERVICE_UNREACHABLE);
            (Vec::new(), None, "unavailable (capture service unreachable)")
        }
        HealthDecision::Incompatible => {
            capture_health_state::set(capture_health_state::SERVICE_INCOMPATIBLE);
            (Vec::new(), None, "unavailable (capture service incompatible)")
        }
    }
}


/// Sniffs every game UDP port for `window` and returns the flows ranked by volume (desc), through
/// the capture service (#819): the GUI runs unelevated and the privileged socket lives in the
/// BetterFleetCapture service, reached over its named pipe. Off the async runtime because the
/// pipe transaction blocks for the whole capture window - exactly as the promiscuous sockets did
/// when the capture ran in-process.
#[cfg(windows)]
pub async fn capture_flows(game_ports: Vec<u16>, window: Duration) -> Vec<FlowStat> {
    match tokio::task::spawn_blocking(move || {
        capture_windows_blocking(game_ports, window, Duration::from_millis(500))
    })
    .await
    {
        Ok((flows, _raw_packets, _backend)) => flows,
        Err(e) => {
            error!("[capture] capture thread failed: {e}");
            Vec::new()
        }
    }
}

/// Captures for the diagnostic, additionally returning how many packets the capture actually
/// received before the game-port filter (`Some` on Windows; `None` elsewhere, where capture runs in
/// a separate helper process and the raw count is not surfaced). Live detection uses `capture_flows`
/// and never pays for this.
#[cfg(windows)]
async fn capture_for_diagnostic(
    game_ports: Vec<u16>,
    window: Duration,
) -> (Vec<FlowStat>, Option<u64>, &'static str) {
    // Same service-first path as live detection; the wire carries raw_packets (#816) so the
    // diagnostic keeps its "capture blocked" signal, and the backend label says which of the
    // paths actually served the numbers a support report is read against (#819).
    //
    // The flag pauses live detection for the whole capture: the service serves one client at a
    // time, and the two racing turned a 20s diagnostic into a fleet-visible MainMenu flap (#819
    // review). RAII so a panicking capture cannot leave detection paused forever. The 4s connect
    // budget waits out one in-flight live window instead of giving up at 500ms like live does.
    struct PauseLiveDetection;
    impl Drop for PauseLiveDetection {
        fn drop(&mut self) {
            DIAGNOSTIC_IN_PROGRESS.store(false, std::sync::atomic::Ordering::Relaxed);
        }
    }
    DIAGNOSTIC_IN_PROGRESS.store(true, std::sync::atomic::Ordering::Relaxed);
    let _pause = PauseLiveDetection;
    match tokio::task::spawn_blocking(move || {
        capture_windows_blocking(game_ports, window, Duration::from_secs(4))
    })
    .await
    {
        Ok(outcome) => outcome,
        Err(e) => {
            error!("[capture] capture thread failed: {e}");
            (Vec::new(), None, "unavailable (capture thread failed)")
        }
    }
}

#[cfg(not(windows))]
async fn capture_for_diagnostic(
    game_ports: Vec<u16>,
    window: Duration,
) -> (Vec<FlowStat>, Option<u64>, &'static str) {
    // The label tells a support reader why the numbers are empty without the log: a capture that
    // was skipped for want of ports (#856) reads nothing like a helper that ran and heard nothing.
    let backend = if game_ports.is_empty() {
        "skipped (no candidate UDP ports)"
    } else {
        "linux helper / in-process"
    };
    (capture_flows(game_ports, window).await, None, backend)
}

/// Linux raw-capture backend (#725, #726). Server detection needs an `AF_PACKET` socket, which needs
/// `CAP_NET_RAW`. To keep the Tauri GUI unprivileged, the capture is isolated in a tiny helper binary
/// (`betterfleet-netcap`) that carries the capability on its own: the GUI spawns it with the game
/// ports and window, and reads back the ranked flows as JSON. If the helper is unavailable or fails -
/// for instance a dev build with no capability granted, or a packaging that shipped without it - we
/// fall back to capturing in-process, which still works for a developer who ran `setcap` on the GUI
/// binary itself. Either path feeds the same [`better_fleet_netcap`] ranking, so live detection and
/// the diagnostic behave identically whichever one ran. A total failure yields no flows, so detection
/// degrades to "no server" rather than crashing.
///
/// Shared by the diagnostic report and by live detection (both call `capture_flows`), so both benefit
/// from the privilege-separated helper without either knowing which path served the flows.
#[cfg(target_os = "linux")]
pub async fn capture_flows(game_ports: Vec<u16>, window: Duration) -> Vec<FlowStat> {
    if game_ports.is_empty() {
        // Zero candidate ports is useless to BOTH backends: the helper's contract requires at
        // least one (an empty argument is its exit-2 usage error), and the in-process fallback
        // would filter every packet out anyway. Spawning either only manufactures misleading
        // errors - the field report behind #856 carried fourteen ERROR lines pointing at setcap
        // while the real condition, port discovery returning nothing, was never named. Name it,
        // once, and skip.
        info!("[capture] no candidate UDP ports this cycle; skipping capture");
        return Vec::new();
    }
    if let Some(flows) = capture_via_helper(&game_ports, window).await {
        return flows;
    }
    // The helper was missing or could not capture; fall back to an in-process capture, which needs
    // CAP_NET_RAW on the GUI binary itself. AF_PACKET recv blocks, so run it on a blocking thread and
    // await the result, mirroring how the Windows path awaits its sniff tasks.
    info!("[capture] falling back to in-process AF_PACKET capture (betterfleet-netcap unavailable)");
    match tokio::task::spawn_blocking(move || better_fleet::capture::run_capture(game_ports, window))
        .await
    {
        Ok(flows) => flows,
        Err(e) => {
            error!("[capture] in-process AF_PACKET capture thread failed: {e}");
            Vec::new()
        }
    }
}

/// Runs the `betterfleet-netcap` helper for one capture window and returns the flows it printed, or
/// `None` if the helper could not be used - missing, failed to spawn, exited non-zero (for instance
/// it lacks `CAP_NET_RAW`), or printed output we could not parse - so the caller falls back to
/// in-process capture. The blocking process wait runs on a blocking thread so the detection runtime
/// is never stalled.
#[cfg(target_os = "linux")]
async fn capture_via_helper(game_ports: &[u16], window: Duration) -> Option<Vec<FlowStat>> {
    let helper = locate_capture_helper();
    let ports_arg = game_ports
        .iter()
        .map(|port| port.to_string())
        .collect::<Vec<_>>()
        .join(",");
    // The helper takes a whole-seconds window; keep at least 1s so a sub-second window still captures.
    let window_arg = window.as_secs().max(1).to_string();

    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new(&helper)
            .arg(&ports_arg)
            .arg(&window_arg)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
    })
    .await;

    let output = match output {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                info!("[capture] betterfleet-netcap not found beside the executable or on PATH");
            } else {
                error!("[capture] could not spawn betterfleet-netcap: {e}");
            }
            return None;
        }
        Err(e) => {
            error!("[capture] betterfleet-netcap wait thread failed: {e}");
            return None;
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Exit 2 is the helper's usage contract (pinned by helper_contract.rs): WE called it
        // wrong, and the in-process fallback fed the same arguments would be equally futile.
        // Reporting it as "unavailable" pointed a whole field report at setcap for a bug that
        // lived here (#856). Own it loudly and serve no flows.
        if output.status.code() == Some(2) {
            error!(
                "[capture] bug: betterfleet-netcap rejected its arguments (exit 2): {}",
                stderr.trim()
            );
            return Some(Vec::new());
        }
        error!(
            "[capture] betterfleet-netcap exited with {}: {}",
            output.status,
            stderr.trim()
        );
        return None;
    }

    match serde_json::from_slice::<Vec<FlowStat>>(&output.stdout) {
        Ok(flows) => {
            // debug!, not info!: capture_flows runs on every detection cycle, so this fired once a
            // cycle and, with the log rotation misconfigured, helped bury the logs in tiny files.
            log::debug!("[capture] betterfleet-netcap returned {} flow(s)", flows.len());
            Some(flows)
        }
        Err(e) => {
            error!("[capture] could not parse betterfleet-netcap output: {e}");
            None
        }
    }
}

/// Finds the `betterfleet-netcap` helper: next to the running executable first (where the packaged
/// helper is installed alongside the GUI), otherwise a bare name for the OS to resolve on `PATH` (a
/// dev convenience - `cargo build` drops it in the same target dir). Returning a bare name means a
/// genuinely missing helper surfaces as a `NotFound` spawn error, which the caller treats as "fall
/// back to in-process".
#[cfg(target_os = "linux")]
fn locate_capture_helper() -> std::path::PathBuf {
    const HELPER: &str = "betterfleet-netcap";
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(HELPER);
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    std::path::PathBuf::from(HELPER)
}

/// macOS (and any other non-Windows, non-Linux target): no capture backend yet, so detection reports
/// no server. Kept a stub deliberately - the desktop app ships for Windows and Linux.
#[cfg(not(any(windows, target_os = "linux")))]
pub async fn capture_flows(_game_ports: Vec<u16>, _window: Duration) -> Vec<FlowStat> {
    Vec::new()
}

/// Picks the dominant Sea of Thieves server flow: the highest-volume flow whose
/// remote port is in the SoT server range and that carries at least `min_packets`.
/// Returns None when nothing qualifies (e.g. the main menu, which sends no server
/// traffic). Volume is the discriminator: the real server pushes sustained traffic
/// while the many Steam Datagram Relay flows are sparse, even though both can fall
/// inside the plausible port range.
pub fn pick_server_flow(flows: &[FlowStat], min_packets: u32) -> Option<&FlowStat> {
    flows
        .iter()
        .filter(|flow| flow.plausible_sot_port && flow.packets >= min_packets)
        .max_by(|a, b| a.packets.cmp(&b.packets).then(a.bytes.cmp(&b.bytes)))
}

/// Picks the per-server session-coordinator flow: the one that identifies WHICH server a
/// player is on. It is the sparse, two-way, plausible-SoT flow that everyone on a world
/// instance shares, and it is deliberately NOT the busy gameplay flow (that is
/// [`pick_server_flow`]).
///
/// The flow must be bidirectional - a real coordinator always is, a one-way probe is not - EXCEPT
/// on a capture that recorded no outbound packet at all, which is a receive-only socket rather
/// than a set of one-way peers (#837).
///
/// The busy flow is a per-client connection to an Azure game host whose IP is reused across
/// different servers (issue #364: several distinct servers all ran on 51.103.72.36), so it
/// cannot tell servers apart: hashing it merged different servers into one card. The session
/// flow's ip:port instead is identical for everyone on one server (case A: four players on
/// different ships, one server, all on 20.33.49.115:31260) and differs between servers even on
/// a shared host (cases B/D). `min_packets` is a small floor that rejects one-off stray packets;
/// bidirectionality is required except on a receive-only capture (see above).
///
/// Live detection accumulates flows across capture windows (see `merge_flows`) before calling
/// this, because the session flow is only a handful of packets spread over the whole session and
/// a single short window often misses it.
// Production callers all know their game socket and use the _excluding variant; this shape is
// kept for the capture-corpus tests, which validate the ranking without a live connection.
#[cfg_attr(not(test), allow(dead_code))]
pub fn pick_session_flow(flows: &[FlowStat], min_packets: u32) -> Option<&FlowStat> {
    pick_session_flow_excluding(flows, min_packets, None)
}

/// [`pick_session_flow`] with the game connection's LOCAL port barred from candidacy (#832).
///
/// Live detection knows which local socket carries the gameplay host, and no flow on that socket
/// is ever the identity - the coordinator always lives on its own socket. The volume-based
/// exclusions below cannot express that: after a Steam Datagram Relay reroute the accumulation
/// holds TWO host-class flows on the game socket, and the freshly-migrated one (a single window's
/// volume, dwarfed by the old host's accumulation) sails under the 4x cap and out-ranks the sparse
/// coordinator - locking the fleet onto the per-client host endpoint this function exists to
/// avoid. The diagnostic report has no connection to name and passes `None`, keeping its
/// historical behaviour.
/// A capture that saw NOT ONE outbound packet across every flow it has is receive-only, not a set
/// of one-way peers: SIO_RCVALL delivers received packets but never the locally sent ones on a
/// range of NIC/driver combinations (Wi-Fi especially), and the machine's owner cannot fix that
/// (#837). Requiring a return leg there rejects every candidate forever - reports #901-#915 are
/// one player, four game launches, 16 captured flows all `outbound: 0`, and not a single `Server
/// detected` in an hour. Where at least one flow IS bidirectional the capture is proven two-way.
/// One predicate for both consumers - the session-flow gate relaxation and the report's
/// `receive_only_capture` flag - so the two can never drift apart.
fn capture_is_receive_only(flows: &[FlowStat]) -> bool {
    !flows.is_empty() && flows.iter().all(|f| f.outbound == 0)
}

pub fn pick_session_flow_excluding(
    flows: &[FlowStat],
    min_packets: u32,
    excluded_local_port: Option<u16>,
) -> Option<&FlowStat> {
    // The dominant plausible flow is the game host; exclude it so we pick the coordinator.
    let host = pick_server_flow(flows, 1);
    let capture_is_receive_only = capture_is_receive_only(flows);
    flows
        .iter()
        .filter(|flow| {
            flow.plausible_sot_port
                && flow.packets >= min_packets
                && flow.inbound > 0
                && (flow.outbound > 0 || capture_is_receive_only)
                && excluded_local_port != Some(flow.local_port)
                && host.map_or(true, |h| !std::ptr::eq(*flow, h))
                // The coordinator is sparse BY DEFINITION: a handful of packets against the
                // host's hundreds. Any flow within 4x of the host's volume is host-class traffic
                // (typically the previous server's gameplay flow caught in a window that straddled
                // a server switch), and locking it would hand the fleet the ambiguous per-client
                // host endpoint. 4x keeps a huge margin: the corpus-worst coordinator (24 pkts/20s)
                // is ~40x below the corpus-weakest host (941 pkts/20s).
                && host.map_or(true, |h| flow.packets.saturating_mul(4) <= h.packets)
        })
        // Among the remaining coordinator candidates, the most established one wins. The remote
        // endpoint terminates the ordering: coordinator packets are fixed-size (bytes = 76 x
        // packets across the whole corpus) and the coordinator local socket persists across
        // servers, so (packets, bytes, local_port) alone can genuinely tie between two remotes,
        // and a tie must not fall through to HashMap iteration order, or the locked identity
        // becomes nondeterministic.
        .max_by(|a, b| {
            a.packets
                .cmp(&b.packets)
                .then(a.bytes.cmp(&b.bytes))
                .then(b.local_port.cmp(&a.local_port))
                .then(b.remote_ip.cmp(&a.remote_ip))
                .then(b.remote_port.cmp(&a.remote_port))
        })
}

/// Merges one capture window's flows into a running per-game accumulator keyed by
/// (local_port, remote_ip, remote_port), summing volume and widening the observed time span.
/// The live loop feeds every window here so the sparse session flow accrues enough packets to be
/// recognised by [`pick_session_flow`], even though any single window may carry only one or two of
/// its packets. Kept I/O-free so the accumulation is unit-tested deterministically.
pub fn merge_flows(acc: &mut HashMap<(u16, String, u16), FlowStat>, window: &[FlowStat]) {
    for flow in window {
        acc.entry((flow.local_port, flow.remote_ip.clone(), flow.remote_port))
            .and_modify(|e| {
                e.packets += flow.packets;
                e.bytes += flow.bytes;
                e.inbound += flow.inbound;
                e.outbound += flow.outbound;
                e.first_seen_ms = e.first_seen_ms.min(flow.first_seen_ms);
                e.last_seen_ms = e.last_seen_ms.max(flow.last_seen_ms);
            })
            .or_insert_with(|| flow.clone());
    }
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
    let (flows, raw_packets, capture_backend) = capture_for_diagnostic(game_ports, duration).await;
    let total_packets: u32 = flows.iter().map(|flow| flow.packets).sum();
    let top_candidates: Vec<FlowStat> = flows
        .iter()
        .filter(|flow| flow.plausible_sot_port)
        .cloned()
        .collect();

    // Receive-only capture (#837): one shared predicate with the session-flow gate, see
    // capture_is_receive_only.
    let receive_only_capture = capture_is_receive_only(&flows);

    DiagnosticReport {
        note,
        game_status,
        pid,
        duration_ms: started.elapsed().as_millis() as u64,
        main_menu_port,
        udp_ports_netstat2,
        udp_ports_powershell,
        total_packets,
        raw_packets,
        distinct_flows: flows.len(),
        receive_only_capture,
        top_candidates,
        flows,
        capture_backend: capture_backend.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use super::*;
    // is_plausible_sot_port moved to the capture crate with the aggregator (#726); the ranking/pick
    // tests below still use it to derive plausibility, and Deserialize backs the #364 corpus structs.
    use better_fleet::capture::is_plausible_sot_port;
    use serde::Deserialize;

    // The capture-health policy (#819) decides whether a broken service becomes a repair banner
    // or silent no-detection. It had no tests until #859 - the whole point of the mechanism is
    // that it cannot fail quietly, so every branch is pinned here.

    #[test]
    fn a_served_capture_is_healthy_whatever_the_streak_was() {
        assert_eq!(decide_health(Ok(()), 0, false), HealthDecision::Healthy);
        assert_eq!(decide_health(Ok(()), 99, true), HealthDecision::Healthy);
    }

    #[test]
    fn transient_failures_hold_until_the_escalation_threshold() {
        for streak in 1..TRANSIENT_ESCALATE_AFTER {
            assert_eq!(
                decide_health(Err(ServiceFailure::Transient), streak, false),
                HealthDecision::HoldTransient,
                "streak {streak} should still be tolerated"
            );
        }
    }

    #[test]
    fn a_permanently_busy_service_escalates_to_unreachable() {
        // The #819 review's finding: a wedged capture thread answers Busy or times out forever,
        // and without escalation health stays wherever it was - banner never arms, no detection,
        // no signal. At the threshold it must become a repair condition.
        assert_eq!(
            decide_health(
                Err(ServiceFailure::Transient),
                TRANSIENT_ESCALATE_AFTER,
                false
            ),
            HealthDecision::Unreachable
        );
        assert_eq!(
            decide_health(
                Err(ServiceFailure::Transient),
                TRANSIENT_ESCALATE_AFTER * 3,
                false
            ),
            HealthDecision::Unreachable
        );
    }

    #[test]
    fn an_escalated_transient_still_takes_the_elevated_stopgap() {
        // A player who followed the "run as administrator" advice keeps capturing even once the
        // service is declared wedged.
        assert_eq!(
            decide_health(
                Err(ServiceFailure::Transient),
                TRANSIENT_ESCALATE_AFTER,
                true
            ),
            HealthDecision::FallBackElevated
        );
    }

    #[test]
    fn a_transient_below_the_threshold_never_falls_back_even_when_elevated() {
        // Falling back on the first slow window would abandon a service that is merely busy with
        // a diagnostic capture, and would report degraded health for a working setup.
        assert_eq!(
            decide_health(Err(ServiceFailure::Transient), 1, true),
            HealthDecision::HoldTransient
        );
    }

    #[test]
    fn hard_failures_are_repair_conditions_when_unelevated() {
        assert_eq!(
            decide_health(Err(ServiceFailure::Unreachable), 0, false),
            HealthDecision::Unreachable
        );
        assert_eq!(
            decide_health(Err(ServiceFailure::Incompatible), 0, false),
            HealthDecision::Incompatible
        );
    }

    #[test]
    fn hard_failures_prefer_the_stopgap_when_the_process_is_elevated() {
        // Stranding exactly the player who followed the support advice would be absurd, so the
        // in-process capture wins over the banner - at degraded health, without a banner.
        for failure in [ServiceFailure::Unreachable, ServiceFailure::Incompatible] {
            assert_eq!(
                decide_health(Err(failure), 0, true),
                HealthDecision::FallBackElevated,
                "{failure:?} should fall back when elevated"
            );
        }
    }

    #[test]
    fn raw_packets_is_reported_and_distinct_from_game_packets() {
        let report = |raw: Option<u64>| DiagnosticReport {
            note: "in game".into(),
            game_status: "Started".into(),
            pid: Some(7976),
            duration_ms: 20000,
            main_menu_port: 0,
            udp_ports_netstat2: vec![],
            udp_ports_powershell: vec![],
            total_packets: 0,
            raw_packets: raw,
            distinct_flows: 0,
            receive_only_capture: false,
            top_candidates: vec![],
            flows: vec![],
            capture_backend: "capture-service (protocol v1)".into(),
        };
        // The socket saw traffic but none on the game ports: capture works, the ports are the
        // problem. total_packets (game-matched) and raw_packets (all) must be independent fields.
        let measured = serde_json::to_string(&report(Some(4213))).unwrap();
        assert!(measured.contains("\"raw_packets\":4213"), "{measured}");
        assert!(measured.contains("\"total_packets\":0"), "{measured}");
        // Not measured (the Linux helper does not surface it) serializes as null, never 0, so
        // "capture blocked" is never inferred where it was simply not counted.
        let unmeasured = serde_json::to_string(&report(None)).unwrap();
        assert!(unmeasured.contains("\"raw_packets\":null"), "{unmeasured}");
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
    // (sameServer). Every player has two plausible-SoT flows: a busy one (~1000 packets, the game
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

    // The fix for #364: the server a player is on is identified by the session-coordinator flow
    // (pick_session_flow), not the busy gameplay flow. Across every scenario (same-server and
    // different-server, including different servers sharing one Azure host), grouping the captures by
    // the session flow's ip:port matches the ground truth exactly. The busy flow cannot: see the next
    // test. This drives the live identity, so it validates the shipped pick_session_flow directly.
    #[test]
    fn the_session_flow_ip_port_matches_ground_truth_across_the_whole_corpus() {
        let corpus = load_corpus();
        assert!(corpus.scenarios.len() >= 4, "corpus lost scenarios");

        for s in &corpus.scenarios {
            let session_ids: HashSet<(String, u16)> = s
                .captures
                .iter()
                .map(|c| {
                    let f = pick_session_flow(&c.flows, 2).unwrap_or_else(|| {
                        panic!("case {}: a capture has no session flow", s.case)
                    });
                    (f.remote_ip.clone(), f.remote_port)
                })
                .collect();
            let one_session = session_ids.len() == 1;
            assert_eq!(
                one_session, s.same_server,
                "case {}: session-flow grouping saw {} session(s), ground truth sameServer={}",
                s.case,
                session_ids.len(),
                s.same_server
            );
        }
    }

    // Why the shipped identity is wrong. #656 hashes the busy flow's IP, and cases B and D are two
    // players on DIFFERENT servers that share one host IP (51.103.72.36), so the busy IP merges
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

    /// Builds a FlowStat with plausibility derived from the port, for terse synthetic tests.
    fn flow(local: u16, ip: &str, port: u16, packets: u32, inbound: u32, outbound: u32) -> FlowStat {
        FlowStat {
            local_port: local,
            remote_ip: ip.to_string(),
            remote_port: port,
            packets,
            bytes: packets as u64 * 100,
            inbound,
            outbound,
            plausible_sot_port: is_plausible_sot_port(port),
            first_seen_ms: 0,
            last_seen_ms: packets as u64 * 500,
        }
    }

    // --- Receive-only captures (#837) ---------------------------------------------------------
    //
    // Reports #901-#915: one player, four game launches, sixteen captured flows, every one
    // `outbound: 0` - SIO_RCVALL delivering received packets but never locally sent ones. The
    // bidirectionality gate then rejected every candidate and the session never resolved: six
    // "resolving the session flow", zero "Server detected", in an hour.

    #[test]
    fn a_receive_only_capture_still_resolves_the_session() {
        // The real numbers from report #901's diagnostic.
        let flows = [
            flow(55616, "20.153.191.9", 30278, 599, 599, 0),
            flow(61079, "20.33.2.31", 31065, 4, 4, 0),
        ];
        let picked = pick_session_flow(&flows, 3)
            .expect("a receive-only capture must still yield the coordinator");
        assert_eq!(picked.remote_ip, "20.33.2.31");
        assert_eq!(picked.remote_port, 31065);
    }

    #[test]
    fn one_bidirectional_flow_proves_the_capture_and_keeps_the_gate() {
        // The socket is two-way, so a one-way flow is a genuinely one-way peer - a stray probe -
        // and must still be rejected. That is what the gate is for.
        let flows = [
            flow(55616, "20.153.191.9", 30278, 599, 300, 299),
            flow(61079, "20.33.2.31", 31065, 4, 4, 0), // one-way probe
            flow(61080, "20.33.2.99", 31066, 5, 3, 2), // the real coordinator
        ];
        let picked = pick_session_flow(&flows, 3).unwrap();
        assert_eq!(picked.remote_ip, "20.33.2.99");
    }

    #[test]
    fn a_receive_only_capture_still_refuses_a_non_candidate() {
        // Relaxing the return leg relaxes nothing else: the port range, the packet floor, the host
        // exclusion and the 4x cap all still apply.
        let flows = [
            flow(55616, "20.153.191.9", 30278, 599, 599, 0),
            flow(61079, "8.8.8.8", 53, 40, 40, 0), // implausible port
            flow(61080, "20.33.2.31", 31065, 2, 2, 0), // plausible, under the floor
        ];
        assert!(pick_session_flow(&flows, 3).is_none());
    }

    #[test]
    fn pick_session_flow_excludes_the_busy_host_and_takes_the_coordinator() {
        // The busy game host (huge volume) and the sparse two-way coordinator both sit in the SoT
        // port range. The session identity is the coordinator, never the host.
        let flows = vec![
            flow(61390, "51.103.45.67", 30970, 1799, 1200, 599), // busy host
            flow(51485, "20.33.49.115", 31260, 12, 8, 4),        // coordinator
        ];
        let session = pick_session_flow(&flows, 3).expect("a session flow should be picked");
        assert_eq!(session.remote_ip, "20.33.49.115");
        assert_eq!(session.remote_port, 31260);
        // pick_server_flow still returns the host, so the two are cleanly distinct.
        assert_eq!(pick_server_flow(&flows, 5).unwrap().remote_ip, "51.103.45.67");
    }

    #[test]
    fn pick_session_flow_ignores_one_way_and_below_floor_noise() {
        let flows = vec![
            flow(61390, "51.103.45.67", 30970, 1799, 1200, 599), // busy host
            flow(50000, "20.9.9.9", 35001, 40, 40, 0),           // one-way probe, never a coordinator
            flow(50001, "20.8.8.8", 35002, 1, 1, 0),             // single stray packet
        ];
        assert!(
            pick_session_flow(&flows, 3).is_none(),
            "one-way and sub-floor flows must not be taken as the session"
        );
    }

    #[test]
    fn pick_session_flow_keeps_the_port_so_a_recurring_ip_is_not_merged() {
        // Cases E/F: the same session IP (20.33.6.37) recurs across two different servers on
        // different ports. The identity must carry the port, or the two servers merge.
        let e_flows = [
            flow(40000, "51.103.72.36", 31059, 935, 470, 465), // host
            flow(40001, "20.33.6.37", 31127, 6, 3, 3),         // session on :31127
        ];
        let f_flows = [
            flow(40002, "51.103.72.36", 30758, 1123, 560, 563), // host
            flow(40003, "20.33.6.37", 30879, 6, 3, 3),          // session on :30879
        ];
        let e = pick_session_flow(&e_flows, 3).expect("E session");
        let f = pick_session_flow(&f_flows, 3).expect("F session");
        assert_eq!(e.remote_ip, f.remote_ip, "same recurring session IP");
        assert_ne!(
            (e.remote_ip.clone(), e.remote_port),
            (f.remote_ip.clone(), f.remote_port),
            "the port distinguishes the two servers"
        );
    }

    #[test]
    fn a_host_class_residual_is_never_the_session() {
        // Two busy-class flows in one accumulation (a window straddling a server switch: the new
        // host plus the old host's teardown, both bidirectional and in the SoT range). The sparse
        // guard must reject the residual (locking it would report the ambiguous per-client host
        // endpoint) and pick the true coordinator when present, or nothing at all.
        let residual_only = [
            flow(60445, "51.103.72.36", 30686, 450, 226, 224), // new host (busiest -> excluded)
            flow(55306, "51.103.72.36", 31037, 300, 150, 150), // old host residual: host-class
        ];
        assert!(
            pick_session_flow(&residual_only, 3).is_none(),
            "a host-class flow must never pass as the sparse session"
        );

        let with_coordinator = [
            flow(60445, "51.103.72.36", 30686, 450, 226, 224),
            flow(55306, "51.103.72.36", 31037, 300, 150, 150),
            flow(55329, "145.190.66.42", 30099, 4, 2, 2), // the real coordinator
        ];
        let session = pick_session_flow(&with_coordinator, 3).expect("coordinator expected");
        assert_eq!(session.remote_ip, "145.190.66.42");
        assert_eq!(session.remote_port, 30099);
    }

    #[test]
    fn an_exact_tie_between_two_coordinators_resolves_deterministically() {
        // Coordinator packets are fixed-size and the coordinator local socket persists across
        // servers, so two remotes can tie on (packets, bytes, local_port) exactly. The pick must
        // not depend on slice (or HashMap iteration) order.
        let host = flow(60445, "51.103.72.36", 30686, 450, 226, 224);
        let a = flow(52354, "145.190.66.42", 30034, 4, 2, 2);
        let b = flow(52354, "145.190.66.42", 30099, 4, 2, 2);

        let one_order = [host.clone(), a.clone(), b.clone()];
        let other_order = [host, b, a];
        let first = pick_session_flow(&one_order, 3).expect("a pick");
        let second = pick_session_flow(&other_order, 3).expect("a pick");
        assert_eq!(
            (first.remote_ip.clone(), first.remote_port),
            (second.remote_ip.clone(), second.remote_port),
            "the tie-break must be a total order, independent of input order"
        );
    }

    #[test]
    fn merge_flows_accumulates_a_sparse_flow_across_windows() {
        // The busy host is in every window (that is why pick_session_flow is called at all); the
        // coordinator drips one packet per window, alternating direction. No single window has the
        // coordinator both bidirectional and above the floor, but the accumulation does, which is the point.
        let mut acc: HashMap<(u16, String, u16), FlowStat> = HashMap::new();
        let host = flow(61390, "51.103.45.67", 30970, 900, 450, 450);

        merge_flows(&mut acc, &[host.clone(), flow(51485, "20.33.49.115", 31260, 1, 1, 0)]);
        assert!(
            pick_session_flow(&acc.values().cloned().collect::<Vec<_>>(), 3).is_none(),
            "one coordinator packet is not yet a session"
        );
        merge_flows(&mut acc, &[host.clone(), flow(51485, "20.33.49.115", 31260, 1, 0, 1)]);
        merge_flows(&mut acc, &[host.clone(), flow(51485, "20.33.49.115", 31260, 1, 1, 0)]);

        let accumulated: Vec<FlowStat> = acc.values().cloned().collect();
        assert_eq!(accumulated.len(), 2, "host + coordinator, one logical flow each");
        let session = pick_session_flow(&accumulated, 3).expect("coordinator now resolvable");
        assert_eq!(session.remote_ip, "20.33.49.115");
        assert_eq!(session.remote_port, 31260);
        assert_eq!(session.packets, 3);
        assert_eq!(session.inbound, 2);
        assert_eq!(session.outbound, 1);
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
