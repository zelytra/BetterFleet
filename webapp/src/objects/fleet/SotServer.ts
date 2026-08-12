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
  /**
   * Consecutive detection cycles with the game process alive but its UDP enumeration empty (#801).
   * A count that keeps rising means the game exposes no UDP sockets to enumeration; the
   * socketless watchdog turns that into the #688 diagnostic offer (cause deliberately not asserted). Optional: older payloads (and most test stubs) simply omit it.
   */
  noUdpCycles?: number;
}
