import { Player, PlayerStates } from "@/objects/fleet/Player.ts";
import { RustSotServer } from "@/objects/fleet/SotServer.ts";

// The subset of Fleet behaviour the game-state sync drives. Kept as a structural
// interface so the flow can be unit-tested with a spy, without a live WebSocket.
export interface FleetActions {
  joinServer(): void;
  leaveServer(): void;
  updateToSession(): void;
}

/**
 * Applies one poll of the Rust game detector to the player and fleet: joins or leaves
 * the detected Sea of Thieves server and syncs the player's game status.
 *
 * Extracted from FleetMenuNavigator so the detection -> join/leave flow is testable in
 * isolation (issue #364 follow-up). Key invariants it encodes:
 *  - the server is (re)joined on the first detection and whenever the detected ip:port changes
 *    (the identity is the per-server session endpoint the Rust layer reports, ip AND port);
 *  - switching servers leaves the previous one FIRST, so the player is never left in two
 *    servers at once (no duplicate, no ghost in the old server);
 *  - InGame with an EMPTY ip means "in a game, identity not resolved yet": never join anything,
 *    and if a server was joined, leave it — the Rust layer only reports that state after a
 *    server change, so staying on the old card would falsely group the player;
 *  - going back to the menu leaves the server — but leaveServer is only called when a server is
 *    actually joined (a payload-less LEAVE_SERVER crashes the backend handler).
 */
export function syncGameState(
  rustSotServer: RustSotServer,
  player: Player,
  fleet: FleetActions,
): void {
  const isPlayerNewlyInGame =
    player.status != PlayerStates.IN_GAME &&
    rustSotServer.status == PlayerStates.IN_GAME;
  const isPlayerDisconnecting =
    player.status == PlayerStates.IN_GAME &&
    rustSotServer.status != PlayerStates.IN_GAME;
  const isServerDetectedOrChanged =
    player.status == PlayerStates.IN_GAME &&
    rustSotServer.ip != undefined &&
    rustSotServer.ip != "" &&
    (player.server?.ip != rustSotServer.ip ||
      player.server?.port != rustSotServer.port);
  // The detector switched to a new game whose identity is still resolving (ip empty while
  // InGame). The old server is certainly no longer ours: leave its card now instead of showing
  // a false grouping for the whole 10-60s resolution window.
  const isServerLostWhileInGame =
    player.status == PlayerStates.IN_GAME &&
    rustSotServer.status == PlayerStates.IN_GAME &&
    (rustSotServer.ip == undefined || rustSotServer.ip == "") &&
    player.server != undefined;

  if (isPlayerDisconnecting) {
    if (player.server != undefined) {
      fleet.leaveServer();
    }
    player.server = undefined;
    fleet.updateToSession();
  } else if (isServerLostWhileInGame) {
    fleet.leaveServer();
    player.server = undefined;
    fleet.updateToSession();
  } else if (
    (isPlayerNewlyInGame && rustSotServer.ip) ||
    isServerDetectedOrChanged
  ) {
    // Switching servers: leave the previous one first, otherwise the player ends up
    // in two servers at once — shown twice and left lingering in the old one.
    if (
      player.server != undefined &&
      (player.server.ip != rustSotServer.ip ||
        player.server.port != rustSotServer.port)
    ) {
      fleet.leaveServer();
    }
    player.server = {
      connectedPlayers: [],
      hash: undefined,
      ip: rustSotServer.ip,
      location: "",
      port: rustSotServer.port,
      color: "",
    };
    fleet.joinServer();
    fleet.updateToSession();
  }

  if (player.status != rustSotServer.status) {
    player.status = rustSotServer.status;
    fleet.updateToSession();
  }
}
