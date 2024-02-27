use std::{env, fs::File};
use std::env::VarError;
use std::fmt::Error;
use http_req::request;
use zip::ZipArchive;

fn main() {
    tauri_build::build();

    #[cfg(target_os = "windows")]
    download_windows_npcap_sdk();
}

#[cfg(target_os = "windows")]
// https://github.com/imsnif/bandwhich/blob/5f5cc7ed609e8eff29ee0c580e60c468273bf171/build.rs#L40
fn download_windows_npcap_sdk() {
    use std::{
        env, fs,
        io::{self, Write},
        path::PathBuf,
    };

    println!("cargo:rerun-if-changed=build.rs");

    // get npcap SDK
    const NPCAP_SDK: &str = "npcap-sdk-1.13.zip";

    let npcap_sdk_download_url = format!("https://npcap.com/dist/{NPCAP_SDK}");
    let cache_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("Unable to look for cargo manifest dir"))
        .join("target");
    let npcap_sdk_cache_path = cache_dir.join(NPCAP_SDK);

    let npcap_zip = match fs::read(&npcap_sdk_cache_path) {
        // use cached
        Ok(zip_data) => {
            eprintln!("Found cached npcap SDK");
            zip_data
        }
        // download SDK
        Err(_) => {
            eprintln!("Downloading npcap SDK");

            // download
            let mut zip_data = vec![];
            let _res = request::get(npcap_sdk_download_url, &mut zip_data).expect("Failed to download npcap SDK");

            // write cache
            fs::create_dir_all(cache_dir).expect("Failed to create cache dir");
            let mut cache = File::create(npcap_sdk_cache_path).expect("Failed to create cache file");
            cache.write_all(&zip_data).expect("Failed to write cache file");

            zip_data
        }
    };

    // extract DLL
    let lib_path = if cfg!(target_arch = "aarch64") {
        "Lib/ARM64/Packet.lib"
    } else if cfg!(target_arch = "x86_64") {
        "Lib/x64/Packet.lib"
    } else if cfg!(target_arch = "x86") {
        "Lib/Packet.lib"
    } else {
        panic!("Unsupported target!")
    };
    let mut archive = ZipArchive::new(io::Cursor::new(npcap_zip)).expect("Failed to read zip");
    let mut npcap_lib = archive.by_name(lib_path).expect("Failed to find DLL in zip");

    // write DLL
    let lib_dir = PathBuf::from(env::var("OUT_DIR").expect("Unable to find OUT_DIR")).join("npcap_sdk");
    let lib_path = lib_dir.join("Packet.lib");
    fs::create_dir_all(&lib_dir).expect("Failed to create lib dir");
    let mut lib_file = fs::File::create(lib_path).expect("Failed to create lib file");
    io::copy(&mut npcap_lib, &mut lib_file).expect("Failed to write lib file");

    println!(
        "cargo:rustc-link-search=native={}",
        lib_dir
            .to_str().expect("Failed to convert path to string")
    );
}