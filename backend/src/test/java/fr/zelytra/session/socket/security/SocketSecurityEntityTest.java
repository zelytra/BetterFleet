package fr.zelytra.session.socket.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.*;

class SocketSecurityEntityTest {

    @BeforeEach
    void clearTokens() {
        SocketSecurityEntity.websocketUser.clear();
    }

    @Test
    void newTokenIsValid() {
        SocketSecurityEntity entity = new SocketSecurityEntity();
        assertTrue(entity.isValid());
        assertTrue(SocketSecurityEntity.websocketUser.containsKey(entity.getKey()));
    }

    @Test
    void cleanupExpiredTokensRemovesInvalidEntries() throws Exception {
        SocketSecurityEntity entity = new SocketSecurityEntity();
        SocketSecurityEntity expired = new SocketSecurityEntity();
        SocketSecurityEntity.websocketUser.remove(expired.getKey());

        Field validityField = SocketSecurityEntity.class.getDeclaredField("validity");
        validityField.setAccessible(true);
        validityField.set(expired, 0L);
        SocketSecurityEntity.websocketUser.put(expired.getKey(), expired);

        SocketSecurityEntity.cleanupExpiredTokens();

        assertTrue(SocketSecurityEntity.websocketUser.containsKey(entity.getKey()));
        assertFalse(SocketSecurityEntity.websocketUser.containsKey(expired.getKey()));
    }
}
