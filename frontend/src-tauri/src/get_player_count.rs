extern crate winapi;

use std::collections::HashMap;
use byteorder::{LittleEndian, ReadBytesExt};
use std::io::Cursor;
use winapi::um::winnt::{HANDLE};
use crate::memory_helper::ReadMemory;
use crate::offsets_getter::Offsets;

pub(crate) struct GetPlayerCount {
    process_handle: HANDLE,
}

impl GetPlayerCount {
    pub unsafe fn get_player_count(rm: ReadMemory) -> Option<u32> {
        let base_address = rm.base_address;

        let u_world_offset = match rm.read_ulong(base_address + rm.u_world_base + 3) {
            Ok(offset) => offset,
            Err(e) => {
                eprintln!("Error while reading u_world_offset: {}", e);
                return None;
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

        // println!("u_world: {}", world_address);

        let offsets = Offsets::new().unwrap();

        let u_level = rm.read_ptr(world_address + offsets.get_offset("World.PersistentLevel")).unwrap();
        let actor_raw_result = rm.read_bytes(u_level + 0xa0, 0xC);
        let actor_data = match actor_raw_result {
            Ok(actor_raw) => {
                let mut cursor = Cursor::new(actor_raw);
                (
                    cursor.read_i64::<LittleEndian>().unwrap(),
                    cursor.read_i32::<LittleEndian>().unwrap(),
                )
            }
            Err(e) => {
                eprintln!("Error while reading actor_raw: {}", e);
                return None;
            }
        };

        // Credit @mogistink https://www.unknowncheats.me/forum/members/3434160.html
        let level_actors_raw_result = rm.read_bytes(actor_data.0 as usize, (actor_data.1 * 8) as usize);

        let level_actors_raw = match level_actors_raw_result {
            Ok(data) => data,
            Err(e) => {
                eprintln!("Error while reading level_actors_raw: {}", e);
                return None;
            }
        };


        let mut player_count: u32 = 0;
        // let server_players = [];
        for x in 0..actor_data.1 {
            let actor_address = usize::from_le_bytes(level_actors_raw[(x as usize) * 8..(x as usize) * 8 + 8].try_into().unwrap());
            if actor_address == 0 { continue; }
            // This is a weird case which doesn't happen in python
            // println!("Actor address {:?}", actor_address);
            let actor_id = rm.read_int(actor_address + offsets.get_offset("Actor.actorId")).unwrap();
            if actor_id == 0 { continue; }

            // println!("Actor ID: {:?}", actor_id);

            let mut g_name = String::new();
            let g_name_result = rm.read_gname(actor_id as usize);
            match g_name_result {
                Ok(name) => {
                    g_name = name;
                    // println!("G name: {:?}", g_name);
                },
                Err(_) => {
                    // eprintln!("Error while reading g_name, skipping this iteration.");
                    continue;
                },
            }

            // println!("G name: {:?}", g_name);
            if g_name != "CrewService" { continue; }

            let crew_raw_result = rm.read_bytes(actor_address + offsets.get_offset("CrewService.Crews"), 16);
            let crew_raw = match crew_raw_result {
                Ok(data) => data,
                Err(e) => {
                    eprintln!("Error while reading crew_raw: {}", e);
                    return None;
                }
            };
            // println!("Raw bytes: {:?}", crew_raw);
            let mut cursor = Cursor::new(crew_raw);
            let q_value = cursor.read_u64::<LittleEndian>().unwrap();
            let i_value1 = cursor.read_i32::<LittleEndian>().unwrap();
            let i_value2 = cursor.read_i32::<LittleEndian>().unwrap();
            let crews = (q_value, i_value1, i_value2);

            // println!("Reading crews: {:?}", crews);

            let mut crew_tracker = HashMap::new();

            for x in 0..crews.1 {
                // println!("Reading crew: {:?}", x);
                // println!("Crew.Size: {:?}", offsets.get_offset("Crew.Size") * x as usize);
                // println!("Memory address: {:?}", crews.0 as usize + offsets.get_offset("Crew.Size") * x as usize);
                let crew_guid_raw = rm.read_bytes(crews.0 as usize + offsets.get_offset("Crew.Size") * x as usize, 16).unwrap();
                let mut cursor = Cursor::new(crew_guid_raw);
                let crew_guid = (
                    cursor.read_i32::<LittleEndian>().unwrap(),
                    cursor.read_i32::<LittleEndian>().unwrap(),
                    cursor.read_i32::<LittleEndian>().unwrap(),
                    cursor.read_i32::<LittleEndian>().unwrap(),
                );

                let crew_raw = rm.read_bytes(
                    crews.0 as usize + offsets.get_offset("Crew.Players") + offsets.get_offset("Crew.Size") * x as usize,
                    16,
                ).unwrap();
                let mut cursor = Cursor::new(crew_raw);
                let crew = (
                    cursor.read_u64::<LittleEndian>().unwrap(),
                    cursor.read_i32::<LittleEndian>().unwrap(),
                    cursor.read_i32::<LittleEndian>().unwrap(),
                );

                // println!("Reading crew: {:?}", crew);
                if crew.1 > 0 {
                    player_count += crew.1 as u32;
                    if !crew_tracker.contains_key(&crew_guid) {
                        crew_tracker.insert(crew_guid, crew_tracker.len() + 1);
                    }
                }
            }
        }

        Some(player_count)
    }
}
