package fr.zelytra.session.fleet;

import fr.zelytra.session.player.Player;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@QuarkusTest
public class FleetTest {

    @Inject
    Fleet fleet;

    @Test
    public void testGetReadyPlayers() {
        Player player1 = Mockito.mock(Player.class);
        Player player2 = Mockito.mock(Player.class);
        when(player1.isReady()).thenReturn(true);
        when(player2.isReady()).thenReturn(false);

        fleet.setPlayers(Arrays.asList(player1, player2));

        List<Player> readyPlayers = fleet.getReadyPlayers();
        assertEquals(1, readyPlayers.size());
        assertEquals(player1, readyPlayers.get(0));
    }

    @Test
    public void testGetMasters() {
        Player player1 = Mockito.mock(Player.class);
        Player player2 = Mockito.mock(Player.class);
        when(player1.isMaster()).thenReturn(true);
        when(player2.isMaster()).thenReturn(false);

        fleet.setPlayers(Arrays.asList(player1, player2));

        List<Player> masters = fleet.getMasters();
        assertEquals(1, masters.size());
        assertEquals(player1, masters.get(0));
    }

    @Test
    public void testGetPlayerFromUsername() {
        Player player1 = Mockito.mock(Player.class);
        Player player2 = Mockito.mock(Player.class);
        when(player1.getUsername()).thenReturn("player1");
        when(player2.getUsername()).thenReturn("player2");

        fleet.setPlayers(Arrays.asList(player1, player2));

        Player result = fleet.getPlayerFromUsername("player1");
        assertEquals(player1, result);

        result = fleet.getPlayerFromUsername("player3");
        assertNull(result);
    }

    /**
     * Regression test for issue #705.
     * <p>
     * {@code leaveSession} removes from {@code Fleet.players} while holding SessionManager's WRITE
     * lock, but that lock covers only SessionManager's own method bodies: CLEAR_STATUS and every
     * broadcast serialization iterate the very same list off-lock, on other event-loop threads. With
     * a plain {@link ArrayList} the two race into a {@link java.util.ConcurrentModificationException},
     * which aborted a socket's cleanup half-way and left a ghost player in the fleet.
     */
    @Test
    public void playersToleratesRemovalWhileBeingIterated() throws Exception {
        List<Player> initial = new ArrayList<>();
        for (int i = 0; i < 400; i++) {
            Player player = new Player();
            player.setUsername("player" + i);
            initial.add(player);
        }
        fleet.setPlayers(initial);

        AtomicReference<Throwable> failure = new AtomicReference<>();
        CountDownLatch start = new CountDownLatch(1);

        // Stands in for the CLEAR_STATUS sweep / Jackson writing the fleet out.
        Thread reader = new Thread(() -> {
            try {
                start.await();
                for (int round = 0; round < 300; round++) {
                    for (Player player : fleet.getPlayers()) {
                        player.isReady();
                    }
                }
            } catch (Throwable t) {
                failure.compareAndSet(null, t);
            }
        });

        // Stands in for leaveSession removing the disconnecting player.
        Thread remover = new Thread(() -> {
            try {
                start.await();
                for (Player player : initial) {
                    fleet.getPlayers().remove(player);
                }
            } catch (Throwable t) {
                failure.compareAndSet(null, t);
            }
        });

        reader.start();
        remover.start();
        start.countDown();
        reader.join(30_000);
        remover.join(30_000);

        assertNull(failure.get(), "iterating the players while one is removed must not throw");
        assertTrue(fleet.getPlayers().isEmpty(), "every player should have been removed");
    }
}

