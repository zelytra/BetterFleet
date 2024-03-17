package fr.zelytra.session.fleet;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class FleetStatsTest {

    @Test
    public void testAddTry() {
        FleetStats stats = new FleetStats(1, 50);
        stats.addTry();
        assertEquals(2, stats.getTryAmount());
    }

    @Test
    public void testSetTryAmount() {
        FleetStats stats = new FleetStats(1, 50);
        stats.setTryAmount(10);
        assertEquals(10, stats.getTryAmount());
    }

    @Test
    public void testSetSuccessPrediction() {
        FleetStats stats = new FleetStats(1, 50);
        stats.setSuccessPrediction(75);
        assertEquals(75, stats.getSuccessPrediction());
    }
}