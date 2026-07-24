import { describe, it, expect } from "vitest";
import {
  RECAP_DEBOUNCE_MS,
  RecapWatchdog,
  buildRecap,
  buildShareText,
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
  it("returns the server when everyone sits on one grouping", () => {
    const players = [player("a"), player("b"), player("c")];
    const s = server(["a", "b", "c"], "fr");
    expect(convergedServer(players, serversOf(s))).toBe(s);
  });

  it("is null when a player is still ungrouped", () => {
    const players = [player("a"), player("b"), player("c")];
    // The server holds only two of the three.
    expect(convergedServer(players, serversOf(server(["a", "b"])))).toBeNull();
  });

  it("is null when the fleet is split across two servers", () => {
    const players = [player("a"), player("b")];
    const split = serversOf(server(["a"]), server(["b"]));
    expect(convergedServer(players, split)).toBeNull();
  });

  it("ignores empty groupings and converges on the single populated one", () => {
    const players = [player("a"), player("b")];
    const withEmpty = serversOf(server([]), server(["a", "b"], "us"));
    expect(convergedServer(players, withEmpty)?.countryCode).toBe("us");
  });

  it("is null with no players or no servers", () => {
    expect(convergedServer([], serversOf(server(["a"])))).toBeNull();
    expect(convergedServer([player("a")], serversOf())).toBeNull();
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
  it("snapshots tries, head count, duration and region", () => {
    const fleet = {
      stats: { tryAmount: 3 },
      players: [player("a"), player("b")],
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

describe("buildShareText", () => {
  it("passes aggregate params and a spaced flag into the share key", () => {
    const seen: Record<string, unknown> = {};
    const t = (key: string, params?: Record<string, unknown>) => {
      Object.assign(seen, { key, ...params });
      return key;
    };
    buildShareText(
      { tries: 2, players: 12, durationMs: 165_000, countryCode: "fr" },
      t,
    );
    expect(seen).toMatchObject({
      key: "session.recap.share",
      players: 12,
      tries: 2,
      duration: "2:45",
      region: " 🇫🇷",
    });
  });

  it("leaves the region blank when the flag is unknown", () => {
    let region: unknown = "unset";
    const t = (_key: string, params?: Record<string, unknown>) => {
      region = params?.region;
      return "";
    };
    buildShareText({ tries: 1, players: 4, durationMs: 1_000 }, t);
    expect(region).toBe("");
  });
});
