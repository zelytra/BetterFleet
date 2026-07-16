import { PublicSession } from "@/objects/fleet/PublicSessions.ts";
import { sessionDisplayName } from "@/objects/fleet/PublicSessionName.ts";

export type SessionFilter = "all" | "public" | "private";

/**
 * Filter + search + sort over the session list. Keeps sessions matching the visibility filter whose
 * name contains the query (case-insensitive), busiest first so the most populated alliances surface
 * at the top.
 *
 * The search runs on the name as {@link sessionDisplayName} renders it, never on the raw field: a
 * default-named session carries a numeric seed there, so searching the raw field could only be
 * matched by typing a number the player never sees — which is why searching by name found nothing.
 * `displayName` is injectable so filtering and sorting stay testable without an i18n instance.
 */
export function applyFilter(
  sessions: PublicSession[],
  filter: SessionFilter,
  query: string,
  displayName: (session: PublicSession) => string = (session) =>
    sessionDisplayName(session),
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
        needle.length === 0 ||
        displayName(session).toLowerCase().includes(needle),
    )
    .sort((a, b) => b.playerAmount - a.playerAmount);
}
