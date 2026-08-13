//! Linux/X11 port of the Sea of Thieves auto-click (#731). The Windows path in
//! `window_interaction.rs` uses Win32 (`SetForegroundWindow` + `SendInput`); this mirrors it on X11:
//! find the game window, focus it via EWMH (`_NET_ACTIVE_WINDOW`), then synthesize the pointer move
//! + left click with the XTEST extension so the game receives it exactly like a real click.
//!
//! **X11-first by design** (#731 / the Linux port #350). Synthetic input and focus-stealing are
//! allowed for an ordinary X11 client but forbidden on Wayland. When `$DISPLAY` points at XWayland
//! this still reaches a Proton/Wine game rendered through XWayland (the Sea of Thieves case); a
//! native-Wayland game is out of reach and every step below fails cleanly, so `rise_anchor` returns
//! `false` and the frontend keeps showing its manual "set sail" cue instead of silently doing
//! nothing.

use crate::x11_support::{connect, X11Context};
use log::{error, info, warn};
use std::collections::HashSet;
use std::error::Error;
use std::thread::sleep;
use std::time::Duration;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    ConnectionExt as _, Window, BUTTON_PRESS_EVENT, BUTTON_RELEASE_EVENT, MOTION_NOTIFY_EVENT,
};
use x11rb::protocol::xtest::ConnectionExt as _;

/// Case-insensitive substring matched against each window's title / `WM_CLASS`. Wine/Proton keeps
/// the game's Windows title, so the same name works on both platforms; a lowercase substring is a
/// touch more tolerant than Win32 `FindWindowA`'s exact "Sea Of Thieves".
const SOT_WINDOW_NEEDLE: &str = "sea of thieves";

/// The "Raise anchor" button as a proportion of the game's forced-16:9 reference of 1920x1080 - the
/// exact values the Windows path uses (700, 750), so both platforms click the same spot. Kept here
/// rather than shared so each OS module stays self-contained, the way detection/diagnostics already
/// are.
const RISE_ANCHOR_X_PROP: f32 = 700.0 / 1920.0;
const RISE_ANCHOR_Y_PROP: f32 = 750.0 / 1080.0;


/// Pure decision: does this X11 top-level window belong to the running Sea of Thieves game? The
/// authoritative signal is the window's owning PID (`_NET_WM_PID`): when the window advertises one,
/// it is the game only if that PID is one of `game_pids` (what `find_game_pids` resolved). This is
/// what stops the auto-click from focus-stealing and clicking a browser tab, Discord channel or
/// folder merely NAMED "Sea of Thieves": those advertise their own, non-game PID. The title/`WM_CLASS`
/// substring is only a fallback, for the rarer window that sets no `_NET_WM_PID` at all. Split out
/// from the X11 calls so it is unit-tested without a display.
///
/// Mirrors the intent of the Windows path's exact `FindWindowA("Sea Of Thieves")`, which cannot be
/// spoofed by a same-named unrelated window the way a loose substring can.
pub(crate) fn window_is_game(
    title: Option<&str>,
    wm_class: Option<&str>,
    wm_pid: Option<u32>,
    game_pids: &HashSet<u32>,
) -> bool {
    match wm_pid {
        // The window names its owner: trust that over any title. A game PID matches; any other PID
        // is a definite non-match, however much the title looks like the game.
        Some(pid) => game_pids.contains(&pid),
        // No PID to cross-reference: fall back to the case-insensitive title/class substring so a
        // game window that omits `_NET_WM_PID` is still found.
        None => {
            let has_needle = |value: Option<&str>| {
                value
                    .map(|v| v.to_lowercase().contains(SOT_WINDOW_NEEDLE))
                    .unwrap_or(false)
            };
            has_needle(title) || has_needle(wm_class)
        }
    }
}

