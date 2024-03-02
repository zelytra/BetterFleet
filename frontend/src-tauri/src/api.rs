use std::time::Instant;

// Assuming these are your global variables in the `api` module
#[derive(Clone)]
pub struct Api {
    pub game_status: GameStatus,
    pub server_ip: String,
    pub server_port: u16,
    pub last_updated_server_ip: Instant
}

#[derive(PartialEq, Debug, Clone)]
pub enum GameStatus {
    Closed,
    Started,
    MainMenu,
    InGameNotLoaded,
    InGame,
    Unknown
}

impl Api {
    pub fn new() -> Self {
        Self {
            game_status: GameStatus::Unknown,
            server_ip: String::new(),
            server_port: 0,
            last_updated_server_ip: Instant::now()
        }
    }

    /**
    * This is the most accurate info you can get about what's going on.
    * It's updated AT LEAST every 5 seconds. (1-5 secs)
    * This information is prioritized over the others.
    */
    #[tauri::command]
    pub async fn get_game_status(&self) -> GameStatus {
        self.game_status.clone()
    }

    /**
    * Server IP, may be updated
    */
    #[tauri::command]
    pub async fn get_server_ip(&self) -> String {
        self.server_ip.clone()
    }

    #[tauri::command]

    pub async fn get_server_port(&self) -> u16 {
        self.server_port
    }

    #[tauri::command]

    pub async fn get_last_updated_server_ip(&self) -> Instant {
        self.last_updated_server_ip
    }
}

