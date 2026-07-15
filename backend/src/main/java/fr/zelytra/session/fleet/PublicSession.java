package fr.zelytra.session.fleet;

import java.util.List;

/**
 * Read-only projection of a public {@link Fleet} for the public sessions directory (issue #599).
 * Mirrors the frontend `PublicSession` interface the browser renders.
 *
 * @param sessionId   the joinable session code (public sessions are directly joinable from the browser).
 * @param region      ISO 3166-1 alpha-2 country code (lowercase) of the session's detected server,
 *                    or "" when no server has been detected yet.
 * @param admin       usernames holding the master role.
 * @param name        the session's display name (until #604 lands this is the localized pirate-name
 *                    seed, resolved client-side).
 * @param playerAmount number of players in the session.
 * @param isPrivate   always false in the public list; kept to match the frontend model.
 * @param banner      the app-provided banner template index chosen by the host.
 */
public record PublicSession(
        String sessionId,
        String region,
        List<String> admin,
        String name,
        int playerAmount,
        boolean isPrivate,
        int banner
) {
}
