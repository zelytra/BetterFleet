package fr.zelytra.statistics;

import fr.zelytra.session.SessionManager;
import io.quarkus.logging.Log;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Path("/stats")
public class StatsEndpoints {

    @GET
    @Path("/online-users")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getTotalOnlineUsers() {
        Log.info("[GET] /stats/online-users");
        AtomicInteger totalUser = new AtomicInteger();
        SessionManager.getInstance().getSessions().forEach((key, value) -> {
            totalUser.addAndGet(value.getPlayers().size());
        });
        return Response.ok(totalUser.get()).build();
    }

    @GET
    @Path("/all")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getAllStats() {
        Log.info("[GET] /stats/all");
        StatisticsEntity totalStats = new StatisticsEntity();
        List<StatisticsEntity> statisticsEntityList = StatisticsEntity.listAll();
        for (StatisticsEntity entity : statisticsEntityList) {
            totalStats.setDownload(totalStats.getDownload() + entity.getDownload());
            totalStats.setSessionsOpen(totalStats.getSessionsOpen() + entity.getSessionsOpen());
            totalStats.setSessionTry(totalStats.getSessionTry() + entity.getSessionTry());
        }
        return Response.ok(totalStats).build();
    }

    @POST
    @Path("/download")
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    public Response addDownloadCount() {
        Log.info("[GET] /stats/download");
        StatisticsEntity foundStat = getEntity();
        foundStat.setDownload(foundStat.getDownload() + 1);
        return Response.ok(foundStat).build();
    }

    private StatisticsEntity getEntity() {
        StatisticsEntity entity = StatisticsEntity.findById(LocalDate.now());
        if (entity == null) {
            entity = new StatisticsEntity();
            entity.persist();
        }
        return entity;
    }
}
