package fr.zelytra.session.socket.security;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class SocketSecurityEntity {

    public static final Map<String, SocketSecurityEntity> websocketUser = new HashMap<>();

    private final String key;

    private final long validity;

    public SocketSecurityEntity() {
        this.validity = new Date().toInstant().plusSeconds(30).toEpochMilli();
        this.key = UUID.randomUUID().toString();
        websocketUser.put(this.key, this);
    }

    public boolean isValid() {
        return this.validity >= new Date().toInstant().toEpochMilli();
    }

    public String getKey() {
        return key;
    }
}
