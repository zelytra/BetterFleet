// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Instant;
use tauri::State;
use crate::api::{Api, GameStatus};

mod fetch_informations;
mod api;

#[tokio::main]
async fn main() {
    let api = fetch_informations::init().await;

    tauri::Builder::default()
        .manage(api)
        .invoke_handler(tauri::generate_handler![
        get_game_status,
        get_server_ip,
        get_server_port,
        get_last_updated_server_ip
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");


    /*    let api = fetch_informations::init().await;
    loop {
        if let Ok(api) = &api {
            let api_read = api.read().await;
            let server_ip = api_read.get_server_ip().await;
            println!("---");
            println!("Server IP: {}", server_ip);
            println!("Server Port: {}", api_read.get_server_port().await);
            println!("Game Status: {:?}", api_read.get_game_status().await);
            println!("---");
        } else if let Err(e) = &api {
            eprintln!("Failed to initialize API: {}", e);
        }

        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }*/
}

#[tauri::command]
async fn get_game_status(api: State<'_, Api>) -> Result<GameStatus, String> {
    Ok(api.inner().get_game_status().await)
}

#[tauri::command]
async fn get_server_ip(api: State<'_, Api>) -> Result<String, String> {
    Ok(api.inner().get_server_ip().await)
}

#[tauri::command]
async fn get_server_port(api: State<'_, Api>) -> Result<u16, String> {
    Ok(api.inner().get_server_port().await)
}

#[tauri::command]
async fn get_last_updated_server_ip(api: State<'_, Api>) -> Result<u64, String> {
    let instant = api.inner().get_last_updated_server_ip().await;
    let now = std::time::SystemTime::now();
    let epoch = std::time::UNIX_EPOCH;
    let duration_since_epoch = now.duration_since(epoch).expect("Time went backwards");
    let instant_duration = instant.elapsed();
    let total_duration = duration_since_epoch.checked_sub(instant_duration).expect("Time went backwards");
    Ok(total_duration.as_secs())
}