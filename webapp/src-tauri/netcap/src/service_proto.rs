//! Wire protocol between the GUI and the Windows capture service (#816, lot 2 of #732).
//!
//! One request/response pair per pipe connection, both JSON, both carrying an explicit protocol
//! version so a GUI and a service that skewed apart during an update refuse each other cleanly
//! instead of misparsing. The frames are deliberately tiny and self-contained: everything here is
//! pure data, no pipe and no privilege, so encode/decode and validation are unit-tested on every
//! platform even though the pipe itself only exists on Windows.
//!
//! The response carries the ranked flows *and* the raw packet counter: on Windows the capture can
//! count packets before the game-port filter, and the Help-tab diagnostic uses that count to tell
//! "the capture was blocked" apart from "there was no traffic". A wire format without it would
//! silently lose that signal the day the capture moves out of process.

use serde::{Deserialize, Serialize};
use std::fmt;

use crate::FlowStat;

/// Version of the frames below. Bump on ANY change to their shape or meaning; the service refuses
/// requests carrying another version and the client refuses responses carrying one, so a skewed
/// pair degrades to a clear error instead of a wrong parse.
pub const PROTOCOL_VERSION: u32 = 1;

/// The fixed name the service listens on and the GUI connects to.
pub const PIPE_NAME: &str = r"\\.\pipe\BetterFleet.Capture";

/// Hard cap on an encoded request. A request is a version, a handful of ports and a window; 4 KiB
/// is already generous. Anything bigger is rejected before JSON even sees it - this sits at a trust
/// boundary where an arbitrary local process can write to the pipe.
pub const MAX_REQUEST_BYTES: usize = 4 * 1024;

/// Hard cap on an encoded response. Sized for a pathological capture (hundreds of flows), not for
/// trust: the client refuses anything bigger rather than allocating without bound.
pub const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

/// Most ports a single request may name. The game owns a couple of UDP sockets; a request naming
/// dozens is not the GUI talking.
pub const MAX_PORTS_PER_REQUEST: usize = 16;

/// Longest capture window a request may ask for, in seconds. Live detection uses 2 s windows and
/// the diagnostic tens of seconds; anything beyond this cap is a caller trying to hold the
/// promiscuous socket open, not a capture.
pub const MAX_WINDOW_SECS: u64 = 120;

/// One capture request: sniff the given game ports for `window_secs` and return the ranked flows.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CaptureRequest {
    pub version: u32,
    pub game_ports: Vec<u16>,
    pub window_secs: u64,
}

/// The service's answer. `error` is `Some` when the request was refused (bad version, failed
/// validation) or the capture failed; the flows are then empty and the message says why. Kept in
/// the same frame rather than a separate error type so the client always decodes one shape.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CaptureResponse {
    pub version: u32,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub flows: Vec<FlowStat>,
    /// Packets the capture socket(s) received before the game-port filter; `None` when no socket
    /// opened. Carried on the wire so the diagnostic keeps its "capture blocked" signal (#837)
    /// when the capture runs out of process.
    #[serde(default)]
    pub raw_packets: Option<u64>,
}

impl CaptureResponse {
    /// A refusal or failure, in the current protocol version.
    pub fn error(message: impl Into<String>) -> Self {
        CaptureResponse {
            version: PROTOCOL_VERSION,
            error: Some(message.into()),
            flows: Vec::new(),
            raw_packets: None,
        }
    }
}

/// Why a request was refused. Validation REJECTS, it never clamps: a request that is out of bounds
/// is not the GUI, and silently shrinking it would hide that from both sides.
#[derive(Debug, Clone, PartialEq)]
pub enum RequestError {
    VersionMismatch { got: u32 },
    NoPorts,
    TooManyPorts { got: usize },
    ZeroPort,
    ZeroWindow,
    WindowTooLong { got: u64 },
}

impl fmt::Display for RequestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RequestError::VersionMismatch { got } => write!(
                f,
                "protocol version mismatch: this service speaks v{PROTOCOL_VERSION}, the request carries v{got}"
            ),
            RequestError::NoPorts => write!(f, "the request names no game ports"),
            RequestError::TooManyPorts { got } => write!(
                f,
                "the request names {got} ports; at most {MAX_PORTS_PER_REQUEST} are accepted"
            ),
            RequestError::ZeroPort => write!(f, "port 0 is not a capturable UDP port"),
            RequestError::ZeroWindow => write!(f, "the capture window must be at least 1 second"),
            RequestError::WindowTooLong { got } => write!(
                f,
                "the capture window of {got}s exceeds the {MAX_WINDOW_SECS}s cap"
            ),
        }
    }
}

