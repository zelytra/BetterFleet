package fr.zelytra.session.socket.security;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class SocketSecurityEntity {

    public static final Map<String, SocketSecurityEntity> websocketUser = new HashMap<>();

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
