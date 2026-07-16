import { PublicSession } from "@/objects/fleet/PublicSessions.ts";
import { tsi18n } from "@/objects/i18n";

/**
 * The name a player actually reads for a session.
 *
 * The backend sends either the master's custom name (#604) or the pirate-name seed as digits — it
 * cannot localize the default, since it doesn't know the client's language. Anything that deals in
 * the *visible* name has to resolve it through here: searching the raw field means a default-named
 * session is only findable by typing its seed number, which nobody can see.
 */
export function sessionDisplayName(
  session: PublicSession,
  translate: (key: string) => string = tsi18n.global.t,
): string {
  return /^\d+$/.test(session.name)
    ? translate("session.name." + session.name)
    : session.name;
}
