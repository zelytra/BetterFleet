//! Named-pipe transport between the GUI and the Windows capture service (#816).
//!
//! One connection carries exactly one [`CaptureRequest`] and one [`CaptureResponse`], message-mode,
//! then disconnects - no session state to version, no partial reads to resynchronize. Both ends do
//! every I/O overlapped so nothing here can hang a thread forever: the server's accept wakes up
//! every quarter second to honour a stop request, and every read and write carries a deadline that
//! ends in `CancelIoEx`, never in a stuck `ReadFile`. "Service stopped mid-capture" must degrade to
//! a logged error, not a frozen detection loop.
//!
//! The server end creates the pipe with `FILE_FLAG_FIRST_PIPE_INSTANCE` (a squatter that grabbed
//! the name first turns into a clean create error, not a silent split-brain) and
//! `PIPE_REJECT_REMOTE_CLIENTS` (a named pipe is reachable over SMB by default; this one never
//! should be). The full DACL treatment is #817's, on top of this.

use std::io;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use winapi::shared::minwindef::DWORD;
use winapi::shared::winerror::{
    ERROR_FILE_NOT_FOUND, ERROR_IO_PENDING, ERROR_MORE_DATA, ERROR_PIPE_BUSY,
    ERROR_PIPE_CONNECTED,
};
use winapi::um::errhandlingapi::GetLastError;
use winapi::um::fileapi::{CreateFileW, FlushFileBuffers, ReadFile, WriteFile, OPEN_EXISTING};
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
use winapi::um::ioapiset::{CancelIoEx, GetOverlappedResult};
use winapi::um::minwinbase::OVERLAPPED;
use winapi::um::namedpipeapi::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, SetNamedPipeHandleState,
    WaitNamedPipeW,
};
use winapi::um::synchapi::{CreateEventW, ResetEvent, WaitForSingleObject};
use winapi::um::winbase::{
    FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, INFINITE, PIPE_ACCESS_DUPLEX,
    PIPE_READMODE_MESSAGE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_MESSAGE, PIPE_WAIT,
    WAIT_OBJECT_0,
};
use winapi::um::winnt::{GENERIC_READ, GENERIC_WRITE, HANDLE};

use crate::service_proto::{
    decode_request, decode_response, encode_request, encode_response, validate_request,
    CaptureRequest, CaptureResponse, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, PROTOCOL_VERSION,
};
use crate::FlowStat;

const WAIT_TIMEOUT_CODE: DWORD = 0x102; // WAIT_TIMEOUT; winapi exports it in um::winbase too.

/// How often a blocking wait wakes up to check the stop flag or the deadline.
const POLL_MS: DWORD = 250;

/// Read/write chunk. Message-mode reads that outgrow it continue via `ERROR_MORE_DATA`.
const CHUNK_BYTES: usize = 64 * 1024;

/// A raw handle that closes on drop. `HANDLE` is a raw pointer, so it is not `Send` by itself;
/// pipe and event handles are process-wide kernel objects, safe to move across threads.
struct Handle(HANDLE);
unsafe impl Send for Handle {}
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

/// A manual-reset event backing the OVERLAPPED waits.
struct Event(Handle);

impl Event {
    fn new() -> io::Result<Event> {
        let raw = unsafe { CreateEventW(null_mut(), 1, 0, null_mut()) };
        if raw.is_null() {
            return Err(io::Error::last_os_error());
        }
        Ok(Event(Handle(raw)))
    }

