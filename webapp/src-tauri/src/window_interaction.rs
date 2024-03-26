use winapi::um::winuser::{INPUT, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE, MOUSEINPUT, SendInput, SM_CYSCREEN};
use winapi::um::winuser::SM_CXSCREEN;
use winapi::ctypes::c_int;
use std::mem::size_of;
use winapi::um::winuser::{GetSystemMetrics, SetForegroundWindow, GetClientRect, ClientToScreen, keybd_event};
use winapi::um::winuser::{MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, VK_MENU, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP};
use winapi::shared::windef::{HWND, POINT, RECT};

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
pub(crate) fn click_in_window_proportionally(window_handle: HWND, x_prop: f32, y_prop: f32) {
    unsafe {
        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if GetClientRect(window_handle, &mut rect) == 0 {
            println!("Failed to get client rect.");
            return;
        }

        let window_width = rect.right - rect.left;
        let window_height = rect.bottom - rect.top;

        let window_aspect_ratio = window_width as f32 / window_height as f32;
        let game_aspect_ratio = 16.0 / 9.0; //Main menu aspect ratio is always forced to 16/9

        let (game_content_width, game_content_height, black_bar_width, black_bar_height) = if window_aspect_ratio < game_aspect_ratio {
            // Black bars at the top and bottom
            let game_content_height = (window_width as f32 * 9.0) / 16.0;
            let black_bar_height = (window_height as f32 - game_content_height) / 2.0;
            (window_width as f32, game_content_height, 0.0, black_bar_height)
        } else {
            // Black bars on the left and right
            let game_content_width = (window_height as f32 * 16.0) / 9.0;
            let black_bar_width = (window_width as f32 - game_content_width) / 2.0;
            (game_content_width, window_height as f32, black_bar_width, 0.0)
        };

        let x_abs = (x_prop * game_content_width + black_bar_width) as c_int;
        let y_abs = (y_prop * game_content_height + black_bar_height) as c_int;

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
        SendInput(1, &mut mouse_input, size_of::<INPUT>() as c_int);

        // Mouse button up
        *mouse_input.u.mi_mut() = MOUSEINPUT {
            dx,
            dy,
            mouseData: 0,
            dwFlags: MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_LEFTUP,
            time: 0,
            dwExtraInfo: 0,
        };
        SendInput(1, &mut mouse_input, size_of::<INPUT>() as c_int);
    }
}