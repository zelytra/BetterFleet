import { Player, PlayerStates } from "@/objects/fleet/Player.ts";

export interface SotServer {
  ip: string;
  port: number;
  location: string;
  hash?: string;
  color: string;
  connectedPlayers: Player[];
}

export interface RustSotServer {
  ip: string;
  port: number;
  status: PlayerStates;
}
