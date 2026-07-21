package fr.zelytra.statistics;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only, anonymous aggregations over {@link AllianceAttempt} for the public statistics
 * dashboard (issue #673). Streams the rows and groups them in memory — fine at this volume; move
 * to SQL GROUP BY if the table ever grows large. Never exposes a raw row, only aggregates.
 */
@Path("/stats")
public class AllianceStatsEndpoints {

    // A cell/region needs at least this many attempts before its rate is trusted in the UI (#673 §6).
    private static final long MIN_SAMPLE = 30;

    @Inject
    AllianceAttemptRepository repository;

    /** One (day-of-week 1-7, hour 0-23 UTC) cell of the convergence heatmap. */
    public record HeatCell(int dayOfWeek, int hour, long attempts, long converged, double rate) {
    }

    /** The full alliance-analytics payload the dashboard renders. */
    public record AllianceStats(long totalAttempts, long converged, double convergenceRate,
                                double averageTries, List<HeatCell> heatmap,
                                List<Integer> bestHours, long minSample) {
    }

    /** Owner-region attempt counts for the globe. */
    public record RegionCount(String region, long attempts) {
    }

    @GET
    @Path("/alliance")
    @Produces(MediaType.APPLICATION_JSON)
    public Response alliance(@QueryParam("ownerRegion") String ownerRegion,
                             @QueryParam("serverRegion") String serverRegion) {
        List<AllianceAttempt> rows = repository.listAll().stream()
                .filter(a -> blankOrEquals(ownerRegion, a.ownerRegion))
                .filter(a -> blankOrEquals(serverRegion, a.serverRegion))
                .toList();

        long total = rows.size();
        long converged = rows.stream().filter(a -> a.converged).count();
        double rate = total == 0 ? 0 : (double) converged / total;
        double avgTries = rows.stream().mapToInt(a -> a.tryNumber).average().orElse(0);

        // Group by (day-of-week, hour) in UTC — [attempts, converged] per cell and per hour.
        Map<String, long[]> cells = new LinkedHashMap<>();
        Map<Integer, long[]> byHour = new LinkedHashMap<>();
        for (AllianceAttempt a : rows) {
            ZonedDateTime t = a.tsUtc.atZone(ZoneOffset.UTC);
            int dow = t.getDayOfWeek().getValue();
            int hour = t.getHour();
            long[] cell = cells.computeIfAbsent(dow + "-" + hour, k -> new long[2]);
            cell[0]++;
            if (a.converged) cell[1]++;
            long[] h = byHour.computeIfAbsent(hour, k -> new long[2]);
            h[0]++;
            if (a.converged) h[1]++;
        }

        List<HeatCell> heatmap = new ArrayList<>();
        cells.forEach((key, cell) -> {
            String[] parts = key.split("-");
            double cellRate = cell[0] == 0 ? 0 : (double) cell[1] / cell[0];
            heatmap.add(new HeatCell(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]),
                    cell[0], cell[1], cellRate));
        });

        // Best hours: the hours with the highest convergence rate, among those with enough samples.
        double bestRate = byHour.values().stream()
                .filter(c -> c[0] >= MIN_SAMPLE)
                .mapToDouble(c -> (double) c[1] / c[0])
                .max().orElse(-1);
        List<Integer> bestHours = new ArrayList<>();
        if (bestRate >= 0) {
            byHour.forEach((hour, c) -> {
                if (c[0] >= MIN_SAMPLE && (double) c[1] / c[0] >= bestRate - 1e-9) {
                    bestHours.add(hour);
                }
            });
            bestHours.sort(Integer::compareTo);
        }

        return Response.ok(new AllianceStats(total, converged, rate, avgTries, heatmap, bestHours, MIN_SAMPLE)).build();
    }

    @GET
    @Path("/regions")
    @Produces(MediaType.APPLICATION_JSON)
    public Response regions() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (AllianceAttempt a : repository.listAll()) {
            if (a.ownerRegion == null || a.ownerRegion.isBlank()) continue;
            counts.merge(a.ownerRegion.toLowerCase(), 1L, Long::sum);
        }
        List<RegionCount> out = new ArrayList<>();
        counts.forEach((region, n) -> out.add(new RegionCount(region, n)));
        out.sort((x, y) -> Long.compare(y.attempts(), x.attempts()));
        return Response.ok(out).build();
    }

    private static boolean blankOrEquals(String filter, String value) {
        return filter == null || filter.isBlank() || filter.equalsIgnoreCase(value);
    }
}
