import { describe, it, expect, vi } from "vitest";
import { syncGameState } from "@/objects/fleet/GameSync.ts";
import { Player, PlayerDevice, PlayerStates } from "@/objects/fleet/Player.ts";

// A spied stand-in for the Fleet — this is where WebSocket messages would be sent,
// so asserting these calls is the client-side equivalent of mocking the socket. The
// inferred vi.fn() shape is structurally compatible with FleetActions.
function spyFleet() {
  return {
    joinServer: vi.fn(),
    leaveServer: vi.fn(),
    updateToSession: vi.fn(),
  };
}

function playerAt(status: PlayerStates): Player {
  return {
    username: "Tester",
    status,
    isReady: false,
    isMaster: false,
    device: PlayerDevice.MICROSOFT,
    soundEnable: true,
    soundLevel: 30,
    macroEnable: true,
  } as Player;
}

// A "detected game object" as the Rust layer reports it via get_game_object.
function detected(status: PlayerStates, ip = "", port = 0) {
  return { status, ip, port };
}

const SERVER_A = {
  connectedPlayers: [],
  ip: "20.216.148.125",
  location: "",
  port: 30101,
  color: "",
};

describe("syncGameState (detection -> join/leave flow)", () => {
  it("joins the detected server when the player enters a game", () => {
    const fleet = spyFleet();
    const player = playerAt(PlayerStates.MAIN_MENU);

    syncGameState(
      detected(PlayerStates.IN_GAME, "20.216.148.125", 30101),
      player,
      fleet,
    );

    expect(fleet.joinServer).toHaveBeenCalledOnce();
    expect(fleet.leaveServer).not.toHaveBeenCalled();
    expect(player.server?.ip).toBe("20.216.148.125");
    expect(player.status).toBe(PlayerStates.IN_GAME);
  });

  it("leaves the old server BEFORE joining a new one when the server changes (no duplicate)", () => {
    const fleet = spyFleet();
    const player = playerAt(PlayerStates.IN_GAME);
    player.server = { ...SERVER_A };

    syncGameState(
      detected(PlayerStates.IN_GAME, "20.157.115.138", 31000),
      player,
      fleet,
    );

    expect(fleet.leaveServer).toHaveBeenCalledOnce();
    expect(fleet.joinServer).toHaveBeenCalledOnce();
    expect(fleet.leaveServer.mock.invocationCallOrder[0]).toBeLessThan(
      fleet.joinServer.mock.invocationCallOrder[0],
    );
    expect(player.server?.ip).toBe("20.157.115.138");
  });

  it("does nothing while the same server keeps being detected", () => {
    const fleet = spyFleet();
    const player = playerAt(PlayerStates.IN_GAME);
    player.server = { ...SERVER_A };

    syncGameState(
      detected(PlayerStates.IN_GAME, "20.216.148.125", 30101),
      player,
      fleet,
    );

    expect(fleet.joinServer).not.toHaveBeenCalled();
    expect(fleet.leaveServer).not.toHaveBeenCalled();
  });

  it("treats the same ip on a different port as a new server (ip:port identity)", () => {
    const fleet = spyFleet();
    const player = playerAt(PlayerStates.IN_GAME);
    player.server = { ...SERVER_A }; // 20.216.148.125:30101

    // Same session IP, different port: a different server (issue #364 cases E/F). The old identity
    // was IP-only and would have missed this; ip:port must see it as a server change.
    syncGameState(
      detected(PlayerStates.IN_GAME, "20.216.148.125", 39999),
      player,
      fleet,
    );

    expect(fleet.leaveServer).toHaveBeenCalledOnce();
    expect(fleet.joinServer).toHaveBeenCalledOnce();
    expect(fleet.leaveServer.mock.invocationCallOrder[0]).toBeLessThan(
      fleet.joinServer.mock.invocationCallOrder[0],
    );
    expect(player.server?.ip).toBe("20.216.148.125");
    expect(player.server?.port).toBe(39999);
  });

  it("leaves the server when the player returns to the menu", () => {
    const fleet = spyFleet();
    const player = playerAt(PlayerStates.IN_GAME);
    player.server = { ...SERVER_A };

    syncGameState(detected(PlayerStates.MAIN_MENU), player, fleet);

    expect(fleet.leaveServer).toHaveBeenCalledOnce();
    expect(fleet.joinServer).not.toHaveBeenCalled();
    expect(player.status).toBe(PlayerStates.MAIN_MENU);
  });

  it("does not join any server while still in the menu (no ip detected)", () => {
    const fleet = spyFleet();
    const player = playerAt(PlayerStates.MAIN_MENU);

    syncGameState(detected(PlayerStates.MAIN_MENU), player, fleet);

    expect(fleet.joinServer).not.toHaveBeenCalled();
    expect(fleet.leaveServer).not.toHaveBeenCalled();
    expect(player.server).toBeUndefined();
  });
});
