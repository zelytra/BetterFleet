package fr.zelytra.session.socket.security;

import java.util.Date;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class SocketSecurityEntity {

    /**
     * The minted-but-unconsumed tokens.
     * <p>
     * Genuinely concurrent: REST request threads write it (the register endpoints mint a token)
     * while WebSocket threads read and remove from it (a CONNECT consumes one). It was a plain
     * HashMap until #859 - two threads resizing one at the same time can lose entries or spin
     * forever, which is a hang, not a slowdown.
     */
    public static final Map<String, SocketSecurityEntity> websocketUser = new ConcurrentHashMap<>();

    private final String key;

    private final long validity;

    // Guest tokens (web console players, issue #682) are bound to the single session code they were
    // minted for, so that code is the real credential: the token opens that session and no other,
    // and never creates one. Null for the normal Keycloak-authenticated path.
    private final String boundSessionId;

    public SocketSecurityEntity() {
        this(null);
    }

    public SocketSecurityEntity(String boundSessionId) {
        this.validity = new Date().toInstant().plusSeconds(30).toEpochMilli();
        this.key = UUID.randomUUID().toString();
        this.boundSessionId = boundSessionId;
        websocketUser.put(this.key, this);
        // A token nobody ever connects with used to sit here for the life of the process: entries
        // were only removed when a CONNECT consumed them, so every abandoned registration leaked
        // (#859). Minting is the natural moment to sweep - it is the only event that grows the map.
        expire(System.currentTimeMillis());
    }

    /**
     * Drops every token whose validity has passed at {@code nowMillis}. Package-visible on the
     * class rather than hidden in a scheduler so the sweep is testable without waiting 30 seconds.
     */
    public static void expire(long nowMillis) {
        websocketUser.values().removeIf(token -> token.validity < nowMillis);
    }

    /** When this token stops being valid, as epoch millis. */
    public long getValidity() {
        return validity;
    }

    public boolean isValid() {
        return this.validity >= new Date().toInstant().toEpochMilli();
    }

    public String getKey() {
        return key;
    }

    /** True when this token is a session-bound guest token rather than an authenticated one. */
    public boolean isGuest() {
        return boundSessionId != null;
    }

    /** The session code a guest token is locked to, or null for an authenticated token. */
    public String getBoundSessionId() {
        return boundSessionId;
    }
}