/// Validates a decoded request against the protocol version and the caps above. The same
/// whole-list-rejection rule as the Linux helper's `parse_ports`: one bad entry refuses the
/// request, nothing is guessed or dropped.
pub fn validate_request(request: &CaptureRequest) -> Result<(), RequestError> {
    if request.version != PROTOCOL_VERSION {
        return Err(RequestError::VersionMismatch {
            got: request.version,
        });
    }
    if request.game_ports.is_empty() {
        return Err(RequestError::NoPorts);
    }
    if request.game_ports.len() > MAX_PORTS_PER_REQUEST {
        return Err(RequestError::TooManyPorts {
            got: request.game_ports.len(),
        });
    }
    if request.game_ports.contains(&0) {
        return Err(RequestError::ZeroPort);
    }
    if request.window_secs == 0 {
        return Err(RequestError::ZeroWindow);
    }
    if request.window_secs > MAX_WINDOW_SECS {
        return Err(RequestError::WindowTooLong {
            got: request.window_secs,
        });
    }
    Ok(())
}

/// The version field alone, deserialized first so a frame from the future is refused on its
/// declared version instead of failing somewhere inside a shape it no longer has.
#[derive(Deserialize)]
struct VersionOnly {
    version: u32,
}

fn peek_version(bytes: &[u8]) -> Result<u32, String> {
    serde_json::from_slice::<VersionOnly>(bytes)
        .map(|v| v.version)
        .map_err(|e| format!("frame carries no readable version: {e}"))
}

pub fn encode_request(request: &CaptureRequest) -> Vec<u8> {
    serde_json::to_vec(request).expect("a CaptureRequest always serializes")
}

pub fn encode_response(response: &CaptureResponse) -> Vec<u8> {
    serde_json::to_vec(response).expect("a CaptureResponse always serializes")
}

/// Decodes a request frame. Size is checked first, version second, shape last, so the error the
/// server answers with names the actual problem.
pub fn decode_request(bytes: &[u8]) -> Result<CaptureRequest, String> {
    if bytes.len() > MAX_REQUEST_BYTES {
        return Err(format!(
            "request frame of {} bytes exceeds the {MAX_REQUEST_BYTES}-byte cap",
            bytes.len()
        ));
    }
    let version = peek_version(bytes)?;
    if version != PROTOCOL_VERSION {
        return Err(RequestError::VersionMismatch { got: version }.to_string());
    }
    serde_json::from_slice(bytes).map_err(|e| format!("malformed request frame: {e}"))
}

