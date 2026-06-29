package fr.zelytra.session.socket.security;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class SocketSecurityEntity {

    public static final ConcurrentMap<String, SocketSecurityEntity> websocketUser = new ConcurrentHashMap<>();

    private final String key;

    private final long validity;

    public SocketSecurityEntity() {
        cleanupExpiredTokens();
        this.validity = Instant.now().plusSeconds(30).toEpochMilli();
        this.key = UUID.randomUUID().toString();
        websocketUser.put(this.key, this);
    }

    public static void cleanupExpiredTokens() {
        websocketUser.entrySet().removeIf(entry -> !entry.getValue().isValid());
    }

    public boolean isValid() {
        return this.validity >= Instant.now().toEpochMilli();
    }

    public String getKey() {
        return key;
    }
}
