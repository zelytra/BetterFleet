use crate::memory_helper::ReadMemory;
use crate::offsets_getter::Offsets;

pub struct GetPlayerName;

impl GetPlayerName {
    pub unsafe fn get_player_name(rm: ReadMemory) -> Option<String> {
        let world_address = rm.world_address;

        let offsets = Offsets::new().unwrap();

        let owning_game_instance = rm.read_ptr(world_address + offsets.get_offset("World.OwningGameInstance")).unwrap();
        let local_player = rm.read_ptr(rm.read_ptr(owning_game_instance + offsets.get_offset("GameInstance.LocalPlayers")).unwrap()).unwrap();
        let player_controller = rm.read_ptr(local_player + offsets.get_offset("Player.PlayerController")).unwrap(); // Player inherits LocalPlayer
        let player_state = rm.read_ptr(player_controller + offsets.get_offset("Controller.PlayerState")).unwrap(); // PlayerState inherits controller
        let name_location = rm.read_ptr(player_state + offsets.get_offset("PlayerState.PlayerName")).unwrap();
        let player_name = rm.read_name_string(name_location, 32).unwrap();

        let ping = rm.read_bytes(player_state + offsets.get_offset("PlayerState.Ping"), 1).unwrap();
        println!("Ping: {:?}", ping[0]);
        return Some(player_name);
    }
}
