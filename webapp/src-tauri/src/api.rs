use std::time::Instant;
use serde::Serialize;

// This whole file is used to cache data from thread and expose it to the frontend.
#[derive(Clone)]
pub struct Api {
    pub game_status: GameStatus,
    pub server_ip: String,
    pub server_port: u16,
    pub last_updated_server_ip: Instant,
    pub main_menu_port: u16,
    pub port_count: i8
}

#[derive(PartialEq, Debug, Clone, Serialize)]
pub enum GameStatus {
    Closed, // Game is closed
    Started, // Game is in first menu after launch / launching / stopping
    MainMenu, // In menu to select game mode
    InGame, // Status when the remote IP and port was found and player is in game
    Unknown // Default / errored status, this should not be used
}

impl Api {
    pub fn new() -> Self {
        Self {
            game_status: GameStatus::Unknown,
            server_ip: String::new(),
            server_port: 0,
            last_updated_server_ip: Instant::now(),
            main_menu_port: 0,
            port_count: -1
        }
    }

    /**
    * This is the most accurate info you can get about what's going on.
    * It's updated AT LEAST every 5 seconds. (1-5 secs)
    * This information is prioritized over the others.
    */
    pub async fn get_game_status(&self) -> GameStatus {
        self.game_status.clone()
    }

    /**
    * Server IP, should only be used when GameStatus is InGame.
    */
    pub async fn get_server_ip(&self) -> String {
        self.server_ip.clone()
    }


    /**
    * Server port, should only be used when GameStatus is InGame.
    */
    pub async fn get_server_port(&self) -> u16 {
        self.server_port
    }

    /**
    * This corresponds to a timestamp of the last time the server IP was updated.
    * This may be used to check if the thread crashed / if something gones wrong.
    */
    pub async fn get_last_updated_server_ip(&self) -> Instant {
        self.last_updated_server_ip
    }
}

