use winapi::um::winuser::{INPUT, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE, MOUSEINPUT, SendInput, SM_CYSCREEN};
use winapi::um::winuser::SM_CXSCREEN;
use winapi::ctypes::c_int;
use std::mem::size_of;
use winapi::um::winuser::{GetSystemMetrics, SetForegroundWindow, GetClientRect, ClientToScreen, keybd_event};
use winapi::um::winuser::{MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, VK_MENU, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP};
use winapi::shared::windef::{HWND, POINT, RECT};
use log::warn;
use crate::window_geometry::letterboxed_point;

pub(crate) fn set_focus_to_window(window_handle: HWND) -> bool {
    //This is a bypass from windows restriction
    //Holding alt while focusing seems to grant ability to focus in every conditions
    unsafe { keybd_event(VK_MENU as u8, 0, KEYEVENTF_EXTENDEDKEY | 0, 0); }
    let result = unsafe { SetForegroundWindow(window_handle) };
    unsafe { keybd_event(VK_MENU as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0); }
    return result != 0;
}

/**
* This function is kinda black magic, the goal is to click at the right coordinates proportionnaly
* to the window size, even if the window is not fullscreen and even if it's a weird format.
*
* The game menu is always forced to 16/9 aspect ratio, so we can calculate the black bars size and
* the game content size.
*/
/// Returns whether the click was actually injected. `SendInput` returns the number of events it
/// inserted, and it returns 0 when the injection is blocked - which is exactly what UIPI does when
/// the target window belongs to a more privileged process. Discarding that return is why a click
/// that stops working produces no signal at all (#815).
/// How the click is delivered to the game. Selected at runtime by BETTERFLEET_CLICK_MODE so a
/// player can test a path without a rebuild: the field failure (#828) is that the cursor lands on
/// the button and the press does nothing, which means the OS accepted the injection and the game
/// discarded it - so the question is which delivery path the game does honour.
#[derive(PartialEq, Debug, Clone, Copy)]
pub(crate) enum ClickMode {
    /// SendInput: the OS input queue, what the app has always used.
    SendInput,
    /// WM_LBUTTONDOWN/UP posted straight to the game window, bypassing the input queue entirely.
    PostMessage,
    /// Both, SendInput first. For the case where neither alone lands.
    Both,
    /// Relative deltas: pin the game's own cursor to the top-left corner with one huge negative
    /// move, then walk it to the target. For a game that drives its cursor from raw input deltas
    /// rather than from the OS cursor - the shape the field test points at, since the injected
    /// absolute move produced no hover at all - this is the only positioning it can see.
    Relative,
}

pub(crate) fn click_mode() -> ClickMode {
    match std::env::var("BETTERFLEET_CLICK_MODE").as_deref() {
        Ok("postmessage") => ClickMode::PostMessage,
        Ok("both") => ClickMode::Both,
        Ok("relative") => ClickMode::Relative,
        _ => ClickMode::SendInput,
    }
}

/// Posts the button press to the window's own message queue, at client coordinates.
///
/// A different path from SendInput in every way that matters here: it never enters the system input
/// queue, so nothing can flag it as injected, and it does not depend on where the OS cursor is. Its
/// own failure mode is the mirror image - a game that reads Raw Input rather than window messages
/// ignores it - which is exactly why both are worth trying against a game that ignores one of them.
#[cfg(windows)]
fn post_click_to_window(window_handle: HWND, client_x: i32, client_y: i32) -> bool {
    use winapi::shared::minwindef::{LPARAM, WPARAM};
    use winapi::um::winuser::{PostMessageA, MK_LBUTTON, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE};

    // lParam packs the client coordinates: low word x, high word y.
    let lparam = ((client_y as u32) << 16 | (client_x as u32 & 0xFFFF)) as LPARAM;
    unsafe {
        let moved = PostMessageA(window_handle, WM_MOUSEMOVE, 0, lparam);
        std::thread::sleep(std::time::Duration::from_millis(16));
        let down = PostMessageA(window_handle, WM_LBUTTONDOWN, MK_LBUTTON as WPARAM, lparam);
        std::thread::sleep(std::time::Duration::from_millis(40));
        let up = PostMessageA(window_handle, WM_LBUTTONUP, 0, lparam);
        if moved == 0 || down == 0 || up == 0 {
            warn!("[auto-click] PostMessage was refused (move={moved}, down={down}, up={up})");
            return false;
        }
        true
    }
}

