// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::CString;
use std::{fs, io, panic};
use std::io::{BufRead, Cursor};
use std::path::PathBuf;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::Duration;
use lazy_static::lazy_static;
use log::{error, info, LevelFilter};
use serde::{Deserialize, Serialize};
use tauri::{GlobalShortcutManager, Manager, State, WindowEvent};
use tauri_plugin_log::fern::colors::ColoredLevelConfig;
use tauri_plugin_log::{LogTarget, RotationStrategy};
use tokio::sync::RwLock;
use winapi::um::winuser::FindWindowA;
use crate::api::{Api, GameStatus};
use crate::window_interaction::{click_in_window_proportionally, set_focus_to_window};
use sysinfo::{Networks, System};
use std::net::{IpAddr, ToSocketAddrs};

mod fetch_informations;
mod api;
mod window_interaction;
mod diagnostics;

#[cfg(debug_assertions)]
const LOG_LEVEL: LevelFilter = LevelFilter::Debug;

#[cfg(not(debug_assertions))]
const LOG_LEVEL: LevelFilter = LevelFilter::Info;

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

// The launch-countdown jingle, embedded so native playback needs no bundled resource. Played from
// Rust because webview audio is suspended while the window sits occluded behind the game (#671) —
// native audio answers to no visibility policy.
static COUNTDOWN_SOUND: &[u8] = include_bytes!("../../src/assets/sounds/countdown.mp3");

/// The overlay's last position and size in physical desktop coordinates (#671). Desktop coordinates
/// span every monitor, so persisting them puts the overlay back on the same screen too.
#[derive(Serialize, Deserialize, Clone, Copy)]
struct OverlayLayout {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn overlay_layout_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path_resolver()
        .app_config_dir()
        .map(|dir| dir.join("overlay-layout.json"))
}

/// True when the saved top-left corner still falls on one of the connected monitors — restoring a
/// position from an unplugged screen would reopen the overlay out of sight, undraggable.
/// Monitors are (x, y, width, height) in physical desktop coordinates.
fn layout_is_on_screen(layout: &OverlayLayout, monitors: &[(i32, i32, u32, u32)]) -> bool {
    monitors.iter().any(|(mx, my, mw, mh)| {
        layout.x >= *mx
            && layout.x < mx + *mw as i32
            && layout.y >= *my
            && layout.y < my + *mh as i32
    })
}

/// Puts the overlay back exactly where the player left it last session. Runs during setup, while
/// the overlay is still hidden, so the move is never visible. First run (no file) keeps the
/// tauri.conf.json defaults.
fn restore_overlay_layout(app: &tauri::AppHandle) {
    let overlay = match app.get_window("overlay") {
        Some(window) => window,
        None => return,
    };
    let raw = match overlay_layout_path(app).map(fs::read_to_string) {
        Some(Ok(raw)) => raw,
        _ => return,
    };
    let layout: OverlayLayout = match serde_json::from_str(&raw) {
        Ok(layout) => layout,
        Err(e) => {
            error!("[overlay] ignoring corrupt layout file: {}", e);
            return;
        }
    };
    let monitors: Vec<(i32, i32, u32, u32)> = overlay
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let (pos, size) = (m.position(), m.size());
            (pos.x, pos.y, size.width, size.height)
        })
        .collect();
    if !layout_is_on_screen(&layout, &monitors) {
        info!("[overlay] saved position is on a disconnected screen, keeping defaults");
        return;
    }
    let _ = overlay.set_position(tauri::PhysicalPosition::new(layout.x, layout.y));
    let _ = overlay.set_size(tauri::PhysicalSize::new(layout.width, layout.height));
}

