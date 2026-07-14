fn main() {
    // The shipped binary must run elevated: capturing packets via raw promiscuous sockets
    // (SIO_RCVALL) requires administrator rights. Test builds, however, only exercise pure
    // logic and must be launchable without elevation, otherwise `cargo test` fails to spawn
    // its harness (os error 740). Setting BETTERFLEET_TEST_BUILD=1 drops the requirement to
    // `asInvoker`; normal and release builds are unaffected and keep requiring administrator.
    println!("cargo:rerun-if-env-changed=BETTERFLEET_TEST_BUILD");
    let execution_level = if std::env::var("BETTERFLEET_TEST_BUILD").is_ok() {
        "asInvoker"
    } else {
        "requireAdministrator"
    };

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
                <requestedExecutionLevel level="{execution_level}" uiAccess="false" />
            </requestedPrivileges>
        </security>
      </trustInfo>
    </assembly>
    "#
    );

    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(&manifest);
    tauri_build::try_build(
      tauri_build::Attributes::new().windows_attributes(windows)
    ).expect("failed to run build script");
}
