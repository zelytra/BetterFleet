// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod process_finder;
mod get_player_count;
mod memory_helper;
mod offsets_getter;
mod get_player_name;

use tauri::{Builder, command};
use crate::get_player_count::GetPlayerCount;
use crate::get_player_name::GetPlayerName;
use crate::memory_helper::ReadMemory;


fn main() {
    Builder::default()
        .invoke_handler(tauri::generate_handler![
            find_pid,
            get_player_count,
            get_player_name
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/**
 * This function is used to find the PID of a process (expected SoTGame.exe here)
 *
 * @param process: The name of the process to find the PID of
 * @return A vector of strings containing the PIDs of the process
 */
#[command]
fn find_pid(process: String) -> Vec<String> {
    println!("Finding PID of process: {}", process);
    return process_finder::ProcessFinder::find_pid_of(&process);
}

/**
 * This function is used to get the player count in the game
 *
 * @param rm: The ReadMemory instance to use to read the memory
 * @return The player count or None
 */
#[command]
fn get_player_count(rm: ReadMemory) -> Option<u32> {
    unsafe {
        return match GetPlayerCount::get_player_count(rm) {
            Some(player_count) => {
                Some(player_count)
            },
            None => {
                eprintln!("An error occurred while getting the player count.");
                None
            }
        }
    }
}

/**
 * This function is used to get the player name in the game
 *
 * @param rm: The ReadMemory instance to use to read the memory
 * @return The player name or None or "Player" if the player didn't join the game yet
 */
#[command]
fn get_player_name(rm: ReadMemory) -> Option<String> {
    unsafe {
        return match GetPlayerName::get_player_name(rm) {
            Some(player_name) => {
                Some(player_name)
            },
            None => {
                eprintln!("An error occurred while getting the player name.");
                None
            }
        }
    }
}