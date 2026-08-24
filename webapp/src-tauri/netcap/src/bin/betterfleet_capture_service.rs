//! The Windows capture service (#816, lot 2 of #732): the privileged host for the shared capture
//! core.
//!
//! Windows has no per-binary capability - privilege is process context - so where Linux grants
//! `CAP_NET_RAW` to a short-lived helper binary, Windows needs a resident privileged process: a
//! service registered with the SCM. This binary is that process and nothing more: it listens on
//! one named pipe, answers one validated capture request per connection through the exact same
//! `run_capture_counted` the GUI calls in-process today, and reports its lifecycle to the SCM.
//!
//! Service account (#817, decided in writing): **LocalSystem**, not LocalService. Opening the
//! capture socket takes `SOCK_RAW` plus `WSAIoctl(SIO_RCVALL)`, and Windows reserves raw-socket
//! creation to administrative tokens; LocalService is deliberately not one, so a LocalService
//! host would fail at the exact call this service exists to make. The blast radius is contained
//! by the service doing nothing but capture-and-answer (no impersonation, no execution, no
//! caller-controlled paths) behind the DACL in `service_ipc`. If a VM check ever proves
//! LocalService can hold this socket, downgrade - smaller is better - but do not assume it.
//!
//! Install/uninstall is the installer's job (#818). For hand-testing on a VM:
//!   sc create BetterFleetCapture binPath= "C:\path\to\betterfleet-capture-service.exe"
//!   sc failure BetterFleetCapture reset= 86400 actions= restart/5000/restart/30000/restart/60000
//!   sc start BetterFleetCapture
//! or run `betterfleet-capture-service --console` from an elevated terminal for a foreground
//! server with the same behaviour and no SCM. The `sc failure` line is the restart policy #818
//! will register for real installs; it also shrinks the window in which the pipe name sits
//! unowned (see the squatting note on `PIPE_SDDL`).

#[cfg(windows)]
fn main() {
    service::main();
}

#[cfg(not(windows))]
fn main() {
    eprintln!(
        "betterfleet-capture-service only exists on Windows; on Linux the betterfleet-netcap \
         helper carries the capture privilege instead"
    );
    std::process::exit(1);
}

#[cfg(windows)]
mod service {
    use std::ffi::OsString;
    use std::io::Write;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use std::time::Duration;

