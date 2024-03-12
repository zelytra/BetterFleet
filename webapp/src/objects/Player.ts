import {SessionRunner} from "@/objects/SessionRunner.ts";
import {Fleet} from "@/objects/Fleet.ts";
import {SotServer} from "@/objects/SotServer.ts";

export enum PlayerStates {
  CLOSED = "CLOSED", // Game is closed
  STARTED = "STARTED", // Game detected an // Game is in first menu after launch / launching / stopping
  MAIN_MENU = "MAIN_MENU", // In menu to select game mode
  IN_GAME = "IN_GAME", // Status when the remote IP and port was found and player is in game
}

export interface Player extends Preferences {
  username: string;
  status: PlayerStates;
  isReady: boolean;
  isMaster: boolean;
  fleet?: Fleet;
  sessionId?: string;
  serverHostName?: string;
  countDown?: SessionRunner;
  server?: SotServer;
  clientVersion?:string
}

export interface Preferences {
  lang?: string;
}