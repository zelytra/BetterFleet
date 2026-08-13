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

        // Mouse button down
        *mouse_input.u.mi_mut() = MOUSEINPUT {
            dx,
            dy,
            mouseData: 0,
            dwFlags: MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_LEFTDOWN,
            time: 0,
            dwExtraInfo: 0,
        };
        let down = SendInput(1, &mut mouse_input, size_of::<INPUT>() as c_int);

        // Mouse button up
        *mouse_input.u.mi_mut() = MOUSEINPUT {
            dx,
            dy,
            mouseData: 0,
            dwFlags: MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_LEFTUP,
            time: 0,
            dwExtraInfo: 0,
        };
        let up = SendInput(1, &mut mouse_input, size_of::<INPUT>() as c_int);

        if down == 0 || up == 0 {
            // MSDN: a zero return means the input was blocked by another thread - UIPI, or an
            // input hook. Half a click is still a failure: the button may be left down.
            warn!("[auto-click] SendInput was refused (down={down}, up={up}); the click did not land");
            return false;
        }
        true
    }
}
