import { describe, it, expect } from "vitest";
import {
  RECAP_DEBOUNCE_MS,
  RecapWatchdog,
  buildRecap,
  convergedServer,
  countryFlagEmoji,
  formatClock,
} from "@/objects/fleet/SessionRecap.ts";
import type { Player } from "@/objects/fleet/Player.ts";
import type { SotServer } from "@/objects/fleet/SotServer.ts";
import type { Fleet } from "@/objects/fleet/Fleet.ts";

const player = (username: string): Player => ({ username }) as Player;
const server = (players: string[], countryCode?: string): SotServer =>
  ({
    connectedPlayers: players.map(player),
    countryCode,
  }) as SotServer;
const serversOf = (...list: SotServer[]): Map<string, SotServer> =>
  new Map(list.map((s, i) => [String(i), s]));

describe("convergedServer", () => {
  it("returns the server when two or more players share it", () => {
    const s = server(["a", "b", "c"], "fr");
    expect(convergedServer(serversOf(s))).toBe(s);
  });

  it("is null for a lone player on a server (no solo alliance)", () => {
    expect(convergedServer(serversOf(server(["a"])))).toBeNull();
  });

  it("still converges while a third player is detecting", () => {
    // Two share the server; the third is on no server yet — the alliance is formed all the same.
    const withEmpty = serversOf(server([]), server(["a", "b"], "us"));
    expect(convergedServer(withEmpty)?.countryCode).toBe("us");
  });

  it("picks the biggest group when the fleet is split across servers", () => {
    // Three on one server, two on another: alliances formed on both; the card celebrates the larger.
    const big = server(["a", "b", "c"], "fr");
    const small = server(["d", "e"], "us");
    expect(convergedServer(serversOf(small, big))).toBe(big);
  });

  it("is null when players are scattered one per server", () => {
    const scattered = serversOf(server(["a"]), server(["b"]));
    expect(convergedServer(scattered)).toBeNull();
  });

  it("is null with no populated server", () => {
    expect(convergedServer(serversOf())).toBeNull();
    expect(convergedServer(serversOf(server([])))).toBeNull();
  });
});

describe("RecapWatchdog", () => {
  const T0 = 1_000_000;

  it("fires once, only after convergence holds for the debounce", () => {
    const w = new RecapWatchdog();
    expect(w.observe(true, false, T0)).toBe(false);
    expect(w.observe(true, false, T0 + RECAP_DEBOUNCE_MS - 1)).toBe(false);
    expect(w.observe(true, false, T0 + RECAP_DEBOUNCE_MS)).toBe(true);
    // Convergence continuing must not pop the card again.
    expect(w.observe(true, false, T0 + RECAP_DEBOUNCE_MS + 10_000)).toBe(false);
  });

  it("holds during a countdown, then fires once it ends", () => {
    const w = new RecapWatchdog();
    w.observe(true, false, T0);
    // A countdown runs right at the threshold: suppressed, but the clock is kept.
    expect(w.observe(true, true, T0 + RECAP_DEBOUNCE_MS)).toBe(false);
    expect(w.observe(true, false, T0 + RECAP_DEBOUNCE_MS + 1)).toBe(true);
  });

  it("re-arms for the next convergence after the alliance breaks up", () => {
    const w = new RecapWatchdog();
    expect(w.observe(true, false, T0)).toBe(false);
    expect(w.observe(true, false, T0 + RECAP_DEBOUNCE_MS)).toBe(true);
    // Lost convergence resets the guard and the clock.
    w.observe(false, false, T0 + RECAP_DEBOUNCE_MS + 1_000);
    expect(w.observe(true, false, T0 + RECAP_DEBOUNCE_MS + 2_000)).toBe(false);
    expect(
      w.observe(
        true,
        false,
        T0 + RECAP_DEBOUNCE_MS + 2_000 + RECAP_DEBOUNCE_MS,
      ),
    ).toBe(true);
  });
});

describe("buildRecap", () => {
  it("snapshots tries, the converged-server head count, duration and region", () => {
    const fleet = {
      stats: { tryAmount: 3 },
      // Three in the fleet, but only two landed on the server — the third is still detecting.
      players: [player("a"), player("b"), player("c")],
    } as unknown as Fleet;
    const recap = buildRecap(fleet, server(["a", "b"], "fr"), 1_000, 121_000);
    expect(recap).toEqual({
      tries: 3,
      players: 2,
      durationMs: 120_000,
      countryCode: "fr",
    });
  });

  it("never reports a negative duration and drops an unresolved region", () => {
    const fleet = { stats: { tryAmount: 0 }, players: [] } as unknown as Fleet;
    const recap = buildRecap(fleet, server([], ""), 5_000, 1_000);
    expect(recap.durationMs).toBe(0);
    expect(recap.countryCode).toBeUndefined();
  });
});

describe("formatClock", () => {
  it("renders M:SS with a zero-padded seconds field", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(38_000)).toBe("0:38");
    expect(formatClock(165_000)).toBe("2:45");
    expect(formatClock(-10)).toBe("0:00");
  });
});

describe("countryFlagEmoji", () => {
  it("maps an ISO code to its regional-indicator flag", () => {
    expect(countryFlagEmoji("fr")).toBe("🇫🇷");
    expect(countryFlagEmoji("US")).toBe("🇺🇸");
  });

  it("returns empty for missing or malformed codes", () => {
    expect(countryFlagEmoji(undefined)).toBe("");
    expect(countryFlagEmoji("f")).toBe("");
    expect(countryFlagEmoji("fra")).toBe("");
    expect(countryFlagEmoji("f1")).toBe("");
  });
});