    fn raw(&self) -> HANDLE {
        self.0 .0
    }
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn os_error(code: DWORD) -> io::Error {
    io::Error::from_raw_os_error(code as i32)
}

/// Why a pipe I/O did not complete with data.
enum PipeIoError {
    /// The stop flag was raised while waiting; the operation was cancelled.
    Stopped,
    /// The deadline passed; the operation was cancelled.
    TimedOut,
    /// The peer's message outgrew the caller's cap.
    TooBig,
    Os(io::Error),
}

/// Waits out one overlapped operation started on `pipe`. `immediate` is the operation's own return
/// value; `ERROR_IO_PENDING` leads to a poll loop on `event` that honours `stop` and `deadline` by
/// cancelling the I/O. Returns the bytes transferred and whether the message continues
/// (`ERROR_MORE_DATA`).
fn complete_overlapped(
    pipe: HANDLE,
    ov: &mut OVERLAPPED,
    event: &Event,
    immediate: i32,
    deadline: Option<Instant>,
    stop: Option<&AtomicBool>,
) -> Result<(u32, bool), PipeIoError> {
    unsafe {
        if immediate == 0 {
            match GetLastError() {
                ERROR_IO_PENDING => loop {
                    match WaitForSingleObject(event.raw(), POLL_MS) {
                        WAIT_OBJECT_0 => break,
                        WAIT_TIMEOUT_CODE => {
                            let stopped = stop.is_some_and(|s| s.load(Ordering::Relaxed));
                            let expired = deadline.is_some_and(|d| Instant::now() >= d);
                            if stopped || expired {
                                // Cancel, then wait for the cancellation to actually land before
                                // the OVERLAPPED (and the buffer the kernel writes into) goes away.
                                CancelIoEx(pipe, ov);
                                WaitForSingleObject(event.raw(), INFINITE);
                                let mut reaped: DWORD = 0;
                                GetOverlappedResult(pipe, ov, &mut reaped, 0);
                                return Err(if stopped {
                                    PipeIoError::Stopped
                                } else {
                                    PipeIoError::TimedOut
                                });
                            }
                        }
                        _ => return Err(PipeIoError::Os(io::Error::last_os_error())),
                    }
                },
                // A message-mode read can fail synchronously with MORE_DATA: the chunk is full and
                // the message continues. The transferred count still comes from the reap below.
                ERROR_MORE_DATA => {}
                code => return Err(PipeIoError::Os(os_error(code))),
            }
        }
        let mut transferred: DWORD = 0;
        if GetOverlappedResult(pipe, ov, &mut transferred, 0) == 0 {
            let code = GetLastError();
            if code == ERROR_MORE_DATA {
                return Ok((transferred, true));
            }
            return Err(PipeIoError::Os(os_error(code)));
        }
        Ok((transferred, false))
    }
}

fn overlapped_for(event: &Event) -> OVERLAPPED {
    unsafe { ResetEvent(event.raw()) };
    let mut ov: OVERLAPPED = unsafe { std::mem::zeroed() };
    ov.hEvent = event.raw();
    ov
}

/// Reads one message-mode message, across `ERROR_MORE_DATA` continuations, up to `max_bytes`.
fn read_message(
    pipe: HANDLE,
    event: &Event,
    max_bytes: usize,
    deadline: Instant,
    stop: Option<&AtomicBool>,
) -> Result<Vec<u8>, PipeIoError> {
    let mut message = Vec::new();
    loop {
        let mut chunk = vec![0u8; CHUNK_BYTES];
        let mut ov = overlapped_for(event);
        let immediate = unsafe {
            ReadFile(
                pipe,
                chunk.as_mut_ptr() as *mut _,
                CHUNK_BYTES as DWORD,
                null_mut(),
                &mut ov,
            )
        };
        let (transferred, continues) =
            complete_overlapped(pipe, &mut ov, event, immediate, Some(deadline), stop)?;
        message.extend_from_slice(&chunk[..transferred as usize]);
        if message.len() > max_bytes {
            return Err(PipeIoError::TooBig);
        }
        if !continues {
            return Ok(message);
        }
    }
}

/// Writes one whole message. Message-mode pipes deliver a single `WriteFile` as a single message.
fn write_message(
    pipe: HANDLE,
    event: &Event,
    bytes: &[u8],
    deadline: Instant,
    stop: Option<&AtomicBool>,
) -> Result<(), PipeIoError> {
    let mut ov = overlapped_for(event);
    let immediate = unsafe {
        WriteFile(
            pipe,
            bytes.as_ptr() as *const _,
            bytes.len() as DWORD,
            null_mut(),
            &mut ov,
        )
    };
    let (transferred, _) =
        complete_overlapped(pipe, &mut ov, event, immediate, Some(deadline), stop)?;
    if transferred as usize != bytes.len() {
        return Err(PipeIoError::Os(io::Error::new(
            io::ErrorKind::WriteZero,
            format!("wrote {transferred} of {} bytes", bytes.len()),
        )));
    }
    Ok(())
}

/// How one `serve_one_request` call ended.
#[derive(Debug, PartialEq)]
pub enum ServeOutcome {
    /// A client was served (or refused with an error response) and disconnected.
    Served,
    /// The stop flag was raised; no client is being served.
    Stopped,
}

/// Creates the single server instance of the pipe, accepts one client, answers one request, and
/// disconnects. The service calls this in a loop; `stop` breaks the loop between clients and
/// interrupts the accept. `capture` runs the actual capture once the request has passed version
/// and bounds validation - everything invalid is answered with an in-protocol error response.
///
/// `io_deadline` bounds each read and write, not the capture itself: the capture window is bounded
/// by request validation (`MAX_WINDOW_SECS`).
pub fn serve_one_request<F>(
    pipe_name: &str,
    stop: &AtomicBool,
    io_deadline: Duration,
    capture: F,
) -> io::Result<ServeOutcome>
where
    F: FnOnce(Vec<u16>, Duration) -> (Vec<FlowStat>, Option<u64>),
{
    let wide_name = to_wide(pipe_name);
    let pipe = unsafe {
        CreateNamedPipeW(
            wide_name.as_ptr(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            CHUNK_BYTES as DWORD,
            CHUNK_BYTES as DWORD,
            0,
            null_mut(),
        )
    };
    if pipe == INVALID_HANDLE_VALUE {
        // FIRST_PIPE_INSTANCE turns a squatted name into this error instead of a second instance.
        return Err(io::Error::last_os_error());
    }
    let pipe = Handle(pipe);
    let event = Event::new()?;

    // Accept one client. No deadline - the service waits as long as it takes - but stop-aware.
    let mut ov = overlapped_for(&event);
    let immediate = unsafe { ConnectNamedPipe(pipe.0, &mut ov) };
    let connected_already =
        immediate == 0 && unsafe { GetLastError() } == ERROR_PIPE_CONNECTED;
    if !connected_already {
        match complete_overlapped(pipe.0, &mut ov, &event, immediate, None, Some(stop)) {
            Ok(_) => {}
            Err(PipeIoError::Stopped) => return Ok(ServeOutcome::Stopped),
            Err(PipeIoError::TimedOut) | Err(PipeIoError::TooBig) => {
                unreachable!("the accept has no deadline and reads nothing")
            }
            Err(PipeIoError::Os(e)) => return Err(e),
        }
    }
    if stop.load(Ordering::Relaxed) {
        unsafe { DisconnectNamedPipe(pipe.0) };
        return Ok(ServeOutcome::Stopped);
    }

    let deadline = Instant::now() + io_deadline;
    let response = match read_message(pipe.0, &event, MAX_REQUEST_BYTES, deadline, Some(stop)) {
        Ok(frame) => match decode_request(&frame) {
            Ok(request) => match validate_request(&request) {
                Ok(()) => {
                    let (flows, raw_packets) = capture(
                        request.game_ports,
                        Duration::from_secs(request.window_secs),
                    );
                    CaptureResponse {
                        version: PROTOCOL_VERSION,
                        error: None,
                        flows,
                        raw_packets,
                    }
                }
                Err(refusal) => CaptureResponse::error(refusal.to_string()),
            },
            Err(refusal) => CaptureResponse::error(refusal),
        },
        Err(PipeIoError::Stopped) => {
            unsafe { DisconnectNamedPipe(pipe.0) };
            return Ok(ServeOutcome::Stopped);
        }
        Err(PipeIoError::TooBig) => {
            CaptureResponse::error(format!(
                "request frame exceeds the {MAX_REQUEST_BYTES}-byte cap"
            ))
        }
        Err(PipeIoError::TimedOut) | Err(PipeIoError::Os(_)) => {
            // The client never delivered a request; there is no one reliable to answer.
            unsafe { DisconnectNamedPipe(pipe.0) };
            return Ok(ServeOutcome::Served);
        }
    };

    let frame = encode_response(&response);
    let deadline = Instant::now() + io_deadline;
    match write_message(pipe.0, &event, &frame, deadline, Some(stop)) {
        Ok(()) => unsafe {
            FlushFileBuffers(pipe.0);
        },
        // The client is gone or slow; nothing to salvage, the next client gets a fresh instance.
        Err(_) => {}
    }
    unsafe { DisconnectNamedPipe(pipe.0) };
    Ok(ServeOutcome::Served)
}

/// Why a client request failed, each branch distinct so the GUI can log - and one day surface -
/// "no service" differently from "service refused" differently from "no traffic" (the Linux
/// helper's non-zero-exit contract, translated to a pipe).
#[derive(Debug)]
pub enum ClientError {
    /// The pipe does not exist: the service is not installed or not running.
    ServiceUnavailable,
    /// The pipe exists but stayed busy past the connect timeout.
    Busy,
    /// The service accepted the connection but the response never arrived in time.
    TimedOut,
    /// The response was unreadable or from another protocol version.
    Protocol(String),
    /// The service answered with an in-protocol refusal or failure.
    Service(String),
    Io(io::Error),
}

impl std::fmt::Display for ClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClientError::ServiceUnavailable => {
                write!(f, "the capture service pipe does not exist (service not running)")
            }
            ClientError::Busy => write!(f, "the capture service stayed busy past the connect timeout"),
            ClientError::TimedOut => write!(f, "the capture service did not answer before the deadline"),
            ClientError::Protocol(e) => write!(f, "protocol error: {e}"),
            ClientError::Service(e) => write!(f, "the capture service refused: {e}"),
            ClientError::Io(e) => write!(f, "pipe I/O error: {e}"),
        }
    }
}