    use better_fleet_netcap::service_ipc::{
        remaining_cooldown, serve_one_request, ServeOutcome,
    };
    use better_fleet_netcap::service_proto::{MAX_WINDOW_SECS, PIPE_NAME};
    use windows_service::service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    };
    use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
    use windows_service::service_dispatcher;

    /// The name the SCM knows the service by; the installer (#818) and `sc` commands use it.
    const SERVICE_NAME: &str = "BetterFleetCapture";

    /// Bounds each pipe read/write. The capture between them is bounded by request validation.
    const IO_DEADLINE: Duration = Duration::from_secs(5);

    static STOP: AtomicBool = AtomicBool::new(false);
    static STATUS: OnceLock<service_control_handler::ServiceStatusHandle> = OnceLock::new();

    windows_service::define_windows_service!(ffi_service_main, service_entry);

    /// Routes the `log` crate into the service log: the capture core's `error!` lines and the
    /// transport's peer-identification `info!` lines (#817) would otherwise vanish - a service has
    /// no console, and nothing else installs a logger in this process.
    struct ServiceLogger;

    impl log::Log for ServiceLogger {
        fn enabled(&self, metadata: &log::Metadata) -> bool {
            metadata.level() <= log::Level::Info
        }

        fn log(&self, record: &log::Record) {
            if self.enabled(record.metadata()) {
                log_line(&format!("{} {}", record.level(), record.args()));
            }
        }

        fn flush(&self) {}
    }

    static LOGGER: ServiceLogger = ServiceLogger;

    pub fn main() {
        if log::set_logger(&LOGGER).is_ok() {
            log::set_max_level(log::LevelFilter::Info);
        }
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.iter().any(|a| a == "--console") {
            log_line("running in console mode (no SCM)");
            serve_loop();
            return;
        }
        if let Err(e) = service_dispatcher::start(SERVICE_NAME, ffi_service_main) {
            // Launched from a terminal rather than by the SCM: say how to do either properly.
            eprintln!(
                "betterfleet-capture-service was not started by the service control manager \
                 ({e:?}).\nRun it with --console for a foreground server, or register it:\n  \
                 sc create {SERVICE_NAME} binPath= \"<full path to this exe>\""
            );
            std::process::exit(1);
        }
    }

    fn service_entry(_arguments: Vec<OsString>) {
        if let Err(e) = run_service() {
            log_line(&format!("service failed: {e:?}"));
        }
    }

    fn run_service() -> windows_service::Result<()> {
        let status_handle = service_control_handler::register(SERVICE_NAME, |control| {
            match control {
                ServiceControl::Stop => {
                    // StopPending goes out BEFORE the flag: the serve loop reports Stopped the
                    // moment it notices the flag, and Stopped must never precede StopPending. The
                    // wait hint covers a capture in flight (bounded by MAX_WINDOW_SECS), so the
                    // SCM waits it out instead of declaring the service hung mid-request.
                    if let Some(handle) = STATUS.get() {
                        let _ = handle.set_service_status(status(
                            ServiceState::StopPending,
                            Duration::from_secs(MAX_WINDOW_SECS + 10),
                        ));
                    }
                    STOP.store(true, Ordering::Relaxed);
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        })?;
        let _ = STATUS.set(status_handle);

        status_handle.set_service_status(status(ServiceState::Running, Duration::ZERO))?;
        serve_loop();
        status_handle.set_service_status(status(ServiceState::Stopped, Duration::ZERO))?;
        Ok(())
    }

    fn status(state: ServiceState, wait_hint: Duration) -> ServiceStatus {
        ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: state,
            controls_accepted: if state == ServiceState::Running {
                ServiceControlAccept::STOP
            } else {
                ServiceControlAccept::empty()
            },
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint,
            process_id: None,
        }
    }

    fn serve_loop() {
        log_line(&format!("listening on {PIPE_NAME}"));
        let mut last_served: Option<std::time::Instant> = None;
        while !STOP.load(Ordering::Relaxed) {
            // The cooldown floor (#817): a capture per request must not be spinnable in a tight
            // loop. Slept out BEFORE the next accept, so the pipe simply does not exist during
            // the pause - the legitimate client's connect retry rides that out.
            if let Some(previous) = last_served {
                let owed = remaining_cooldown(previous.elapsed());
                if !owed.is_zero() {
                    std::thread::sleep(owed);
                }
            }
            let outcome = serve_one_request(PIPE_NAME, &STOP, IO_DEADLINE, |ports, window| {
                let outcome = better_fleet_netcap::run_capture_counted(ports, window);
                (outcome.flows, outcome.raw_packets)
            });
            match outcome {
                Ok(ServeOutcome::Served) => {
                    last_served = Some(std::time::Instant::now());
                }
                Ok(ServeOutcome::Stopped) => break,
                Err(e) => {
                    // Creating or connecting the pipe failed - a squatter on the name, or a
                    // transient handle problem. Log it and retry gently rather than spin.
                    log_line(&format!("pipe cycle failed: {e}"));
                    std::thread::sleep(Duration::from_millis(500));
                }
            }
        }
        log_line("stopping");
    }

    /// Appends one timestamped line to `%ProgramData%\BetterFleet\capture-service.log`, and echoes
    /// it to stderr (visible in `--console` mode, discarded under the SCM). A service has no
    /// console and no per-user log dir, so this is the one place its story can be read; the
    /// timestamp is epoch seconds to keep this binary dependency-free.
    fn log_line(message: &str) {
        eprintln!("betterfleet-capture-service: {message}");
        let Ok(program_data) = std::env::var("ProgramData") else {
            return;
        };
        let dir = std::path::Path::new(&program_data).join("BetterFleet");
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let path = dir.join("capture-service.log");
        // A crude size brake: this log narrates lifecycle and failures, not requests; if it ever
        // grows past 5 MB something is looping and appending more of it helps no one.
        if std::fs::metadata(&path).map_or(false, |m| m.len() > 5_000_000) {
            return;
        }
        let epoch_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "[{epoch_secs}] {message}");
        }
    }
}