/// Entry point for the `rise_anchor` command on Linux: open the display, find the Sea of Thieves
/// window, focus it, and click "Raise anchor". Returns `false` on any failure (no display, no XTEST,
/// game not found, ...) so the caller can fall back to a manual cue.
pub(crate) fn rise_anchor() -> bool {
    let ctx = match connect() {
        Some(ctx) => ctx,
        None => return false,
    };

    // XTEST is what actually injects the click - bail with a clear log if the server lacks it, rather
    // than failing obscurely at the first `xtest_fake_input`.
    match ctx
        .conn
        .xtest_get_version(2, 2)
        .map_err(|e| e.to_string())
        .and_then(|cookie| cookie.reply().map_err(|e| e.to_string()))
    {
        Ok(version) => info!(
            "[rise_anchor] XTEST {}.{} available",
            version.major_version, version.minor_version
        ),
        Err(e) => {
            warn!("[rise_anchor] XTEST extension unavailable ({e}); cannot synthesize a click");
            return false;
        }
    }

    // Resolve the game process PIDs first, then only accept a window owned by one of them. Without a
    // running game there is nothing to click - and matching purely on the title would let an unrelated
    // "Sea of Thieves" window (a browser tab, a Discord channel) be focus-stolen and clicked.
    let game_pids: HashSet<u32> = crate::fetch_informations::find_game_pids()
        .iter()
        .filter_map(|pid| pid.parse::<u32>().ok())
        .collect();
    if game_pids.is_empty() {
        warn!("[rise_anchor] Sea of Thieves does not appear to be running; not injecting a click");
        return false;
    }

    let window = match ctx.find_window(&|ctx, window| {
        window_is_game(
            ctx.window_title(window).as_deref(),
            ctx.wm_class(window).as_deref(),
            ctx.read_wm_pid(window),
            &game_pids,
        )
    }) {
        Some(window) => window,
        None => {
            warn!("[rise_anchor] no Sea of Thieves window owned by game PID(s) {game_pids:?} found");
            return false;
        }
    };
    info!("[rise_anchor] found Sea of Thieves window 0x{window:x}");

    // Focus is best-effort: if the request fails the click may still land on an already-focused game,
    // so log and continue rather than abort.
    if let Err(e) = focus_window(&ctx, window) {
        warn!("[rise_anchor] could not focus the game window: {e}");
    }
    sleep(Duration::from_millis(50)); // Let the WM raise/focus, as the Windows path does.

    match click_in_window_proportionally(&ctx, window, RISE_ANCHOR_X_PROP, RISE_ANCHOR_Y_PROP) {
        Ok(()) => {
            info!("[rise_anchor] click injected");
            true
        }
        Err(e) => {
            error!("[rise_anchor] failed to inject the click: {e}");
            false
        }
    }
}

/// Asks the window manager to activate (raise + focus) the game window via the EWMH
/// `_NET_ACTIVE_WINDOW` client message - the X11 counterpart of Win32 `SetForegroundWindow`.
fn focus_window(ctx: &X11Context, window: Window) -> Result<(), Box<dyn Error>> {
    let atom = ctx
        .intern(b"_NET_ACTIVE_WINDOW", false)
        .ok_or("server has no _NET_ACTIVE_WINDOW atom")?;
    // [source indication = 1 (a normal application), timestamp (0 = CurrentTime), ...unused].
    ctx.send_client_message(window, atom, [1, 0, 0, 0, 0])
}

/// Clicks at `(x_prop, y_prop)` of the game's 16:9 content, letterboxing exactly as the Windows path
/// does: the menu is forced to 16:9, so a differently-shaped window has black bars we must skip. The
/// window-relative point is translated to absolute root coordinates, then XTEST moves the pointer
/// there and presses/releases the left button.
fn click_in_window_proportionally(
    ctx: &X11Context,
    window: Window,
    x_prop: f32,
    y_prop: f32,
) -> Result<(), Box<dyn Error>> {
    let geometry = ctx.conn.get_geometry(window)?.reply()?;
    let window_width = geometry.width as f32;
    let window_height = geometry.height as f32;
    if window_width <= 0.0 || window_height <= 0.0 {
        return Err("game window has zero size".into());
    }

    let (x_in_window, y_in_window) =
        content_click_point(window_width, window_height, x_prop, y_prop);

    // Window-relative -> absolute root coordinates (the X11 counterpart of `ClientToScreen`).
    let origin = ctx.conn.translate_coordinates(window, ctx.root, 0, 0)?.reply()?;
    let target_x = (origin.dst_x as f32 + x_in_window).round() as i16;
    let target_y = (origin.dst_y as f32 + y_in_window).round() as i16;

    info!(
        "[rise_anchor] clicking at root ({target_x}, {target_y}) inside a {}x{} window",
        geometry.width, geometry.height
    );

    // XTEST injects real input at the server: move the pointer to the target (motion, absolute =
    // detail 0), then press and release the left button (detail 1) where it now sits.
    ctx.conn
        .xtest_fake_input(MOTION_NOTIFY_EVENT, 0, 0, ctx.root, target_x, target_y, 0)?;
    ctx.conn
        .xtest_fake_input(BUTTON_PRESS_EVENT, 1, 0, ctx.root, 0, 0, 0)?;
    ctx.conn
        .xtest_fake_input(BUTTON_RELEASE_EVENT, 1, 0, ctx.root, 0, 0, 0)?;
    ctx.conn.flush()?;
    Ok(())
}