fn map_client_io(error: PipeIoError) -> ClientError {
    match error {
        // The client never passes a stop flag; a Stopped here would be a bug in this module.
        PipeIoError::Stopped | PipeIoError::TimedOut => ClientError::TimedOut,
        PipeIoError::TooBig => ClientError::Protocol(format!(
            "response frame exceeds the {MAX_RESPONSE_BYTES}-byte cap"
        )),
        PipeIoError::Os(e) => ClientError::Io(e),
    }
}

/// Sends one capture request to the service and returns its response.
///
/// `connect_timeout` bounds finding a free pipe instance; `io_deadline` bounds the request write
/// and the response read - the caller sizes it to the capture window it asked for, plus margin.
pub fn request_capture(
    pipe_name: &str,
    request: &CaptureRequest,
    connect_timeout: Duration,
    io_deadline: Duration,
) -> Result<CaptureResponse, ClientError> {
    let wide_name = to_wide(pipe_name);
    let connect_deadline = Instant::now() + connect_timeout;
    let pipe = loop {
        let raw = unsafe {
            CreateFileW(
                wide_name.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                null_mut(),
                OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED,
                null_mut(),
            )
        };
        if raw != INVALID_HANDLE_VALUE {
            break Handle(raw);
        }
        match unsafe { GetLastError() } {
            ERROR_FILE_NOT_FOUND => return Err(ClientError::ServiceUnavailable),
            ERROR_PIPE_BUSY => {
                let remaining = connect_deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    return Err(ClientError::Busy);
                }
                // Waits until an instance frees up (or the remaining budget runs out), then the
                // loop retries the open; a rival client can still win the freed instance, hence
                // the loop rather than a single retry.
                unsafe { WaitNamedPipeW(wide_name.as_ptr(), remaining.as_millis() as DWORD) };
            }
            code => return Err(ClientError::Io(os_error(code))),
        }
    };

    let mut mode: DWORD = PIPE_READMODE_MESSAGE;
    if unsafe { SetNamedPipeHandleState(pipe.0, &mut mode, null_mut(), null_mut()) } == 0 {
        return Err(ClientError::Io(io::Error::last_os_error()));
    }

    let event = Event::new().map_err(ClientError::Io)?;
    let frame = encode_request(request);
    let deadline = Instant::now() + io_deadline;
    write_message(pipe.0, &event, &frame, deadline, None).map_err(map_client_io)?;
    let raw_response = read_message(pipe.0, &event, MAX_RESPONSE_BYTES, deadline, None)
        .map_err(map_client_io)?;

    let response = decode_response(&raw_response).map_err(ClientError::Protocol)?;
    if let Some(message) = response.error {
        return Err(ClientError::Service(message));
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service_proto::PIPE_NAME;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    /// A unique pipe name per test, so tests neither collide with each other nor with a real
    /// service on the machine running them.
    fn test_pipe(tag: &str) -> String {
        format!(
            r"\\.\pipe\BetterFleet.Capture.test-{}-{tag}",
            std::process::id()
        )
    }

    fn a_flow() -> FlowStat {
        FlowStat {
            local_port: 59639,
            remote_ip: "20.31.44.5".into(),
            remote_port: 30512,
            packets: 42,
            bytes: 6100,
            inbound: 21,
            outbound: 21,
            plausible_sot_port: true,
            first_seen_ms: 10,
            last_seen_ms: 1990,
        }
    }

    fn valid_request() -> CaptureRequest {
        CaptureRequest {
            version: PROTOCOL_VERSION,
            game_ports: vec![59639],
            window_secs: 1,
        }
    }

    /// Retries the client call while the server thread is still creating its pipe.
    fn request_with_retry(
        pipe_name: &str,
        request: &CaptureRequest,
    ) -> Result<CaptureResponse, ClientError> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match request_capture(
                pipe_name,
                request,
                Duration::from_millis(500),
                Duration::from_secs(5),
            ) {
                Err(ClientError::ServiceUnavailable) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                other => return other,
            }
        }
    }

    #[test]
    fn one_request_rides_the_pipe_end_to_end() {
        let pipe_name = test_pipe("roundtrip");
        let stop = Arc::new(AtomicBool::new(false));
        let server = {
            let pipe_name = pipe_name.clone();
            let stop = Arc::clone(&stop);
            std::thread::spawn(move || {
                serve_one_request(&pipe_name, &stop, Duration::from_secs(5), |ports, window| {
                    assert_eq!(ports, vec![59639]);
                    assert_eq!(window, Duration::from_secs(1));
                    (vec![a_flow()], Some(777))
                })
            })
        };

        let response = request_with_retry(&pipe_name, &valid_request()).unwrap();
        assert_eq!(response.flows, vec![a_flow()]);
        // The raw counter must cross the wire intact - it backs the "capture blocked" diagnostic.
        assert_eq!(response.raw_packets, Some(777));
        assert_eq!(server.join().unwrap().unwrap(), ServeOutcome::Served);
    }

    #[test]
    fn a_version_skewed_request_is_refused_in_protocol() {
        let pipe_name = test_pipe("skew");
        let stop = Arc::new(AtomicBool::new(false));
        let server = {
            let pipe_name = pipe_name.clone();
            let stop = Arc::clone(&stop);
            std::thread::spawn(move || {
                serve_one_request(&pipe_name, &stop, Duration::from_secs(5), |_, _| {
                    panic!("a version-skewed request must never reach the capture")
                })
            })
        };

        let mut request = valid_request();
        request.version = PROTOCOL_VERSION + 1;
        match request_with_retry(&pipe_name, &request) {
            Err(ClientError::Service(message)) => {
                assert!(message.contains("version mismatch"), "{message}")
            }
            other => panic!("expected an in-protocol refusal, got {other:?}"),
        }
        assert_eq!(server.join().unwrap().unwrap(), ServeOutcome::Served);
    }

    #[test]
    fn an_out_of_bounds_request_is_refused_without_capturing() {
        let pipe_name = test_pipe("bounds");
        let stop = Arc::new(AtomicBool::new(false));
        let server = {
            let pipe_name = pipe_name.clone();
            let stop = Arc::clone(&stop);
            std::thread::spawn(move || {
                serve_one_request(&pipe_name, &stop, Duration::from_secs(5), |_, _| {
                    panic!("an invalid request must never reach the capture")
                })
            })
        };

        let mut request = valid_request();
        request.game_ports.clear();
        match request_with_retry(&pipe_name, &request) {
            Err(ClientError::Service(message)) => {
                assert!(message.contains("no game ports"), "{message}")
            }
            other => panic!("expected an in-protocol refusal, got {other:?}"),
        }
        assert_eq!(server.join().unwrap().unwrap(), ServeOutcome::Served);
    }

    #[test]
    fn a_raised_stop_flag_ends_the_accept_without_a_client() {
        let pipe_name = test_pipe("stop");
        let stop = Arc::new(AtomicBool::new(false));
        let server = {
            let pipe_name = pipe_name.clone();
            let stop = Arc::clone(&stop);
            std::thread::spawn(move || {
                serve_one_request(&pipe_name, &stop, Duration::from_secs(5), |_, _| {
                    panic!("no client ever connects in this test")
                })
            })
        };
        // Let the server reach its accept, then raise the flag; the poll loop must notice.
        std::thread::sleep(Duration::from_millis(100));
        stop.store(true, Ordering::Relaxed);
        assert_eq!(server.join().unwrap().unwrap(), ServeOutcome::Stopped);
    }

    #[test]
    fn a_missing_service_is_reported_as_unavailable_not_an_io_error() {
        let request = valid_request();
        match request_capture(
            &test_pipe("nobody-listens"),
            &request,
            Duration::from_millis(200),
            Duration::from_secs(1),
        ) {
            Err(ClientError::ServiceUnavailable) => {}
            other => panic!("expected ServiceUnavailable, got {other:?}"),
        }
    }

    #[test]
    fn the_production_pipe_name_is_the_agreed_fixed_one() {
        // The installer (#818) and the security review (#817) both key on this exact name.
        assert_eq!(PIPE_NAME, r"\\.\pipe\BetterFleet.Capture");
    }
}
