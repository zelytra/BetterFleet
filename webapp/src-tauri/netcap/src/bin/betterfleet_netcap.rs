//! Privilege-separated packet-capture helper (#726).
//!
//! Server detection needs a privileged socket: `AF_PACKET` (`CAP_NET_RAW`) on Linux, a promiscuous
//! `SOCK_RAW` (Administrator) on Windows. Running that inside the Tauri GUI would force the whole
//! app to hold the privilege; instead this tiny binary holds it alone. It captures one window of the
//! game's UDP flows and prints them, ranked, as JSON for the GUI to read. It links only the pure
//! capture core (better_fleet_netcap), std and serde_json, never Tauri.
//!
//! Linux drives it today. On Windows the capture backend now lives in the same crate (#732), so this
//! binary builds and behaves identically there; what is still missing is the privileged host that
//! runs it without a UAC prompt - the service in #816. Until then the Windows GUI keeps capturing
//! in-process behind its `requireAdministrator` manifest.
//!
//! Usage: `betterfleet-netcap <comma-separated-ports> <window-secs>`
//!   e.g. `betterfleet-netcap 59639,51485 20`
//!
//! On success it prints a JSON array of flows to stdout and exits 0. On bad arguments or a capture
//! failure (a missing capability) it prints `[]` to stdout, a short message to stderr, and exits
//! non-zero, so the GUI can fall back to capturing in-process.

use std::time::Duration;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        fail("usage: betterfleet-netcap <comma-separated-ports> <window-secs>");
    }

    let ports = match parse_ports(&args[0]) {
        Some(ports) if !ports.is_empty() => ports,
        _ => fail("first argument must be a comma-separated list of UDP ports (1-65535)"),
    };

    let window_secs: u64 = match args[1].parse() {
        Ok(secs) if secs > 0 => secs,
        _ => fail("second argument must be a positive whole number of seconds"),
    };

    // A missing CAP_NET_RAW is the whole reason this helper exists, so surface it as a nonzero exit:
    // the GUI can then fall back to capturing in-process, instead of mistaking "no capability" for
    // "no traffic" (both otherwise yield zero flows).
    if !better_fleet_netcap::can_open_capture_socket() {
        println!("[]");
        // The privilege differs per OS, so name the one the reader can actually act on.
        #[cfg(windows)]
        eprintln!(
            "betterfleet-netcap: cannot open the promiscuous capture socket (SIO_RCVALL needs \
             Administrator; run this from the capture service or an elevated process)"
        );
        #[cfg(not(windows))]
        eprintln!(
            "betterfleet-netcap: cannot open the AF_PACKET capture socket (needs CAP_NET_RAW; run \
             `sudo setcap cap_net_raw+ep` on this binary)"
        );
        std::process::exit(1);
    }

    let flows = better_fleet_netcap::run_capture(ports, Duration::from_secs(window_secs));
    match serde_json::to_string(&flows) {
        Ok(json) => println!("{json}"),
        Err(e) => {
            println!("[]");
            eprintln!("betterfleet-netcap: failed to serialize flows: {e}");
            std::process::exit(1);
        }
    }
}

/// Parses a comma-separated port list, ignoring blank entries. Returns None if any entry is not a
/// valid UDP port in 1-65535 - a non-number, an out-of-range value, or 0 - so a malformed argument
/// fails cleanly rather than silently dropping ports. This is the only argument parsing at what is a
/// CAP_NET_RAW trust boundary, so it rejects the whole list on any bad entry instead of guessing.
fn parse_ports(arg: &str) -> Option<Vec<u16>> {
    arg.split(',')
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().parse::<u16>().ok().filter(|&port| port != 0))
        .collect()
}

/// Prints an empty JSON array to stdout (so a reader always gets valid JSON), the message to stderr,
/// and exits non-zero.
fn fail(message: &str) -> ! {
    println!("[]");
    eprintln!("betterfleet-netcap: {message}");
    std::process::exit(2);
}

#[cfg(test)]
mod tests {
    use super::parse_ports;

    #[test]
    fn parses_a_valid_list() {
        assert_eq!(parse_ports("59639,51485"), Some(vec![59639, 51485]));
    }

    #[test]
    fn accepts_the_port_range_bounds() {
        assert_eq!(parse_ports("1"), Some(vec![1]));
        assert_eq!(parse_ports("65535"), Some(vec![65535]));
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(parse_ports("  59639 ,\t51485 "), Some(vec![59639, 51485]));
    }

    #[test]
    fn ignores_blank_entries_and_a_trailing_comma() {
        assert_eq!(parse_ports("8080,"), Some(vec![8080]));
        assert_eq!(parse_ports("8080,,9090"), Some(vec![8080, 9090]));
    }

    #[test]
    fn an_empty_or_all_blank_argument_yields_an_empty_list() {
        // parse_ports only parses; main() is what treats an empty list as "no ports" and fails.
        assert_eq!(parse_ports(""), Some(vec![]));
        assert_eq!(parse_ports("   "), Some(vec![]));
    }

    #[test]
    fn keeps_duplicates_verbatim() {
        // Deduplication is a separate concern; the parser must not silently drop repeats.
        assert_eq!(parse_ports("8080,8080"), Some(vec![8080, 8080]));
    }

    #[test]
    fn rejects_non_numeric_entries() {
        assert_eq!(parse_ports("a,b"), None);
        assert_eq!(parse_ports("8080,nope"), None);
    }

    #[test]
    fn rejects_out_of_range_values() {
        // 65536 overflows u16, so the whole list is rejected rather than silently truncated.
        assert_eq!(parse_ports("65536"), None);
    }

    #[test]
    fn rejects_port_zero() {
        // 0 parses as a u16 but is not a usable UDP port; reject it so a bogus 0 never reaches the
        // capture socket, and reject the whole list if a 0 is mixed in with real ports.
        assert_eq!(parse_ports("0"), None);
        assert_eq!(parse_ports("8080,0"), None);
    }
}
