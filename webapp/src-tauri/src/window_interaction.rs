use winapi::um::winuser::{INPUT, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE, MOUSEINPUT, SendInput, SM_CYSCREEN};
use winapi::um::winuser::SM_CXSCREEN;
use winapi::ctypes::c_int;
use std::mem::size_of;
use winapi::um::winuser::{GetSystemMetrics, SetForegroundWindow, GetForegroundWindow, GetClientRect, ClientToScreen, GetCursorPos, SystemParametersInfoA, SPI_GETMOUSE, SPI_GETMOUSESPEED, keybd_event};
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
        Ok("sendinput") => ClickMode::SendInput,
        // Relative deltas are the one path the field test validated: the game drives its cursor
        // from raw input, where absolute injections carry no delta and posted window messages are
        // never read. See the enum doc.
        _ => ClickMode::Relative,
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

/// Whether two windows belong to the same process. The foreground guards compare processes, not
/// handles: the game owns more than one window (render target, splash, occasional child), and
/// GetForegroundWindow can name a different one of them than FindWindowA did. Requiring the exact
/// handle would refuse a click the player asked for; a window of the same process is still the game.
pub(crate) fn same_process(a: HWND, b: HWND) -> bool {
    use winapi::um::winuser::GetWindowThreadProcessId;
    let mut pid_a: u32 = 0;
    let mut pid_b: u32 = 0;
    unsafe {
        GetWindowThreadProcessId(a, &mut pid_a);
        GetWindowThreadProcessId(b, &mut pid_b);
    }
    pid_a != 0 && pid_a == pid_b
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
            // the top-left corner - and then walk it to the target.
            //
            // The pointer ballistics that scale relative OS-cursor motion, logged once per click:
            // when the visible cursor lands somewhere else than the game's, these numbers say why.
            // params[2] != 0 means "Enhance pointer precision" is on; speed 10 of 20 is 1:1.
            let mut mouse_params = [0i32; 3];
            let mut pointer_speed: i32 = 0;
            SystemParametersInfoA(SPI_GETMOUSE, 0, mouse_params.as_mut_ptr() as *mut _, 0);
            SystemParametersInfoA(
                SPI_GETMOUSESPEED,
                0,
                &mut pointer_speed as *mut _ as *mut _,
                0,
            );
            warn!(
                "[auto-click] pointer ballistics: accel={} speed={pointer_speed}/20",
                mouse_params[2]
            );

            // Pinned TWICE, a frame apart: the game integrates deltas per frame, and the field runs
            // showed a single oversized slam landing inconsistently - presumably clamped mid-frame.
            let pin1 = send_at(MOUSEEVENTF_MOVE, -40000, -40000, 20);
            let pin2 = send_at(MOUSEEVENTF_MOVE, -40000, -40000, 20);
            let mut corner = POINT { x: 0, y: 0 };
            GetCursorPos(&mut corner);

            // Walk in SCREEN coordinates (settled empirically: the client-coordinate walk missed
            // outright), and in SMALL STEPS. Raw-input consumers integrate deltas identically
            // however they are chunked - but the OS cursor scales every packet through the
            // ballistics above, and acceleration explodes on one huge delta: that is the
            // bottom-right flight of field round three. Steps of at most 64px stay in the ~1:1
            // regime, so the visible cursor and the game's travel roughly together.
            let (mut remaining_x, mut remaining_y) = (point.x, point.y);
            let mut walked = 1u32;
            while remaining_x != 0 || remaining_y != 0 {
                let step_x = remaining_x.clamp(-64, 64);
                let step_y = remaining_y.clamp(-64, 64);
                remaining_x -= step_x;
                remaining_y -= step_y;
                if send_at(MOUSEEVENTF_MOVE, step_x, step_y, 4) == 0 {
                    walked = 0;
                    break;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(32));
            let mut landed = POINT { x: 0, y: 0 };
            GetCursorPos(&mut landed);
            // The OS cursor's landing vs the target measures the effective scale end to end: on
            // the button = ballistics tamed; short or long by a stable ratio = a scale to calibrate
            // out; on the button while the GAME still misses = the game scales its own cursor.
            warn!(
                "[auto-click] relative walk: corner=({},{}) target=({},{}) os-cursor=({},{})",
                corner.x, corner.y, point.x, point.y, landed.x, landed.y
            );

            // The original absolute placement returns here as the finisher. As the SOLE
            // positioning it never produced a click - a raw-input cursor sees no delta in it - but
            // it is immune to the ballistics that scale every relative move, so it is what puts
            // the VISIBLE cursor exactly on the button: the walk fed the game its journey, this
            // corrects wherever ballistics left the OS cursor, and a game that polls the OS
            // position gets the exact target either way.
            let snapped = send!(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, 16);

            // Mouse input goes to whatever window is foreground NOW. If another PROCESS stole it
            // during the pin-and-walk, refuse: half a second late is recoverable, a click fired
            // into another application is not.
            let foreground = GetForegroundWindow();
            if foreground != window_handle && !same_process(foreground, window_handle) {
                warn!("[auto-click] the game lost the foreground mid-click; not clicking into another window");
                return false;
            }
            let down = send!(MOUSEEVENTF_LEFTDOWN, 40);
            let up = send!(MOUSEEVENTF_LEFTUP, 0);
            if pin1 == 0 || pin2 == 0 || walked == 0 || snapped == 0 || down == 0 || up == 0 {
                warn!(
                    "[auto-click] relative SendInput was refused (pin={pin1}/{pin2}, walk={walked}, snap={snapped}, down={down}, up={up})"
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