pub(crate) fn click_in_window_proportionally(window_handle: HWND, x_prop: f32, y_prop: f32) -> bool {
    unsafe {
        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if GetClientRect(window_handle, &mut rect) == 0 {
            warn!("[auto-click] GetClientRect failed; cannot place the click");
            return false;
        }

        let window_width = rect.right - rect.left;
        let window_height = rect.bottom - rect.top;
        let (x_abs, y_abs) = letterboxed_point(window_width, window_height, x_prop, y_prop);

        let mut point = POINT { x: x_abs, y: y_abs };
        ClientToScreen(window_handle, &mut point);

        let mut mouse_input = INPUT {
            type_: INPUT_MOUSE,
            u: std::mem::zeroed(),
        };

        // Convert the screen coordinates to absolute coordinates
        let dx = (point.x * 65535) / GetSystemMetrics(SM_CXSCREEN);
        let dy = (point.y * 65535) / GetSystemMetrics(SM_CYSCREEN);

        // Sent as three events with the game's own frame rate in mind, rather than one packed
        // move+press and one packed move+release back to back. Field report (#828 testing): the
        // cursor lands on the button but the press never registers - the game samples input on its
        // frame, and a press that is already released by the next sample is a press it never saw.
        // A real mouse moves, then holds the button for tens of milliseconds. So does this.
        let mut send_at = |flags, ev_dx: c_int, ev_dy: c_int, wait_ms: u64| {
            *mouse_input.u.mi_mut() = MOUSEINPUT {
                dx: ev_dx,
                dy: ev_dy,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            };
            let sent = SendInput(1, &mut mouse_input, size_of::<INPUT>() as c_int);
            if wait_ms > 0 {
                std::thread::sleep(std::time::Duration::from_millis(wait_ms));
            }
            sent
        };
        // The absolute-coordinate form every non-relative path uses.
        macro_rules! send {
            ($flags:expr, $wait:expr) => {
                send_at($flags, dx, dy, $wait)
            };
        }

        let mode = click_mode();
        warn!("[auto-click] delivering the click via {mode:?}");

        if mode == ClickMode::PostMessage {
            return post_click_to_window(window_handle, x_abs, y_abs);
        }

        if mode == ClickMode::Relative {
            // An absolute injection carries no delta, so a raw-input cursor never moves: it stays
            // wherever the player last left it while the OS cursor visibly lands on the button.
            // Deltas are all such a game understands, and since we cannot ask where its cursor is,
            // we put it somewhere known first - a move far larger than any screen clamps it into
            // the top-left corner - and then walk it to the target in one step.
            let pinned = send_at(MOUSEEVENTF_MOVE, -40000, -40000, 16);
            let walked = send_at(MOUSEEVENTF_MOVE, point.x, point.y, 16);
            let down = send!(MOUSEEVENTF_LEFTDOWN, 40);
            let up = send!(MOUSEEVENTF_LEFTUP, 0);
            if pinned == 0 || walked == 0 || down == 0 || up == 0 {
                warn!(
                    "[auto-click] relative SendInput was refused (pin={pinned}, walk={walked}, down={down}, up={up})"
                );
                return false;
            }
            return true;
        }

        // Move first, alone: one frame for the game to register the cursor where the button is.
        let moved = send!(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, 16);
        // Then the press, held long enough to survive a sample at 30 fps.
        let down = send!(MOUSEEVENTF_LEFTDOWN, 40);
        // Then the release. dx/dy are ignored without MOUSEEVENTF_MOVE; the cursor has not moved.
        let up = send!(MOUSEEVENTF_LEFTUP, 0);

        if mode == ClickMode::Both {
            std::thread::sleep(std::time::Duration::from_millis(60));
            let posted = post_click_to_window(window_handle, x_abs, y_abs);
            return posted && moved != 0 && down != 0 && up != 0;
        }

        if moved == 0 || down == 0 || up == 0 {
            // MSDN: a zero return means the input was blocked by another thread - UIPI, or an
            // input hook. Half a click is still a failure: the button may be left down.
            warn!(
                "[auto-click] SendInput was refused (move={moved}, down={down}, up={up}); the click did not land"
            );
            return false;
        }
        true
    }
}
