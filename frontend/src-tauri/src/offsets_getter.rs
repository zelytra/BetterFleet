use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use serde::Deserialize;
use serde_json::Error;

#[derive(Deserialize, Debug)]
pub struct Offsets {
    pub offsets: HashMap<String, u32>,
}

impl Offsets {
    pub fn new() -> Result<Self, Error> {
        let file = match File::open("./assets/conf/offsets.json") {
            Ok(file) => file,
            Err(e) => return Err(Error::io(e)),
        };
        let reader = BufReader::new(file);
        let offsets: HashMap<String, u32> = serde_json::from_reader(reader)?;
        Ok(Offsets { offsets })
    }

    pub fn get_offset(&self, key: &str) -> usize {
        self.offsets.get(key).map(|&v| v as usize).unwrap_or(0)
    }
}