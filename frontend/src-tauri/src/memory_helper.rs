extern crate winapi;

use std::collections::HashMap;
use winapi::um::tlhelp32::{
    CreateToolhelp32Snapshot, Module32First, Module32Next, MODULEENTRY32, TH32CS_SNAPMODULE, TH32CS_SNAPMODULE32,
};
use winapi::um::winnt::{HANDLE, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
use winapi::um::memoryapi::ReadProcessMemory;
use winapi::um::processthreadsapi::OpenProcess;
use winapi::um::handleapi::CloseHandle;
use std::ptr;
use std::ffi::CStr;
use std::fs::File;
use std::io::BufReader;
use std::mem::size_of;
use crate::process_finder;
use std::str;
use serde_json::Error;

const MAX_PATH: usize = 260;
const MAX_MODULE_NAME32: usize = 255;


// Inspired from https://github.com/DougTheDruid/SoT-ESP-Framework/blob/17972aef36cbcf06ce130417823f6dae0d09adee/memory_helper.py#L167

#[derive(Clone, Copy)]
pub(crate) struct ReadMemory {
    handle: HANDLE,
    pub(crate) pid: u32,
    pub(crate) base_address: usize,
    pub(crate) g_name_start_address: usize,
    pub(crate) u_world_base: usize,
    pub(crate) world_address: usize
}

impl ReadMemory {
    pub(crate) fn new(exe_name: &str) -> Result<Self, String> {
        let pids = process_finder::ProcessFinder::find_pid_of(exe_name);
        if pids.is_empty() {
            return Err(format!("Cannot find executable with name: {}", exe_name));
        }
        let pid = *&pids[0].parse::<u32>().unwrap();
        println!("PID: {:?}", pid);

        let handle = unsafe {
            OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid)
        };
        if handle.is_null() {
            return Err(format!("Failed to open process for PID: {}", pid));
        }
        println!("Handle: {:?}", handle);

        let base_address = match get_base_address(pid, exe_name) {
            Some(address) => address,
            None => {
                unsafe { CloseHandle(handle) };
                return Err(format!("Failed to find base address for {}", exe_name));
            }
        };
        println!("Base address: {:x}", base_address);

        let mut instance = ReadMemory {
            handle,
            pid,
            base_address,
            g_name_start_address: 0,
            u_world_base: 0,
            world_address: 0
        };

        let bulk_scan = match instance.read_memory_segment(base_address, 1_000_000_000) {
            Ok(data) => data,
            Err(e) => {
                println!("Error reading memory segment: {}", e);
                return Err("Failed to read memory segment".into());
            }
        };
        println!("Bulk scan read");

        let patterns = read_patterns_from_file().unwrap();

        let u_world_base = search_data_for_pattern(&bulk_scan, patterns.get("UWORLD").unwrap());
        if u_world_base.is_none() {
            return Err("Failed to find uWorld base".into());
        }
        instance.u_world_base = u_world_base.unwrap();

        let g_object_base = search_data_for_pattern(&bulk_scan, patterns.get("GOBJECT").unwrap());

        let g_name_base = search_data_for_pattern(&bulk_scan, patterns.get("GNAME").unwrap());

        drop(bulk_scan); // equivalent to Python's `del`

        let g_name_offset = instance.read_ulong(base_address + g_name_base.unwrap() + 3)?;
        let g_name_ptr = base_address + g_name_base.unwrap() + (g_name_offset as usize) + 7;
        match instance.read_ptr(g_name_ptr) {
            Ok(value) => instance.g_name_start_address = value,
            Err(e) => return Err(format!("Failed to read pointer: {}", e)),
        }

        let u_world_offset = match instance.read_ulong(base_address + instance.u_world_base + 3) {
            Ok(offset) => offset,
            Err(e) => {
                eprintln!("Error while reading u_world_offset: {}", e);
                return Err(format!("Failed to read u_world_offset: {}", e));
            }
        };

        let u_world = base_address + instance.u_world_base + (u_world_offset as usize) + 7;
        let world_address = match instance.read_ptr(u_world) {
            Ok(address) => address,
            Err(e) => {
                eprintln!("Error while reading world_address: {}", e);
                return Err(format!("Failed to read world_address: {}", e));
            }
        };

        instance.world_address = world_address;

        println!("gObject offset: {:x}", g_object_base.unwrap());
        println!("uWorld offset: {:x}", u_world_base.unwrap());
        println!("gName offset: {:x}", g_name_base.unwrap());

        Ok(instance)
    }

    pub(crate) fn read_bytes(&self, address: usize, bytes: usize) -> Result<Vec<u8>, String> {
        let mut buffer: Vec<u8> = vec![0; bytes];
        let mut read: usize = 0;
        let result = unsafe {
            ReadProcessMemory(
                self.handle,
                address as *const _,
                buffer.as_mut_ptr() as *mut _,
                bytes,
                &mut read as *mut _ as *mut _,
            )
        };
        if result == 0 {
            Err(format!("Failed to read memory at {:?}.", address))
        } else {
            Ok(buffer)
        }
    }

    fn read_memory_segment(&self, address: usize, size: usize) -> Result<Vec<u8>, String> {
        // Example: Reading in smaller chunks (e.g., 4KB at a time)
        const CHUNK_SIZE: usize = 4096;
        let mut buffer = Vec::with_capacity(size);
        let mut offset = 0;

        while offset < size {
            let chunk_size = std::cmp::min(CHUNK_SIZE, size - offset);
            match self.read_bytes(address + offset, chunk_size) {
                Ok(chunk) => {
                    buffer.extend_from_slice(&chunk);
                    offset += chunk_size;
                },
                Err(_) => break,
            }
        }

        Ok(buffer)
    }

    pub(crate) fn read_int(&self, address: usize) -> Result<i32, String> {
        let bytes = self.read_bytes(address, size_of::<i32>())?;
        let value = i32::from_le_bytes(bytes.try_into().expect("slice with incorrect length"));
        Ok(value)
    }

    fn read_float(&self, address: usize) -> Result<f32, String> {
        let bytes = self.read_bytes(address, size_of::<f32>())?;
        let value = f32::from_le_bytes(bytes.try_into().expect("slice with incorrect length"));
        Ok(value)
    }

    pub(crate) fn read_ulong(&self, address: usize) -> Result<u32, String> {
        let bytes = self.read_bytes(address, size_of::<u32>())?;
        let value = u32::from_le_bytes(bytes.try_into().expect("slice with incorrect length"));
        Ok(value)
    }

    pub(crate) fn read_ptr(&self, address: usize) -> Result<usize, String> {
        let bytes_result = self.read_bytes(address, size_of::<usize>());
        let bytes = match bytes_result {
            Ok(data) => data,
            Err(e) => return Err(format!("Failed to read bytes: {}", e)),
        };
        let value = usize::from_le_bytes(bytes.try_into().expect("slice with incorrect length"));
        Ok(value)
    }

    pub(crate) fn read_string(&self, address: usize, bytes: usize) -> Result<String, String> {
        let buffer = self.read_bytes(address, bytes)?;
        if let Some(end) = buffer.iter().position(|&b| b == 0) {
            let str_slice = &buffer[..end];
            Ok(String::from_utf8_lossy(str_slice).to_string())
        } else {
            Err("String not null-terminated".into())
        }
    }

    pub(crate) fn read_name_string(&self, address: usize, bytes: usize) -> Result<String, String> {
        let buffer = self.read_bytes(address, bytes)?;
        let i = buffer.windows(3).position(|window| window == [0, 0, 0]).unwrap_or(buffer.len());
        let shorter = &buffer[..i];

        let shorter_u16: Vec<u16> = shorter
            .chunks(2)
            .map(|chunk| {
                let bytes = [chunk[0], *chunk.get(1).unwrap_or(&0)];
                u16::from_le_bytes(bytes)
            })
            .collect();

        let joined = String::from_utf16(&shorter_u16)
            .unwrap_or_else(|_| String::from_utf8_lossy(shorter).into_owned())
            .trim_end_matches('\x00')
            .trim_end()
            .to_string();
        Ok(joined.replace('’', "'"))
    }

    pub(crate) unsafe fn read_gname(&self, actor_id: usize) -> Result<String, String> {
        let name_ptr_result = self.read_ptr(self.g_name_start_address + ((actor_id / 0x4000) * 0x8));
        match name_ptr_result {
            Err(_) => return Err("Failed to read name pointer.".into()),
            Ok(name_ptr) => {
                let name_result = self.read_ptr(name_ptr.checked_add(8 * (actor_id % 0x4000)).ok_or("Overflow")?);
                match name_result {
                    Err(_) => return Err("Failed to read name.".into()),
                    Ok(name) => {
                        let string_result = self.read_string(name + 16, 64);
                        match string_result {
                            Err(_) => Err("Failed to read string.".into()),
                            Ok(string) => Ok(string),
                        }
                    }
                }
            }
        }
    }
}

