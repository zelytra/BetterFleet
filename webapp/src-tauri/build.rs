/// Stages `betterfleet-capture-service.exe` where the Windows resources map looks
/// (`tauri.windows.conf.json` -> `target/release/betterfleet-capture-service.exe`, a path
/// resolved relative to this directory).
///
/// It has to happen HERE, not in a before-command: `tauri_build` validates that the resource
/// exists while this script runs, which is before the outer cargo has built anything - so a
/// plain `cargo test` on Windows, `tauri dev`, `tauri build` and the cross build all panic on a
/// missing file unless this script produces it first. The service is built with its own target
/// dir because the outer cargo holds the lock on ours, and with the outer build's target triple
/// so a cross-compile stages a Windows exe (cargo-xwin configures the linker through the
/// environment, which the child cargo inherits).
fn stage_capture_service() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if !target.contains("windows") {
        // Linux ships its helper through the bundle `files` map, which is validated at bundle
        // time, after the workspace build - no staging needed.
        return;
    }
    // Restage whenever the service's sources change; without these lines the build script only
    // reruns on the tauri config triggers and would keep shipping a stale exe.
    println!("cargo:rerun-if-changed=netcap/src");
    println!("cargo:rerun-if-changed=netcap/Cargo.toml");

    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let stage_dir = manifest_dir.join("target").join("netcap-stage");
    let status = std::process::Command::new(&cargo)
        .args([
            "build",
            "--release",
            "-p",
            "better_fleet_netcap",
            "--bin",
            "betterfleet-capture-service",
            "--target",
            &target,
            "--target-dir",
        ])
        .arg(&stage_dir)
        .current_dir(&manifest_dir)
        .status()
        .expect("failed to spawn cargo to build betterfleet-capture-service");
    assert!(status.success(), "building betterfleet-capture-service failed");

    let built = stage_dir
        .join(&target)
        .join("release")
        .join("betterfleet-capture-service.exe");
    // The literal path the resources map names, whatever CARGO_TARGET_DIR says: resource sources
    // resolve against the tauri directory, not against cargo's actual target dir.
    let destination_dir = manifest_dir.join("target").join("release");
    std::fs::create_dir_all(&destination_dir).expect("failed to create target/release");
    std::fs::copy(&built, destination_dir.join("betterfleet-capture-service.exe"))
        .expect("failed to stage betterfleet-capture-service.exe");
}

fn main() {
    stage_capture_service();

    // De-elevated (#819, closing #732): the GUI runs asInvoker. The privileged capture lives in
    // the BetterFleetCapture service, reached over its named pipe; nothing else in the app ever
    // needed elevation. The old requireAdministrator manifest also made `cargo test` unable to
    // spawn its own harness (os error 740) behind a BETTERFLEET_TEST_BUILD escape hatch - both
    // are gone with the requirement. The manifest itself stays for the common-controls
    // dependency.
    let manifest = format!(
        r#"
    <assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
      <dependency>
        <dependentAssembly>
          <assemblyIdentity
            type="win32"
            name="Microsoft.Windows.Common-Controls"
            version="6.0.0.0"
            processorArchitecture="*"
            publicKeyToken="6595b64144ccf1df"
            language="*"
          />
        </dependentAssembly>
      </dependency>
      <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
        <security>
            <requestedPrivileges>
                <requestedExecutionLevel level="{level}" uiAccess="false" />
            </requestedPrivileges>
        </security>
      </trustInfo>
    </assembly>
    "#,
        level = "asInvoker"
    );

    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(&manifest);
    tauri_build::try_build(
      tauri_build::Attributes::new().windows_attributes(windows)
    ).expect("failed to run build script");
}
