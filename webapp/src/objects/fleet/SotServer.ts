import { Player, PlayerStates } from "@/objects/fleet/Player.ts";

export interface SotServer {
  ip: string;
  port: number;
  location: string;
  /**
   * Lowercase ISO 3166-1 alpha-2 of the server's region, resolved by the backend geolocation and
   * sent over the wire. Empty until it lands; drives the region flag in the session UI and the
   * in-game overlay (#671).
   */
  countryCode?: string;
  hash?: string;
  color: string;
  connectedPlayers: Player[];
}

export interface RustSotServer {
  ip: string;
  port: number;
  status: PlayerStates;
}
