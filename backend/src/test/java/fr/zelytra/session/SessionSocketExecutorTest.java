package fr.zelytra.session;

import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.concurrent.ExecutorService;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * JSR-356 instantiates one endpoint object PER CONNECTION - which is exactly why
 * {@code sessionTimeoutTasks} is static. Anything else that allocates an OS resource per instance
 * therefore allocates it per connection, and the two single-thread executors here were both
 * instance fields that nothing ever shut down: a non-daemon thread per connection, for the life of
 * the process (#859).
 * <p>
 * Rather than counting live threads (flaky under a shared test JVM), this pins the shape that
 * makes the leak impossible: an executor this class CONSTRUCTS must be static. An injected one is
 * exempt - the CDI container owns its lifecycle and hands out a shared instance.
 */
class SessionSocketExecutorTest {

    @Test
    void selfConstructedExecutorsAreSharedAcrossConnections() {
        for (Field field : SessionSocket.class.getDeclaredFields()) {
            if (!ExecutorService.class.isAssignableFrom(field.getType())) {
                continue;
            }
            if (field.isAnnotationPresent(Inject.class)) {
                continue; // container-managed: shared and shut down by CDI, not by this class
            }
            assertTrue(
                    Modifier.isStatic(field.getModifiers()),
                    "SessionSocket." + field.getName() + " is a self-constructed instance field, so "
                            + "JSR-356 gives every connection its own executor thread and nothing "
                            + "ever shuts it down - one leaked thread per connection");
        }
    }

    @Test
    void theEndpointStillOwnsExecutorsForTheRuleToBiteOn() {
        // Guards the test above from passing vacuously if the fields are ever renamed away.
        boolean found = false;
        for (Field field : SessionSocket.class.getDeclaredFields()) {
            if (ExecutorService.class.isAssignableFrom(field.getType())
                    && !field.isAnnotationPresent(Inject.class)) {
                found = true;
                break;
            }
        }
        if (!found) {
            fail("SessionSocket no longer constructs any ExecutorService: update this test");
        }
    }
}
