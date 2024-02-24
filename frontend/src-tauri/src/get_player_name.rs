extern crate winapi;

use std::char::decode_utf16;
use winapi::um::winnt::{HANDLE};
use crate::memory_helper::ReadMemory;
use crate::offsets_getter::Offsets;

pub(crate) struct GetPlayerName {
    process_handle: HANDLE,
}

impl GetPlayerName {
    pub unsafe fn get_player_name(rm: ReadMemory) -> Option<String> {
        let base_address = rm.base_address;

        let u_world_offset = match rm.read_ulong(base_address + rm.u_world_base + 3) {
            Ok(offset) => offset,
            Err(e) => {
                eprintln!("Error while reading u_world_offset: {}", e);
                return None
            }
        };

        let u_world = base_address + rm.u_world_base + (u_world_offset as usize) + 7;
        let world_address = match rm.read_ptr(u_world) {
            Ok(address) => address,
            Err(e) => {
                eprintln!("Error while reading world_address: {}", e);
                return None;
            }
        };

        let offsets = Offsets::new().unwrap();

        println!("World Address: 0x{:X}", world_address);
        let owning_game_instance = rm.read_ptr(world_address + offsets.get_offset("World.OwningGameInstance")).unwrap();
        println!("OwningGameInstance: 0x{:X}", owning_game_instance);
        let local_player = rm.read_ptr(rm.read_ptr(owning_game_instance + offsets.get_offset("GameInstance.LocalPlayers")).unwrap()).unwrap();
        println!("LocalPlayer: 0x{:X}", local_player);
        let player_controller = rm.read_ptr(local_player + offsets.get_offset("Player.PlayerController")).unwrap(); // Player inherits LocalPlayer
        println!("Offset: 0x{:X}", offsets.get_offset("Player.PlayerController"));
        println!("PlayerController: 0x{:X}", player_controller);
        let player_state = rm.read_ptr(player_controller + offsets.get_offset("Controller.PlayerState")).unwrap(); // PlayerState inherits controller
        println!("PlayerState: 0x{:X}", player_state);
        let name_location = rm.read_ptr(player_state + offsets.get_offset("PlayerState.PlayerName")).unwrap();
        println!("NameLocation: 0x{:X}", name_location);
        let player_name = rm.read_name_string(name_location, 32).unwrap();
        return Some(player_name);
    }
}
