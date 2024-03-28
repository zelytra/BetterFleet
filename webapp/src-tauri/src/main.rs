// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::thread::sleep;
use std::time::Duration;
use serde::Serialize;
use tauri::State;
use tokio::sync::RwLock;
use crate::api::{Api, GameStatus};
use crate::window_interaction::{set_focus_to_window, click_in_window_proportionally};
use std::ffi::CString;
use std::ptr::null_mut;
use winapi::um::winuser::FindWindowA;
use tauri::Manager;

mod fetch_informations;
mod api;
mod window_interaction;

#[derive(Serialize)]
struct GameObject {
    ip: String,
    port: u16,
    status: GameStatus
}

// Here's how to call Rust functions from frontend : https://tauri.app/v1/guides/features/command/

#[tokio::main]
async fn main() {
    let api_arc = fetch_informations::init().await.expect("Failed to initialize API");

    tauri::Builder::default()
        .manage(api_arc)
        .invoke_handler(tauri::generate_handler![
            get_game_status,
            get_server_ip,
            get_server_port,
            get_game_object,
            get_last_updated_server_ip,
            rise_anchor
        ])
        .setup(|app| {
            //let location = std::env::var("VITE_TAURI_LOCATION").unwrap_or_else(|_| "".to_string());
            //println!("{:?}", location);
            //let window = app.get_window("main").unwrap();
            //let _ = window.eval(&format!("window.location.replace('{}')", location)).unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn get_game_status(api: State<'_, Arc<RwLock<Api>>>) -> Result<GameStatus, String> {
    let api_lock = api.inner().read().await;
    Ok(api_lock.get_game_status().await)
}

#[tauri::command]
async fn get_server_ip(api: State<'_, Arc<RwLock<Api>>>) -> Result<String, String> {
    let api_lock = api.inner().read().await;
    Ok(api_lock.get_server_ip().await)
}

#[tauri::command]
async fn get_server_port(api: State<'_, Arc<RwLock<Api>>>) -> Result<u16, String> {
    let api_lock = api.inner().read().await;
    Ok(api_lock.get_server_port().await)
}

#[tauri::command]
async fn get_game_object(api: State<'_, Arc<RwLock<Api>>>) -> Result<GameObject, String> {
    // Let's build an array with ip, port and status
    let api_lock = api.inner().read().await;
    let game_object = GameObject {
        ip: api_lock.get_server_ip().await,
        port: api_lock.get_server_port().await,
        status: api_lock.get_game_status().await
    };

    Ok(game_object.into())
}

#[tauri::command]
async fn get_last_updated_server_ip(api: State<'_, Arc<RwLock<Api>>>) -> Result<u64, String> {
    let api_lock = api.inner().read().await;

    let instant = api_lock.get_last_updated_server_ip().await;
    let now = std::time::SystemTime::now();
    let epoch = std::time::UNIX_EPOCH;
    let duration_since_epoch = now.duration_since(epoch).expect("Time went backwards");
    let instant_duration = instant.elapsed();
    let total_duration = duration_since_epoch.checked_sub(instant_duration).expect("Time went backwards");
    Ok(total_duration.as_secs())
}

#[tauri::command]
fn rise_anchor() -> bool {
    let window_name = "Sea Of Thieves";
    let window_name_cstring = CString::new(window_name).unwrap();
    let window_handle = unsafe { FindWindowA(null_mut(), window_name_cstring.as_ptr()) };

    if window_handle.is_null() {
        println!("Could not find window with name: {}", window_name);
    } else {
        if set_focus_to_window(window_handle) {
            sleep(Duration::from_millis(50)); // Wait for the window to focus

            // Clic at 700;750 on a reference of 1920x1080
            // This corresponds to the middle of "Rise anchor" button
            let x_prop = 700.0 / 1920.0;
            let y_prop = 750.0 / 1080.0;

            click_in_window_proportionally(window_handle, x_prop, y_prop);
            return true;
        }
    }

    return false;
}