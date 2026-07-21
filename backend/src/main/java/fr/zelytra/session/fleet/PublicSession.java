package fr.zelytra.session.fleet;

import java.util.List;

/**
 * Read-only projection of a {@link Fleet} for the sessions directory (issue #599). Mirrors the
 * frontend `PublicSession` interface the browser renders.
 *
 * @param directoryId stable, unguessable identity for this row, unrelated to the join code — it is
 *                    what lets a private session (whose code is withheld) still be keyed and
 *                    animated in the list.
 * @param sessionId   the joinable session code — <b>empty for a private session</b>, whose code is
 *                    never published: holding that code is the whole difference between private and
 *                    public, so a private row is shown but cannot be joined from the browser.
 * @param region      ISO 3166-1 alpha-2 country code (lowercase) of the session owner's country,
 *                    from the master's browser locale (issue #672), or "" when unknown.
 * @param admin       usernames holding the master role.
 * @param name        the session's display name: the master's custom name (#604), or the
 *                    pirate-name seed as digits, which the client localizes.
 * @param playerAmount number of players in the session.
 * @param isPrivate   whether the session is private; the browser renders a closed padlock for it.
 * @param banner      the app-provided banner template index chosen by the host.
 */
public record PublicSession(
        String directoryId,
        String sessionId,
        String region,
        List<String> admin,
        String name,
        int playerAmount,
        boolean isPrivate,
        int banner
) {
}
