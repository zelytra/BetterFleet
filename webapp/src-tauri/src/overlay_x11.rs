//! Keeps the in-game overlay floating above the game on Linux/X11 (#731).
//!
//! Tauri already flags the overlay window always-on-top / skip-taskbar through GTK, but that is not
//! enough under X11: a normal *managed* window is restacked below whatever is focused, and - the bug
//! the maintainer hit - KWin (and other WMs) will **hide a window while its application is inactive**
//! once it looks like a helper/utility window. So the moment the player clicks into the game, the
//! overlay drops or vanishes, which defeats its entire purpose.
//!
//! There is no BetterFleet code hiding it (no client blur/hide listener, no native `Focused` handler
//! did this before #731) - it is purely the window manager. The fix is to re-assert, straight to the
//! X server, the EWMH states that tell the WM to keep it up:
//!
//! - `_NET_WM_STATE_ABOVE`   - float above ordinary windows,
//! - `_NET_WM_STATE_STICKY`  - show on every workspace,
//! - `_NET_WM_STATE_SKIP_TASKBAR` / `_NET_WM_STATE_SKIP_PAGER` - stay out of the taskbar/pager.
//!
//! None of these disable input, so the overlay's ready-toggle keeps working (unlike switching the
//! window to a dock/notification *type*, which some WMs make click-through - deliberately avoided
//! here; see the PR notes for that stronger lever and the fullscreen-exclusive caveat).
//!
//! Re-applied whenever the overlay is shown and whenever the main window loses focus (wired in
//! `main.rs`), because the WM re-evaluates stacking on exactly those transitions. Best-effort: every
//! failure is logged and swallowed so it can never take the app down.

use crate::x11_support::connect;
use log::{info, warn};

/// Substring identifying the overlay window in the X11 client list. Its title is
/// "BetterFleet Overlay" (tauri.conf.json), unique against the main "BetterFleet" window.
const OVERLAY_TITLE_NEEDLE: &str = "betterfleet overlay";

/// `_NET_WM_STATE` action: add the listed properties.
const NET_WM_STATE_ADD: u32 = 1;
/// EWMH source indication for a normal application (as opposed to a pager/other tool).
const EWMH_SOURCE_APPLICATION: u32 = 1;

/// Re-asserts the overlay's always-above / all-workspaces / off-taskbar EWMH states so the window
/// manager keeps it visible over the game even when BetterFleet is not the focused application.
/// A no-op (logged) when there is no X server or the overlay window can't be located yet.
pub(crate) fn reinforce_overlay_stacking() {
    let ctx = match connect() {
        Some(ctx) => ctx,
        None => return,
    };
    let window = match ctx.find_window_by_title(OVERLAY_TITLE_NEEDLE) {
        Some(window) => window,
        None => {
            warn!("[overlay] X11 overlay window not found yet; skipping stacking reinforcement");
            return;
        }
    };
    let state_atom = match ctx.intern(b"_NET_WM_STATE", false) {
        Some(atom) => atom,
        None => return,
    };

    // Each _NET_WM_STATE message carries up to two property atoms: add ABOVE+STICKY, then the two
    // skip hints. A missing atom comes back as 0, which _NET_WM_STATE reads as "no second property".
    let pairs: [(&[u8], &[u8]); 2] = [
        (b"_NET_WM_STATE_ABOVE", b"_NET_WM_STATE_STICKY"),
        (b"_NET_WM_STATE_SKIP_TASKBAR", b"_NET_WM_STATE_SKIP_PAGER"),
    ];
    for (first, second) in pairs {
        let first_atom = ctx.intern(first, false).unwrap_or(0);
        let second_atom = ctx.intern(second, false).unwrap_or(0);
        if let Err(e) = ctx.send_client_message(
            window,
            state_atom,
            [
                NET_WM_STATE_ADD,
                first_atom,
                second_atom,
                EWMH_SOURCE_APPLICATION,
                0,
            ],
        ) {
            warn!("[overlay] failed to set _NET_WM_STATE: {e}");
            return;
        }
    }
    info!("[overlay] reinforced X11 stacking (above + sticky + skip taskbar/pager) on 0x{window:x}");
}
