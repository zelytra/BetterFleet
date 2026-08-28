package fr.zelytra.session.socket.security;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The token registry is written from REST request threads (the register endpoints mint a token)
 * and read plus removed from WebSocket threads (a CONNECT consumes it), so it is genuinely
 * concurrent - it was a plain HashMap until #859. A HashMap resized by two threads at once can
 * lose entries or spin forever; these tests fail that shape loudly rather than waiting for a
 * production hang.
 */
class SocketSecurityEntityTest {

    /** Mints tokens from many threads at once, as a burst of registrations does. */
    @Test
    void everyConcurrentlyMintedTokenIsRetrievable() throws Exception {
        int threads = 8;
        int perThread = 200;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Callable<List<String>>> minters = new ArrayList<>();
        for (int t = 0; t < threads; t++) {
            minters.add(() -> {
                List<String> keys = new ArrayList<>();
                for (int i = 0; i < perThread; i++) {
                    keys.add(new SocketSecurityEntity().getKey());
                }
                return keys;
            });
        }

        List<String> minted = new ArrayList<>();
        for (Future<List<String>> result : pool.invokeAll(minters)) {
            minted.addAll(result.get(30, TimeUnit.SECONDS));
        }
        pool.shutdownNow();

        assertEquals(threads * perThread, minted.size(), "every mint should return a key");
        for (String key : minted) {
            assertNotNull(
                    SocketSecurityEntity.websocketUser.get(key),
                    "a concurrently minted token vanished from the registry: " + key);
        }
    }

    /** Consumption races minting, exactly as a CONNECT racing a registration burst does. */
    @Test
    void consumingTokensWhileOthersAreMintedNeverCorruptsTheRegistry() throws Exception {
        List<String> existing = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            existing.add(new SocketSecurityEntity().getKey());
        }

        ExecutorService pool = Executors.newFixedThreadPool(4);
        Future<?> consumer = pool.submit(() -> {
            for (String key : existing) {
                SocketSecurityEntity.websocketUser.remove(key);
            }
        });
        Future<?> minter = pool.submit(() -> {
            for (int i = 0; i < 500; i++) {
                new SocketSecurityEntity();
            }
        });
        consumer.get(30, TimeUnit.SECONDS);
        minter.get(30, TimeUnit.SECONDS);
        pool.shutdownNow();

        for (String key : existing) {
            assertNull(
                    SocketSecurityEntity.websocketUser.get(key),
                    "a consumed token survived the race: " + key);
        }
    }

    /** Tokens are short-lived; an abandoned one must not sit in the map for the process's life. */
    @Test
    void expiredTokensAreSweptEvenWhenNobodyConsumesThem() {
        SocketSecurityEntity abandoned = new SocketSecurityEntity();
        String key = abandoned.getKey();
        assertNotNull(SocketSecurityEntity.websocketUser.get(key));

        SocketSecurityEntity.expire(abandoned.getValidity() + 1);

        assertNull(
                SocketSecurityEntity.websocketUser.get(key),
                "an abandoned token outlived its validity in the registry");
    }

    /** Sweeping must not take a token that is still usable. */
    @Test
    void sweepingKeepsTokensThatAreStillValid() {
        SocketSecurityEntity fresh = new SocketSecurityEntity();
        SocketSecurityEntity.expire(System.currentTimeMillis());
        assertNotNull(
                SocketSecurityEntity.websocketUser.get(fresh.getKey()),
                "a still-valid token was swept");
        assertTrue(fresh.isValid());
    }
}
