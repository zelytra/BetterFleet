use pcap::{ConnectionStatus, Device};
use std::io::{BufRead, BufReader};
use std::sync::{Arc, Mutex};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use crate::network::network_tools::parse_packets;
use crate::network::network_tools::get_capture_result;

pub struct FetchServerIp {
    pub current_capture_id: Arc<Mutex<usize>>,
    pid: u32,
    pub server_ip: String,
    pub port: u16,
    is_running: bool,
}

impl FetchServerIp {
    pub fn new(pid: u32) -> Arc<Mutex<Self>> {
        let fetch_server_ip = Arc::new(Mutex::new(Self {
            current_capture_id: Arc::new(Mutex::new(0)),
            pid,
            server_ip: String::new(),
            port: 0,
            is_running: false,
        }));

        let fetch_server_ip_clone = Arc::clone(&fetch_server_ip);
        let fetch_server_ip_clone_for_thread = Arc::clone(&fetch_server_ip_clone);
        fetch_server_ip_clone.lock().unwrap().start_update_thread(fetch_server_ip_clone_for_thread);

        fetch_server_ip
    }

    pub fn update_server_ip(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let local_destination_port = self.get_dynamic_port_for_pid().ok_or("Failed to get the local destination port for PID")?;
    pub fn initialize_listeners(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        println!("Local destination port: {}", local_destination_port);

        // Get a list of all devices
        let devices = Device::list().map_err(|_| "Failed to get device list")?;

        //  TODO Find the device based on its status if it's connected by filtering out
        //  the devices that are not connected
        let device = devices.iter().find(|d|
            d.flags.connection_status == ConnectionStatus::Connected
                && d.flags.is_up()
                && d.flags.is_running()
                && !d.addresses.is_empty()).cloned();

        println!("Device: {:?}", device.clone().unwrap().desc);
        //println!("Flags: {:?}", device.as_ref().map(|d| d.flags));

        match device {
            Some(device) => {
                let (_device_name, cap_result) = get_capture_result(device);

                // Handle the cap_result Option
                let mut cap = cap_result.ok_or("Capture result not found")?;
                match cap.filter(&*format!("udp port {}", local_destination_port), true) {
                    Ok(_) => println!("Filter set successfully"),
                    Err(e) => eprintln!("Error while setting filter: {}", e),
                }

                let current_capture_id = self.current_capture_id.clone();
                thread::Builder::new()
                    .name("thread_parse_packets".to_string())
                    .spawn(move || {
                        parse_packets(
                            &current_capture_id,
                            cap,
                            local_destination_port
                        );
                    })
                    .unwrap();

                Ok(())
            },
            None => Err("Device not found".into()),
        }
    }

    fn get_dynamic_port_for_pid(&mut self) -> Option<u16> {
        let pid = self.pid;
        let exclude_port = 55761; // This seems to be always there for some reason
        let ps_script = format!(
            "Get-NetUDPEndpoint -OwningProcess {} | Select-Object -ExpandProperty LocalPort",
            pid
        );
        let output = Command::new("powershell")
            .args(&["-Command", &ps_script])
            .stdout(Stdio::piped())
            .spawn()
            .expect("Failed to start PowerShell command")
            .stdout
            .expect("Failed to open stdout");

        let reader = BufReader::new(output);

        for line in reader.lines().filter_map(|l| l.ok()) {
            if let Ok(port) = line.parse::<u16>() {
                if port != exclude_port {
                    return Some(port);
                }
            }
        }

        None
    }


    fn start_update_thread(&mut self, fetch_server_ip: Arc<Mutex<Self>>) {
        if self.is_running { return; }

        let fetch_server_ip = Arc::clone(&fetch_server_ip);
        thread::spawn(move || {
            //loop {
            // Lock the mutex before accessing FetchServerIp
            let mut fetch_server_ip = fetch_server_ip.lock().unwrap();

            // Update the server_ip field with the obtained IP address
            match fetch_server_ip.initialize_listeners() {
                Ok(_) => {
                    println!("Server IP: {}", fetch_server_ip.server_ip);
                }
                Err(e) => {
                    eprintln!("An error occurred while updating the server IP: {}", e);
                }
            };

            let duration = match fetch_server_ip.server_ip == "" {
                true => Duration::from_millis(1000),
                _ => Duration::from_secs(5),
            };

            // Sleep for a certain duration before the next update
            thread::sleep(duration);
            //}
        });
    }
}