/// Pure letterbox math, split out so it can be unit-tested without an X server - the one part of the
/// auto-click that CI can verify. Given the game window's pixel size and a proportional point on the
/// forced-16:9 content, returns that point's pixel offset *inside the window*, black bars already
/// accounted for. Identical to the Windows path's inline computation.
fn content_click_point(
    window_width: f32,
    window_height: f32,
    x_prop: f32,
    y_prop: f32,
) -> (f32, f32) {
    crate::window_geometry::content_click_point(window_width, window_height, x_prop, y_prop)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(actual: f32, expected: f32) {
        assert!(
            (actual - expected).abs() < 0.01,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn exact_16_9_window_has_no_black_bars() {
        // On a 1080p window the reference coordinates map straight through (700, 750).
        let (x, y) = content_click_point(1920.0, 1080.0, RISE_ANCHOR_X_PROP, RISE_ANCHOR_Y_PROP);
        assert_close(x, 700.0);
        assert_close(y, 750.0);
    }

    #[test]
    fn ultrawide_window_gets_left_right_bars() {
        // 2560x1080 (21:9): a 1920-wide 16:9 area is centred, so 320px black bars each side.
        let (x, y) = content_click_point(2560.0, 1080.0, RISE_ANCHOR_X_PROP, RISE_ANCHOR_Y_PROP);
        assert_close(x, 320.0 + 700.0);
        assert_close(y, 750.0);
    }

    #[test]
    fn sixteen_ten_window_gets_top_bottom_bars() {
        // 1920x1200 (16:10): a 1080-high 16:9 area is centred, so 60px black bars top and bottom.
        let (x, y) = content_click_point(1920.0, 1200.0, RISE_ANCHOR_X_PROP, RISE_ANCHOR_Y_PROP);
        assert_close(x, 700.0);
        assert_close(y, 60.0 + 750.0);
    }

    #[test]
    fn dead_centre_maps_to_the_window_centre() {
        let (x, y) = content_click_point(1920.0, 1080.0, 0.5, 0.5);
        assert_close(x, 960.0);
        assert_close(y, 540.0);
    }

    fn game_pids(pids: &[u32]) -> HashSet<u32> {
        pids.iter().copied().collect()
    }

    #[test]
    fn matches_a_window_owned_by_a_game_pid() {
        let pids = game_pids(&[4242]);
        assert!(window_is_game(
            Some("Sea of Thieves"),
            Some("sotgame.exe"),
            Some(4242),
            &pids
        ));
    }

    #[test]
    fn a_game_pid_wins_even_when_the_title_does_not_match() {
        // `_NET_WM_PID` is authoritative: an owned window counts even under an odd transient title.
        let pids = game_pids(&[4242]);
        assert!(window_is_game(Some("Loading"), None, Some(4242), &pids));
    }

    #[test]
    fn rejects_a_lookalike_title_owned_by_another_process() {
        // The false positive this fix exists for: a browser tab / Discord channel / folder NAMED
        // "Sea of Thieves" but owned by a non-game PID must never be focus-stolen and clicked.
        let pids = game_pids(&[4242]);
        assert!(!window_is_game(
            Some("Sea of Thieves - YouTube"),
            Some("firefox"),
            Some(9999),
            &pids
        ));
    }

    #[test]
    fn falls_back_to_the_title_when_no_pid_is_advertised() {
        let pids = game_pids(&[4242]);
        assert!(window_is_game(Some("Sea Of Thieves"), None, None, &pids));
    }

    #[test]
    fn falls_back_to_the_wm_class_when_no_pid_is_advertised() {
        let pids = game_pids(&[4242]);
        assert!(window_is_game(None, Some("Sea of Thieves"), None, &pids));
    }

    #[test]
    fn rejects_an_unrelated_window_with_no_pid_and_no_matching_text() {
        let pids = game_pids(&[4242]);
        assert!(!window_is_game(Some("Discord"), Some("discord"), None, &pids));
    }

    #[test]
    fn rejects_a_lookalike_title_when_the_game_is_not_running() {
        // No game PIDs resolved: even a PID-bearing window whose title matches must not count.
        let empty = game_pids(&[]);
        assert!(!window_is_game(Some("Sea of Thieves"), None, Some(9999), &empty));
    }
}
