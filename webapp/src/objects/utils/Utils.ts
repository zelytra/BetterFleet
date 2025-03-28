import { PlayerStates } from "@/objects/fleet/Player.ts";

export abstract class Utils {
  public static generateRandomColor(): string {
    // Generate random color components
    const r = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
    const g = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
    const b = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");

    // Append '80' to the hex value for 50% opacity
    const opacity = "80";

    return `#${r}${g}${b}${opacity}`;
  }

  public static parseRustPlayerStatus(status: string): PlayerStates {
    switch (status.toString().toLowerCase()) {
      case "closed":
        return PlayerStates.CLOSED;
      case "started":
        return PlayerStates.STARTED;
      case "mainmenu":
        return PlayerStates.MAIN_MENU;
      case "ingame":
        return PlayerStates.IN_GAME;
      default:
        return PlayerStates.CLOSED;
    }
  }
}
