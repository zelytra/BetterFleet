//! Thin library face of the desktop app. Its one job is to re-export the Tauri-free capture crate
//! under the name the app has always used (`better_fleet::capture`), so the GUI modules and the
//! privilege-separated `betterfleet-netcap` helper share exactly one copy of the capture + ranking
//! code (#726). No Tauri-linked code belongs here: keeping this face empty of it is what lets the
//! helper depend on the capture crate without dragging Tauri along.

pub use better_fleet_netcap as capture;
