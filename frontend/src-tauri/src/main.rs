// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod fetch_informations;
mod api;

#[tokio::main]
async fn main() {
    let api = fetch_informations::init().await;

    tauri::Builder::default()
        .manage(api)
        .invoke_handler(tauri::generate_handler![
        api::Api::get_game_status,
        api::Api::get_server_ip,
        api::Api::get_server_port,
        api::Api::get_last_updated_server_ip
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