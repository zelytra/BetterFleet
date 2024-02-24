use std::process::Command;
use std::str;

pub(crate) struct ProcessFinder;

impl ProcessFinder {
    pub fn find_pid_of(process_name: &str) -> Vec<String> {
        let output = Command::new("tasklist")
            .args(&["/FI", &format!("IMAGENAME eq {}", process_name)])
            .output()
            .expect("Failed to execute command");

        let output_str = String::from_utf8_lossy(&output.stdout);

        let mut pids = Vec::new();
        for line in output_str.lines() {
            if line.contains(process_name) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() > 1 {
                    pids.push(parts[1].to_string());
                }
            }
        }

        println!("Parsed PIDs: {:?}", pids);

        pids
    }
}