/// Remembers where the overlay sits right now. Called as the app closes: the live window carries
/// its geometry the whole session (hidden or shown), so one read at exit is all persistence needs.
fn save_overlay_layout(overlay: &tauri::Window) {
    let path = match overlay_layout_path(&overlay.app_handle()) {
        Some(path) => path,
        None => return,
    };
    let (pos, size) = match (overlay.outer_position(), overlay.outer_size()) {
        (Ok(pos), Ok(size)) => (pos, size),
        _ => return,
    };
    let layout = OverlayLayout {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    match serde_json::to_string(&layout) {
        Ok(json) => {
            if let Err(e) = fs::write(&path, json) {
                error!("[overlay] failed to save layout: {}", e);
            }
        }
        Err(e) => error!("[overlay] failed to serialize layout: {}", e),
    }
}
/// True while the countdown jingle is playing, so the frontend can poke every tick and the sound
/// still loops cleanly instead of stacking.
static SOUND_PLAYING: AtomicBool = AtomicBool::new(false);
#[tokio::main]
async fn main() {
    let api_arc = fetch_informations::init().await.expect("Failed to initialize API");

    panic::set_hook(Box::new(move |panic_info| {
        error!("Crashed, gathering informations");
        let payload = panic_info.payload().downcast_ref::<&str>().unwrap_or(&"Unknown panic");
        let location = panic_info.location().map(|l| l.to_string()).unwrap_or_else(|| String::from("Unknown location"));
        error!("Panic occurred at {}: {}", location, payload);
    }));

    tauri::Builder::default()
        .setup(move |app| {
            let log_path = app.path_resolver().app_log_dir().unwrap();
            *LOG_PATH.lock().unwrap() = log_path;

            // Global hotkey to toggle the in-game overlay (issue #671). Registered in Rust rather
            // than through the JS global-shortcut API, which did not fire reliably. Ctrl+Shift+O
            // shows/hides the overlay window; the main window keeps its content fresh over events.
            let handle = app.handle();
            let mut shortcuts = app.global_shortcut_manager();
            if let Err(e) = shortcuts.register("CommandOrControl+Shift+O", move || {
                if let Some(overlay) = handle.get_window("overlay") {
                    if overlay.is_visible().unwrap_or(false) {
                        let _ = overlay.hide();
                    } else {
                        let _ = overlay.show();
                    }
                }
            }) {
                error!("Failed to register overlay hotkey: {}", e);
            }

            // Reopen the overlay exactly where the player left it last session (#671) — position,
            // size, and therefore screen — while it is still hidden, so the move is never seen.
            restore_overlay_layout(&app.handle());

            Ok(())
        })
        .on_window_event(|event| {
            // The overlay is a separate top-level window; closing the main window must take it down
            // with it, otherwise it lingers on screen after the app is gone (issue #671).
            if let WindowEvent::CloseRequested { .. } = event.event() {
                let window = event.window();
                if window.label() == "main" {
                    if let Some(overlay) = window.get_window("overlay") {
                        // Remember where the player parked it before taking it down (#671).
                        save_overlay_layout(&overlay);
                        let _ = overlay.close();
                    }
                }
            }
        })
        .manage(api_arc)
        .plugin(
            tauri_plugin_log::Builder::default().targets([
                LogTarget::LogDir,
                LogTarget::Stdout,
                LogTarget::Webview,
            ])
            .max_file_size(2_000) //Seems 2MB
            .with_colors(ColoredLevelConfig::default())
            .level(LOG_LEVEL)
            .rotation_strategy(RotationStrategy::KeepAll)
            .build()
        )
        .invoke_handler(tauri::generate_handler![
            get_game_status,
            get_server_ip,
            get_server_port,
            get_game_object,
            get_last_updated_server_ip,
            rise_anchor,
            get_logs,
            get_system_info,
            run_server_diagnostic,
            play_countdown_sound
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
async fn get_logs(max_lines: usize) -> tauri::Result<serde_json::Value> {
    let log_path = LOG_PATH.lock().unwrap().clone();
    info!("Exporting logs from file");

    let mut output = String::new();

    let entries = fs::read_dir(log_path).map_err(|e| tauri::Error::from(e))?;

    for entry_result in entries {
        let entry = entry_result.map_err(|e| tauri::Error::from(e))?;
        if entry.path().is_file() {
            let file = fs::File::open(entry.path()).map_err(|e| tauri::Error::from(e))?;
            let reader = io::BufReader::new(file);
            let lines: Vec<String> = reader.lines().take(max_lines).collect::<Result<_, _>>().map_err(|e| tauri::Error::from(e))?;

            for line in lines {
                output.push_str(&line);
                output.push('\n');
            }
        }
    }
    info!("Logs exported");

    Ok(serde_json::Value::String(output))
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
        System fetched hostname: {:?}\n\
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
        fetch_informations::get_hostname(),
        System::kernel_version().unwrap(),
        System::long_os_version().unwrap(),
        System::host_name().unwrap(),
        System::cpu_arch().unwrap(),
        sys.cpus().len()
    );

    for (pid, process) in sys.processes() {
        let process_name = process.name();

        if process_name == "BetterFleet.exe" || process_name == "SoTGame.exe" {
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

/// Diagnostic capture for issue #364. Sniffs the running game's UDP flows for a
/// few seconds and returns a per-flow volume report (also written to the logs), so
/// the real server flow can be told apart from the Steam Datagram Relay noise.
/// Purely observational — it does not affect live detection.
#[tauri::command]
async fn run_server_diagnostic(
    api: State<'_, Arc<RwLock<Api>>>,
    duration_secs: u64,
    note: String,
) -> Result<diagnostics::DiagnosticReport, String> {
    let pids = fetch_informations::find_pid_of("SoTGame.exe");
    let pid: usize = match pids.first() {
        Some(pid) => pid.parse().map_err(|e| format!("invalid pid: {}", e))?,
        None => return Err("Sea of Thieves (SoTGame.exe) is not running.".into()),
    };

    let ports_netstat2 = fetch_informations::get_udp_connections(pid);
    let ports_powershell = fetch_informations::get_udp_connections_powershell(pid);

    let (game_status, main_menu_port) = {
        let api_lock = api.inner().read().await;
        (
            format!("{:?}", api_lock.game_status),
            api_lock.main_menu_port,
        )
    };

    // Sniff the union of both port sources.
    let mut ports = ports_netstat2.clone();
    for port in &ports_powershell {
        if !ports.contains(port) {
            ports.push(*port);
        }
    }

    let duration = Duration::from_secs(duration_secs.clamp(3, 60));
    info!(
        "[diagnostic] starting capture (note='{}', {} ports, {:?})",
        note,
        ports.len(),
        duration
    );

    let report = diagnostics::run_diagnostic(
        ports,
        duration,
        note,
        game_status,
        main_menu_port,
        Some(pid as u32),
        ports_netstat2,
        ports_powershell,
    )
    .await;

    match serde_json::to_string(&report) {
        Ok(json) => info!("[diagnostic] report: {}", json),
        Err(e) => error!("[diagnostic] failed to serialize report: {}", e),
    }

    Ok(report)
}

/// Plays the launch-countdown jingle natively (#671). Webview audio is suspended while the window
/// is occluded behind the game, so `SessionCountdown` asks Rust instead: rodio opens the default
/// output device on its own thread, immune to the webview's focus/occlusion/autoplay policies.
///
/// `volume` is 0.0–1.0 (the app's sound level / 100). Returns `false` when the jingle is already
/// playing — the frontend pokes every tick and this dedup is what makes it loop instead of stack.
#[tauri::command]
fn play_countdown_sound(volume: f32) -> bool {
    if SOUND_PLAYING.swap(true, Ordering::SeqCst) {
        return false;
    }
    std::thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let (_stream, handle) =
                rodio::OutputStream::try_default().map_err(|e| e.to_string())?;
            let sink = rodio::Sink::try_new(&handle).map_err(|e| e.to_string())?;
            let source =
                rodio::Decoder::new(Cursor::new(COUNTDOWN_SOUND)).map_err(|e| e.to_string())?;
            sink.set_volume(volume.clamp(0.0, 1.0));
            sink.append(source);
            // Blocks this dedicated thread until the jingle ends; _stream must outlive playback.
            sink.sleep_until_end();
            Ok(())
        })();
        if let Err(e) = result {
            error!("[sound] countdown playback failed: {}", e);
        }
        SOUND_PLAYING.store(false, Ordering::SeqCst);
    });
    true
}

#[cfg(test)]
mod overlay_layout_tests {
    use super::*;

    // A 1080p primary at the origin and a second screen to its LEFT — negative desktop coordinates,
    // the multi-monitor case that breaks naive "x >= 0" assumptions.
    const MONITORS: &[(i32, i32, u32, u32)] =
        &[(0, 0, 1920, 1080), (-2560, 0, 2560, 1440)];

    #[test]
    fn accepts_a_position_on_the_primary_screen() {
        let layout = OverlayLayout { x: 100, y: 200, width: 300, height: 260 };
        assert!(layout_is_on_screen(&layout, MONITORS));
    }

    #[test]
    fn accepts_a_position_on_a_negative_coordinate_screen() {
        let layout = OverlayLayout { x: -1800, y: 300, width: 300, height: 260 };
        assert!(layout_is_on_screen(&layout, MONITORS));
    }

    #[test]
    fn rejects_a_position_from_a_disconnected_screen() {
        // Saved while a third screen sat to the right of the primary; that screen is gone now.
        let layout = OverlayLayout { x: 2500, y: 100, width: 300, height: 260 };
        assert!(!layout_is_on_screen(&layout, MONITORS));
    }

    #[test]
    fn rejects_everything_when_no_monitor_is_known() {
        let layout = OverlayLayout { x: 10, y: 10, width: 300, height: 260 };
        assert!(!layout_is_on_screen(&layout, &[]));
    }

    #[test]
    fn layout_survives_a_serde_round_trip() {
        let layout = OverlayLayout { x: -42, y: 17, width: 320, height: 150 };
        let json = serde_json::to_string(&layout).unwrap();
        let back: OverlayLayout = serde_json::from_str(&json).unwrap();
        assert_eq!(
            (back.x, back.y, back.width, back.height),
            (layout.x, layout.y, layout.width, layout.height)
        );
    }
}
