package fr.zelytra.statistics;

import fr.zelytra.session.SessionManager;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@QuarkusTest
public class StatsEndpointsTest {

    @InjectMock
    StatisticsRepository statisticsRepository;

    @InjectMock
    SessionManager sessionManager;

    @Inject
    StatsEndpoints statsEndpoints;

    @BeforeEach
    public void setup() {
        ConcurrentHashMap<String, Fleet> fleetConcurrentHashMap = new ConcurrentHashMap<>();
        Fleet fleet = new Fleet();
        fleet.getPlayers().add(new Player());
        fleet.getPlayers().add(new Player());
        fleetConcurrentHashMap.put("1", fleet);
        fleetConcurrentHashMap.put("2", fleet);
        fleetConcurrentHashMap.put("3", fleet);

        when(sessionManager.getSessions()).thenReturn(fleetConcurrentHashMap);
    }


    @Test
    public void getTotalOnlineUsersTest() {
        Response response = statsEndpoints.getTotalOnlineUsers();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(6, response.getEntity());
    }

    @Test
    public void getAllStatsTest() {
        StatisticsEntity stat1 = new StatisticsEntity();
        stat1.setDownload(10);
        stat1.setSessionsOpen(5);
        stat1.setSessionTry(20);

        StatisticsEntity stat2 = new StatisticsEntity();
        stat2.setDownload(10);
        stat2.setSessionsOpen(5);
        stat2.setSessionTry(20);

        List<StatisticsEntity> statsList = List.of(stat1, stat2);
        when(statisticsRepository.listAll()).thenReturn(statsList);

        Response response = statsEndpoints.getAllStats();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        StatisticsEntity totalStats = (StatisticsEntity) response.getEntity();
        assertEquals(20, totalStats.getDownload());
        assertEquals(10, totalStats.getSessionsOpen());
        assertEquals(40, totalStats.getSessionTry());
    }

    @Test
    public void addDownloadCountTest() {
        StatisticsEntity stat = new StatisticsEntity();
        stat.setDownload(0);
        when(statisticsRepository.getEntity()).thenReturn(stat);

        Response response = statsEndpoints.addDownloadCount();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(1, stat.getDownload());
    }
}
