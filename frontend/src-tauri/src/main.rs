// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::thread::sleep;
use std::time::Duration;
use tauri::State;
use tokio::sync::RwLock;
use crate::api::{Api, GameStatus};
use crate::window_interaction::{set_focus_to_window, send_key};

mod fetch_informations;
mod api;
mod window_interaction;

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
            get_last_updated_server_ip,
            drop_anchor
        ])
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
fn drop_anchor() -> bool {
    if set_focus_to_window("Sea Of Thieves") {
        // Maybe we shouldn't hardcode a sleep duration, but I don't see any other way to do it
        sleep(Duration::from_millis(10));

        // TODO: Currently left key (which focus last focused button)
        // But we may want to click on the button by using % of the screen size
        send_key(0x25);

        sleep(Duration::from_millis(1));
        send_key(0x0D); // Enter key
        return true;
    }

    return false;
}