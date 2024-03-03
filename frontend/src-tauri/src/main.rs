// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use crate::api::{Api, GameStatus};

mod fetch_informations;
mod api;

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
            get_last_updated_server_ip
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