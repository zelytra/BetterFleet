import { Fleet } from "@/objects/fleet/Fleet.ts";
import { Player, PlayerDevice, PlayerStates } from "@/objects/fleet/Player.ts";

export function getStressTestFleet(): Fleet {
  const fleet: Fleet = new Fleet();
  const players: Player[] = [
    {
      username: "Player 1",
      status: PlayerStates.CLOSED,
      isReady: false,
      isMaster: true,
      device: PlayerDevice.MICROSOFT,
      soundEnable: true,
      soundLevel: 1,
      macroEnable: true,
    },
    {
      username: "Player 2",
      status: PlayerStates.IN_GAME,
      isReady: false,
      isMaster: true,
      device: PlayerDevice.XBOX,
      soundEnable: true,
      soundLevel: 1,
      macroEnable: true,
    },
    {
      username: "Player 3",
      status: PlayerStates.STARTED,
      isReady: false,
      isMaster: true,
      device: PlayerDevice.PLAYSTATION,
      soundEnable: true,
      soundLevel: 1,
      macroEnable: true,
    },
    {
      username: "Player 4",
      status: PlayerStates.STARTED,
      isReady: false,
      isMaster: true,
      device: PlayerDevice.PLAYSTATION,
      soundEnable: true,
      soundLevel: 1,
      macroEnable: true,
    },
    {
      username: "Player 5",
      status: PlayerStates.STARTED,
      isReady: false,
      isMaster: true,
      device: PlayerDevice.PLAYSTATION,
      soundEnable: true,
      soundLevel: 1,
      macroEnable: true,
    },
  ];

  fleet.sessionId = "123456";
  fleet.players = players;

  fleet.servers.set("A", {
    color: "#FFFF",
    ip: "1.1.1.1",
    port: 1,
    connectedPlayers: [players[0]],
    location: "Porto Rico",
    hash: "#ABCDEF",
  });
  fleet.servers.set("B", {
    color: "#FFFFF",
    ip: "1.1.1.1",
    port: 1,
    connectedPlayers: players,
    location: "La casa",
    hash: "#ABCDEF",
  });
  fleet.servers.set("C", {
    color: "#FFFF",
    ip: "1.1.1.1",
    port: 1,
    connectedPlayers: [players[1], players[0]],
    location: "Porto Rico",
    hash: "#ABCDEF",
  });

  return fleet;
}
