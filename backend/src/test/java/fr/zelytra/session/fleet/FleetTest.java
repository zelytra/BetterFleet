package fr.zelytra.session.fleet;

import fr.zelytra.session.player.Player;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
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
}

