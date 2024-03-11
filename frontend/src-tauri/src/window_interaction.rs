use std::ffi::CString;
use std::ptr::null_mut;
use winapi::um::winuser::{FindWindowA, SetForegroundWindow, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_MENU, keybd_event, SendInput, KEYEVENTF_EXTENDEDKEY};
use winapi::ctypes::c_int;
use std::mem::size_of;

pub(crate) fn set_focus_to_window(window_name: &str) -> bool {
    let window_name_cstring = CString::new(window_name).unwrap();
    let window_handle = unsafe { FindWindowA(null_mut(), window_name_cstring.as_ptr()) };

    if window_handle.is_null() {
        println!("Could not find window with name: {}", window_name);
        false
    } else {
        //This is a bypass from windows restriction
        //Holding alt while focusing seems to grant ability to focus in every conditions
        unsafe { keybd_event(VK_MENU as u8, 0, KEYEVENTF_EXTENDEDKEY | 0, 0); }
        let result = unsafe { SetForegroundWindow(window_handle) };
        unsafe { keybd_event(VK_MENU as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0); }
        return result != 0;
    }
}

pub(crate) fn send_key(virtual_keycode: u16) {
    let mut key_input = INPUT {
        type_: INPUT_KEYBOARD,
        u: unsafe { std::mem::zeroed() },
    };

    // Key pressed
    unsafe {
        *key_input.u.ki_mut() = KEYBDINPUT {
            wVk: virtual_keycode,
            wScan: 0,
            dwFlags: 0,
            time: 0,
            dwExtraInfo: 0,
        };
    }

    unsafe { SendInput(1, &mut key_input, size_of::<INPUT>() as c_int) };

    // Key release
    unsafe {
        *key_input.u.ki_mut() = KEYBDINPUT {
            wVk: virtual_keycode,
            wScan: 0,
            dwFlags: KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
        };
    }
    unsafe { SendInput(1, &mut key_input, size_of::<INPUT>() as c_int) };
}