fn search_data_for_pattern(data: &[u8], pattern: &str) -> Option<usize> {
    let pattern_bytes = pattern.split_whitespace().map(|p| {
        if p == "?" {
            None
        } else {
            Some(u8::from_str_radix(p, 16).unwrap())
        }
    }).collect::<Vec<Option<u8>>>();

    'outer: for i in 0..data.len() {
        if i + pattern_bytes.len() > data.len() {
            break;
        }

        for (j, pattern_byte) in pattern_bytes.iter().enumerate() {
            match pattern_byte {
                Some(pb) => {
                    if data[i + j] != *pb {
                        continue 'outer;
                    }
                },
                None => continue,
            }
        }

        return Some(i);
    }

    None
}

fn get_base_address(pid: u32, exe_name: &str) -> Option<usize> {
    println!("Getting base address for {}", exe_name);
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
        if snapshot == winapi::um::handleapi::INVALID_HANDLE_VALUE {
            return None;
        }
        println!("Snapshot: {:?}", snapshot);

        let mut module_entry = MODULEENTRY32 {
            dwSize: size_of::<MODULEENTRY32>() as u32,
            th32ModuleID: 0,
            th32ProcessID: 0,
            GlblcntUsage: 0,
            ProccntUsage: 0,
            modBaseAddr: ptr::null_mut(),
            modBaseSize: 0,
            hModule: ptr::null_mut(),
            szModule: [0; MAX_MODULE_NAME32 + 1],
            szExePath: [0; MAX_PATH],
        };

        if Module32First(snapshot, &mut module_entry) == 1 {
            println!("Module32First: {:?}", module_entry.szModule.as_ptr());
            loop {
                let module_name_cstr = CStr::from_ptr(module_entry.szModule.as_ptr() as *const i8);
                let module_name = module_name_cstr.to_string_lossy().into_owned();

                if module_name.contains(exe_name) {
                    println!("Found module: {:?}", module_name);
                    CloseHandle(snapshot);
                    return Some(module_entry.modBaseAddr as usize);
                }
                if Module32Next(snapshot, &mut module_entry) != 1 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }
    None
}

fn read_patterns_from_file() -> Result<HashMap<String, String>, Error> {
    let file = File::open("./assets/conf/patterns.json").map_err(Error::io)?;
    let reader = BufReader::new(file);
    let patterns: HashMap<String, String> = serde_json::from_reader(reader)?;
    Ok(patterns)
}