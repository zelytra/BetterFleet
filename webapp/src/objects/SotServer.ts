import {Player, PlayerStates} from "@/objects/Player.ts";

export interface SotServer {
  ip: string;
  port: number;
  location: string;
  hash?: string;
  connectedPlayers: Player[];
}

export interface RustSotServer {
  ip: string;
  port: number;
  status: PlayerStates;
}