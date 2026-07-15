import { PublicSession } from "@/objects/fleet/PublicSessions.ts";

export type SessionFilter = "all" | "public" | "private";

/**
 * Pure filter + search + sort over the public session list, kept free of any I/O so it can be
 * unit-tested in isolation. Keeps sessions matching the visibility filter whose name contains the
 * query (case-insensitive), busiest first so the most populated alliances surface at the top.
 */
export function applyFilter(
  sessions: PublicSession[],
  filter: SessionFilter,
  query: string,
): PublicSession[] {
  const needle = query.trim().toLowerCase();
  return sessions
    .filter((session) => {
      if (filter === "public") return !session.isPrivate;
      if (filter === "private") return session.isPrivate;
      return true;
    })
    .filter(
      (session) =>
        needle.length === 0 || session.name.toLowerCase().includes(needle),
    )
    .sort((a, b) => b.playerAmount - a.playerAmount);
}
