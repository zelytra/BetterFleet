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

/// The game drives its menu cursor from RAW INPUT deltas, not from the OS cursor: an injected
/// absolute move lands the visible cursor on the button without producing so much as a hover, and
/// window messages posted to its queue are never read (both established in the field, one rebuild
/// per hypothesis). Deltas are all it understands, so the click positions twice, once per consumer:
///
/// 1. For the GAME: pin its cursor into the top-left corner with two oversized negative moves
///    (we cannot ask where it is, so we put it somewhere known), then walk it to the target with
///    relative deltas, chunked small - raw-input consumers integrate deltas identically however
///    they are chunked, but the OS cursor scales every packet through the pointer ballistics, and
///    acceleration explodes on one huge delta (field round: a straight flight into the
///    bottom-right clamp).
/// 2. For the PLAYER and anything that polls the OS position: one absolute move, immune to
///    ballistics, snapping the visible cursor exactly onto the button.
///
/// Then press, held for tens of milliseconds like a real mouse, so a game sampling input per frame
/// cannot miss it. Every attempt logs the ballistics settings, the pinned corner, the target and
/// the OS cursor's actual landing: when a field machine misbehaves, one log line measures the
/// effective scale instead of guessing it from a description (#815).
///
/// Returns whether the click was actually injected. `SendInput` returns the number of events it
/// inserted, and 0 when the injection is blocked - discarding that return is why a click that
/// stops working used to produce no signal at all.
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
        // The absolute-coordinate form the snap and the press use.
        macro_rules! send {
            ($flags:expr, $wait:expr) => {
                send_at($flags, dx, dy, $wait)
            };
        }

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

        // Walk in SCREEN coordinates (settled empirically: a client-coordinate walk missed
        // outright), in steps of at most 64px so no single packet reaches the steep part of the
        // acceleration curve.
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
        // The OS cursor's landing vs the target measures the effective ballistics scale end to
        // end; the snap below corrects whatever it left over.
        warn!(
            "[auto-click] relative walk: corner=({},{}) target=({},{}) os-cursor=({},{})",
            corner.x, corner.y, point.x, point.y, landed.x, landed.y
        );

        // The finisher: ballistics-immune, so it puts the VISIBLE cursor exactly on the button.
        // The walk fed the game its journey; a game that polls the OS position gets the exact
        // target either way.
        let snapped = send!(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, 16);

        // Mouse input goes to whatever window is foreground NOW. If another PROCESS stole it
        // during the pin-and-walk, refuse: half a second late is recoverable, a click fired
        // into another application is not.
        let foreground = GetForegroundWindow();
        if foreground != window_handle && !same_process(foreground, window_handle) {
            warn!("[auto-click] the game lost the foreground mid-click; not clicking into another window");
            return false;
        }
        // Held long enough to survive a sample at 30 fps.
        let down = send!(MOUSEEVENTF_LEFTDOWN, 40);
        let up = send!(MOUSEEVENTF_LEFTUP, 0);
        if pin1 == 0 || pin2 == 0 || walked == 0 || snapped == 0 || down == 0 || up == 0 {
            // MSDN: a zero return means the input was blocked by another thread - UIPI, or an
            // input hook. Half a click is still a failure: the button may be left down.
            warn!(
                "[auto-click] SendInput was refused (pin={pin1}/{pin2}, walk={walked}, snap={snapped}, down={down}, up={up})"
            );
            return false;
        }
        true
    }
}
