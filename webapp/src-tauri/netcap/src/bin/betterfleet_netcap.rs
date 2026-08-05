//! Privilege-separated packet-capture helper (#726).
//!
//! On Linux, server detection needs an `AF_PACKET` socket, which needs `CAP_NET_RAW`. Running that
//! inside the Tauri GUI would force the whole app to hold the capability; instead this tiny binary
//! holds it alone. It captures one window of the game's UDP flows and prints them, ranked, as JSON
//! for the GUI to read. It links only the pure capture core (better_fleet_netcap), std and
//! serde_json, never Tauri.
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
/// valid u16, so a malformed argument fails cleanly rather than silently dropping ports.
fn parse_ports(arg: &str) -> Option<Vec<u16>> {
    arg.split(',')
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().parse::<u16>().ok())
        .collect()
}

/// Prints an empty JSON array to stdout (so a reader always gets valid JSON), the message to stderr,
/// and exits non-zero.
fn fail(message: &str) -> ! {
    println!("[]");
    eprintln!("betterfleet-netcap: {message}");
    std::process::exit(2);
}