/// Decodes a response frame, refusing a mismatched service version before parsing the rest.
pub fn decode_response(bytes: &[u8]) -> Result<CaptureResponse, String> {
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(format!(
            "response frame of {} bytes exceeds the {MAX_RESPONSE_BYTES}-byte cap",
            bytes.len()
        ));
    }
    let version = peek_version(bytes)?;
    if version != PROTOCOL_VERSION {
        return Err(format!(
            "the capture service speaks protocol v{version}, this build speaks v{PROTOCOL_VERSION}; \
             refusing the response"
        ));
    }
    serde_json::from_slice(bytes).map_err(|e| format!("malformed response frame: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> CaptureRequest {
        CaptureRequest {
            version: PROTOCOL_VERSION,
            game_ports: vec![59639, 51485],
            window_secs: 2,
        }
    }

    fn a_flow() -> FlowStat {
        FlowStat {
            local_port: 59639,
            remote_ip: "20.31.44.5".into(),
            remote_port: 30512,
            packets: 420,
            bytes: 61_000,
            inbound: 210,
            outbound: 210,
            plausible_sot_port: true,
            first_seen_ms: 10,
            last_seen_ms: 1990,
        }
    }

    #[test]
    fn request_roundtrips() {
        let request = valid_request();
        let decoded = decode_request(&encode_request(&request)).unwrap();
        assert_eq!(decoded, request);
    }

    #[test]
    fn response_roundtrips_with_flows_and_raw_packets() {
        let response = CaptureResponse {
            version: PROTOCOL_VERSION,
            error: None,
            flows: vec![a_flow()],
            raw_packets: Some(1234),
        };
        let decoded = decode_response(&encode_response(&response)).unwrap();
        assert_eq!(decoded, response);
        // The raw counter must survive the wire distinctly from "not reported".
        assert_eq!(decoded.raw_packets, Some(1234));
    }

    #[test]
    fn response_keeps_none_raw_packets_distinct_from_zero() {
        let none = CaptureResponse {
            version: PROTOCOL_VERSION,
            error: None,
            flows: vec![],
            raw_packets: None,
        };
        let zero = CaptureResponse {
            raw_packets: Some(0),
            ..none.clone()
        };
        assert_eq!(
            decode_response(&encode_response(&none)).unwrap().raw_packets,
            None
        );
        assert_eq!(
            decode_response(&encode_response(&zero)).unwrap().raw_packets,
            Some(0)
        );
    }

    #[test]
    fn a_request_from_the_future_is_refused_on_its_version() {
        let mut request = valid_request();
        request.version = PROTOCOL_VERSION + 1;
        let err = decode_request(&encode_request(&request)).unwrap_err();
        assert!(err.contains("version mismatch"), "{err}");
    }

    #[test]
    fn a_response_from_another_version_is_refused_before_parsing() {
        // A future response whose shape this build does not know: only the version is readable,
        // and that must be enough to refuse it cleanly.
        let alien = br#"{"version": 2, "payload": {"entirely": "different"}}"#;
        let err = decode_response(alien).unwrap_err();
        assert!(err.contains("speaks protocol v2"), "{err}");
    }

    #[test]
    fn a_frame_with_no_version_is_refused() {
        assert!(decode_request(b"{\"game_ports\": [1]}").is_err());
        assert!(decode_response(b"not json at all").is_err());
    }

    #[test]
    fn oversized_frames_are_refused_before_parsing() {
        let huge = vec![b' '; MAX_REQUEST_BYTES + 1];
        assert!(decode_request(&huge).unwrap_err().contains("cap"));
        let huge = vec![b' '; MAX_RESPONSE_BYTES + 1];
        assert!(decode_response(&huge).unwrap_err().contains("cap"));
    }

    #[test]
    fn validation_rejects_each_out_of_bounds_request() {
        let ok = valid_request();
        assert_eq!(validate_request(&ok), Ok(()));

        let mut request = ok.clone();
        request.version = 99;
        assert_eq!(
            validate_request(&request),
            Err(RequestError::VersionMismatch { got: 99 })
        );

        let mut request = ok.clone();
        request.game_ports.clear();
        assert_eq!(validate_request(&request), Err(RequestError::NoPorts));

        let mut request = ok.clone();
        request.game_ports = vec![1000; MAX_PORTS_PER_REQUEST + 1];
        assert_eq!(
            validate_request(&request),
            Err(RequestError::TooManyPorts {
                got: MAX_PORTS_PER_REQUEST + 1
            })
        );

        let mut request = ok.clone();
        request.game_ports.push(0);
        assert_eq!(validate_request(&request), Err(RequestError::ZeroPort));

        let mut request = ok.clone();
        request.window_secs = 0;
        assert_eq!(validate_request(&request), Err(RequestError::ZeroWindow));

        let mut request = ok.clone();
        request.window_secs = MAX_WINDOW_SECS + 1;
        assert_eq!(
            validate_request(&request),
            Err(RequestError::WindowTooLong {
                got: MAX_WINDOW_SECS + 1
            })
        );
    }

    #[test]
    fn validation_rejects_rather_than_clamps() {
        // The cap-adjacent values pass untouched; one past the cap fails. Nothing in between is
        // silently rewritten - the caller's request is either honoured or refused whole.
        let mut request = valid_request();
        request.window_secs = MAX_WINDOW_SECS;
        assert_eq!(validate_request(&request), Ok(()));
        request.game_ports = vec![1000; MAX_PORTS_PER_REQUEST];
        assert_eq!(validate_request(&request), Ok(()));
    }
}
