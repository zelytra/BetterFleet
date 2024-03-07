// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::CString;
use std::ptr::null_mut;
use winapi::um::winuser::{FindWindowA, SetForegroundWindow, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput};
use winapi::ctypes::c_int;
use std::mem::size_of;

pub(crate) fn set_focus_to_window(window_name: &str) -> bool {
    let window_name_cstring = CString::new(window_name).unwrap();
    let window_handle = unsafe { FindWindowA(null_mut(), window_name_cstring.as_ptr()) };

    if window_handle.is_null() {
        println!("Could not find window with name: {}", window_name);
        false
    } else {
        unsafe { SetForegroundWindow(window_handle) };
        true
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