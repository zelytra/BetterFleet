use std::str;
use sysinfo::{System};

pub(crate) struct ProcessFinder;

impl ProcessFinder {
    pub fn find_pid_of(process_name: &str) -> Vec<String> {
        let mut system = System::new_all();
        let mut pids = Vec::new();
        system.refresh_all();

        for (pid, process) in system.processes() {
            if process.name().to_lowercase() == process_name.to_lowercase() {
                println!("Found process: {} with PID: {}", process_name, pid);
                pids.push(pid.to_string());
            }
        }

        pids
    }
}