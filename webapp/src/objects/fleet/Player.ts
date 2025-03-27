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

export interface Player extends Preferences {
  username: string;
  status: PlayerStates;
  isReady: boolean;
  isMaster: boolean;
  device: PlayerDevice;
  fleet?: Fleet;
  sessionId?: string;
  serverHostName?: string;
  countDown?: SessionRunner;
  server?: SotServer;
  clientVersion?: string;
}

export interface Preferences {
  lang?: string;
  soundEnable: boolean;
  soundLevel: number;
  macroEnable: boolean;
}

export interface ActionPlayer {
  username: string;
  sessionId: string;
}
