import { SessionRunner } from "@/objects/fleet/SessionRunner.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { SotServer } from "@/objects/fleet/SotServer.ts";

export enum PlayerStates {
  CLOSED = "CLOSED", // Game is closed
  STARTED = "STARTED", // Game detected an // Game is in first menu after launch / launching / stopping
  MAIN_MENU = "MAIN_MENU", // In menu to select game mode
  IN_GAME = "IN_GAME", // Status when the remote IP and port was found and player is in game
}

export enum PlayerDevice {
  XBOX = "XBOX",
  MICROSOFT = "MICROSOFT",
  PLAYSTATION = "PLAYSTATION",
}

export enum BoatSize {
  NONE = "NONE",
  SLOOP = "SLOOP",
  BRIGANTINE = "BRIGANTINE",
  GALLEON = "GALLEON",
}

export interface Player extends Preferences {
  username: string;
  status: PlayerStates;
  isReady: boolean;
  isMaster: boolean;
  device: PlayerDevice;
  boatSize: BoatSize;
  fleet?: Fleet;
  sessionId?: string;
  serverHostName?: string;
  countDown?: SessionRunner;
  server?: SotServer;
  clientVersion?: string;
}

export interface Preferences {
  lang?: string;
  /** Lowercase ISO 3166-1 alpha-2 country from the browser locale — the owner flag in the public browser (#672). */
  country?: string;
  soundEnable: boolean;
  soundLevel: number;
  macroEnable: boolean;
  /**
   * The app-provided banner template this player's hosted sessions carry (issue #602). Travels on
   * CONNECT: the backend copies it onto the session they create, and ignores it from everyone who
   * merely joins.
   */
  banner: number;
  /** When set, each hosted session gets a random template instead of the fixed pick above. */
  bannerShuffle: boolean;
  /**
   * Whether this player contributes to the anonymous alliance statistics (issue #673). Opt-out —
   * defaults to true. Travels on CONNECT like every preference; the backend skips recording a
   * session's attempts when one of its masters turned this off.
   */
  shareStats: boolean;
  /**
   * Discord Rich Presence (issue #684). Optional: absent means enabled; only an explicit false
   * turns it off. Purely client-side — the presence talks to the local Discord over Rust.
   */
  richPresence?: boolean;
  /**
   * The overlay-toggle accelerator, in Tauri syntax (issue #687). Optional: absent means the
   * built-in default (CommandOrControl+Shift+O). Registration itself lives in Rust.
   */
  overlayHotkey?: string;
}

export interface ActionPlayer {
  username: string;
  sessionId: string;
}
