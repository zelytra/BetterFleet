// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::CString;
use std::{fs, io};
use std::io::BufRead;
use std::path::PathBuf;
use std::ptr::null_mut;
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::Duration;
use lazy_static::lazy_static;
use log::info;
use serde::Serialize;
use tauri::State;
use tauri_plugin_log::fern::colors::ColoredLevelConfig;
use tauri_plugin_log::LogTarget;
use tokio::sync::RwLock;
use winapi::um::winuser::FindWindowA;
use crate::api::{Api, GameStatus};
use crate::window_interaction::{click_in_window_proportionally, set_focus_to_window};
use sysinfo::{Networks, System};
use std::net::{IpAddr, ToSocketAddrs};

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


lazy_static! {
    static ref LOG_PATH: Mutex<PathBuf> = Mutex::new(PathBuf::new());
}
#[tokio::main]
async fn main() {
    let api_arc = fetch_informations::init().await.expect("Failed to initialize API");

    tauri::Builder::default()
        .setup(move |app| {
            let log_path = app.path_resolver().app_log_dir().unwrap();
            *LOG_PATH.lock().unwrap() = log_path;
            println!("{:?}", get_logs(100));
            Ok(())
        })
        .manage(api_arc)
        .plugin(tauri_plugin_log::Builder::default().targets([
            LogTarget::LogDir,
            LogTarget::Stdout,
            LogTarget::Webview,
        ])
        .with_colors(ColoredLevelConfig::default())
        .build())
        .invoke_handler(tauri::generate_handler![
            get_game_status,
            get_server_ip,
            get_server_port,
            get_game_object,
            get_last_updated_server_ip,
            rise_anchor,
            get_system_info
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

#[tauri::command]
fn get_logs(max_lines: usize) -> Result<String, Box<dyn std::error::Error>> {
    let log_path = LOG_PATH.lock().unwrap().clone();
    info!("Exporting logs from {}", log_path.display());

    let mut output = String::new();

    let entries = fs::read_dir(log_path)?;

    for entry_result in entries {
        let entry = entry_result?;
        if entry.path().is_file() {
            let file = fs::File::open(entry.path())?;
            let reader = io::BufReader::new(file);
            let lines: Vec<String> = reader.lines().collect::<Result<_, _>>()?;
            let lines = lines.into_iter().rev().take(max_lines).collect::<Vec<_>>();

            for line in lines {
                output.push_str(&line);
                output.push('\n');
            }
        }
    }

    Ok(output)
}

#[tauri::command]
fn get_system_info() -> String {
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut system_info = format!(
        "=> System:\n\
        Total memory: {} bytes\n\
        Used memory : {} bytes\n\
        Total swap  : {} bytes\n\
        Used swap   : {} bytes\n\
        System name:             {:?}\n\
        System kernel version:   {:?}\n\
        System OS version:       {:?}\n\
        System host name:        {:?}\n\
        CPU Architecture:        {:?}\n\
        NB CPUs: {}\n",
        sys.total_memory(),
        sys.used_memory(),
        sys.total_swap(),
        sys.used_swap(),
        System::name().unwrap(),
        System::kernel_version().unwrap(),
        System::long_os_version().unwrap(),
        System::host_name().unwrap(),
        System::cpu_arch().unwrap(),
        sys.cpus().len()
    );

    for (pid, process) in sys.processes() {
        let process_name = process.name();

        if process_name == "BetterFleet.exe" || process_name == "SoT.exe" {
            system_info.push_str(&format!(
                "[{}] {} CPU {}, {:?}\n",
                pid,
                process_name,
                process.cpu_usage(),
                process.disk_usage()
            ));
        }
    }

    system_info.push_str("=> Networks:\n");
    let networks = Networks::new_with_refreshed_list();
    for (interface_name, data) in &networks {
        system_info.push_str(&format!(
            "{}: {} B (down) / {} B (up)\n",
            interface_name,
            data.total_received(),
            data.total_transmitted()
        ));
    }

    let hostname = format!("{}:0", System::host_name().unwrap());
    let ip_addresses = match hostname.to_socket_addrs() {
        Ok(addrs) => addrs.map(|socket_addr| socket_addr.ip()).collect::<Vec<IpAddr>>(),
        Err(e) => {
            eprintln!("Error getting IP addresses: {}", e);
            return system_info;
        }
    };
    system_info.push_str("=> IP addresses:\n");
    for ip_address in ip_addresses {
        system_info.push_str(&format!("{}\n", ip_address));
    }

    system_info
}
