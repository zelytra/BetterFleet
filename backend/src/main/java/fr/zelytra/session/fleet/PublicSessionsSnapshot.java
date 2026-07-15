package fr.zelytra.session.fleet;

import java.util.List;

/**
 * What the public sessions browser renders in one payload: the listed sessions plus the global
 * connected-player count. They travel together so a single REST response — and, more importantly,
 * a single SSE frame — keeps both live: the counter has to move as players come and go, not only
 * when the user hits Refresh.
 *
 * @param sessions         the public (listed) sessions.
 * @param connectedPlayers players connected across every session, public and private alike.
 */
public record PublicSessionsSnapshot(List<PublicSession> sessions, int connectedPlayers) {
}
