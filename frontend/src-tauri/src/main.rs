// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod process_finder;
use tauri::command;
fn main() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
    Builder::default()
        .invoke_handler(tauri::generate_handler![
      find_pid,
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[command]
fn find_pid(process: String) -> Vec<String> {
    println!("Finding PID of process: {}", process);
    return process_finder::ProcessFinder::find_pid_of(&process);
}