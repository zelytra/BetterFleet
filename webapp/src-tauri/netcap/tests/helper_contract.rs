//! The `betterfleet-netcap` process contract, exercised as a real child process.
//!
//! The Linux GUI drives the helper across a process boundary: argv in, JSON on stdout, exit code
//! as the signal - 2 "you called me wrong" (a caller bug, #856), 1 "could not capture" (fall back
//! in-process). Nothing else pins that contract. The Windows capture service speaks its own
//! versioned pipe protocol instead (`service_proto`); these tests still run on both CI legs
//! because the binary builds everywhere.
//!
//! Deliberately never asserts that a capture SUCCEEDED: on a CI runner there is no privilege
//! guarantee and no game traffic, so the only honest assertions are about the shape of the output
//! and the exit codes.

use std::process::{Command, Output, Stdio};
use std::sync::mpsc;
use std::time::Duration;

/// How long the helper gets before a test declares it wedged. Generous next to the 1s capture the
/// longest case asks for, tight next to the CI job limit: without it a helper blocked on a hung
/// resolver or a stuck socket would burn the whole job instead of failing this test.
const HELPER_TIMEOUT: Duration = Duration::from_secs(60);

/// Runs the helper binary Cargo built for this test, with the given arguments, failing rather than
/// hanging if it does not exit.
fn run(args: &[&str]) -> Output {
    let child = Command::new(env!("CARGO_BIN_EXE_betterfleet-netcap"))
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the helper binary should be spawnable");

    // wait_with_output has no deadline, so it runs on its own thread and the test waits on a
    // channel instead.
    let (tx, rx) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(HELPER_TIMEOUT) {
        Ok(result) => {
            handle.join().expect("the waiter thread should not panic");
            result.expect("the helper's output should be readable")
        }
        Err(_) => panic!("betterfleet-netcap did not exit within {HELPER_TIMEOUT:?} for {args:?}"),
    }
}

/// Exit code 2 is "bad arguments" - distinct from 1, "could not capture", because only the latter
/// means the GUI should retry in-process.
fn assert_usage_error(args: &[&str]) {
    let out = run(args);
    assert_eq!(
        out.status.code(),
        Some(2),
        "expected a usage error for {args:?}"
    );
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        "[]",
        "stdout must stay valid JSON even when the arguments are rejected ({args:?})"
    );
    assert!(
        !out.stderr.is_empty(),
        "a rejected invocation must explain itself on stderr ({args:?})"
    );
}

#[test]
fn wrong_argument_count_is_a_usage_error() {
    assert_usage_error(&[]);
    assert_usage_error(&["59639"]);
    assert_usage_error(&["59639", "1", "extra"]);
}

#[test]
fn a_malformed_port_list_rejects_the_whole_list() {
    // The helper runs at a privilege boundary: a bad entry fails the call rather than being
    // silently dropped, which would capture on a narrower port set than the caller asked for.
    assert_usage_error(&["abc", "1"]);
    assert_usage_error(&["0", "1"]);
    assert_usage_error(&["65536", "1"]);
    assert_usage_error(&["8080,0", "1"]);
    assert_usage_error(&["", "1"]);
}

#[test]
fn a_malformed_window_is_a_usage_error() {
    assert_usage_error(&["59639", "0"]);
    assert_usage_error(&["59639", "-1"]);
    assert_usage_error(&["59639", "soon"]);
}

#[test]
fn a_valid_run_always_prints_parseable_flows() {
    // One second so the suite stays quick. Exit 0 (captured, possibly nothing) or exit 1 (no
    // privilege) are both legitimate here - a CI runner guarantees neither. What must hold either
    // way is that stdout parses, because the GUI feeds it straight to serde_json.
    let out = run(&["59639,51485", "1"]);
    let code = out.status.code();
    assert!(
        code == Some(0) || code == Some(1),
        "a well-formed invocation must not report a usage error, got {code:?}"
    );

    let stdout = String::from_utf8_lossy(&out.stdout);
    let flows: Vec<better_fleet_netcap::FlowStat> =
        serde_json::from_str(stdout.trim()).expect("stdout must be a JSON array of FlowStat");

    if code == Some(1) {
        // The "cannot capture" exit is the GUI's signal to fall back in-process, so it has to carry
        // an empty array and name the missing privilege rather than fail silently.
        assert!(flows.is_empty());
        let stderr = String::from_utf8_lossy(&out.stderr).to_lowercase();
        assert!(
            stderr.contains("cap_net_raw") || stderr.contains("administrator"),
            "the privilege failure must name the privilege, got: {stderr}"
        );
    }
}
