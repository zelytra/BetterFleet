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

    /**
     * The most ships a crew can realistically gather on one server. A Sea of Thieves server holds 5-6
     * ships, and during a search every player sails alone on their own boat — so this is also the most
     * players a search can ever land together, however many are looking (issue #720).
     */
    private static final int SHIPS_PER_SERVER = 5;

    @Inject
    AllianceAttemptRepository repository;

    /** One (day-of-week 1-7, hour 0-23 UTC) cell of the convergence heatmap. */
    public record HeatCell(int dayOfWeek, int hour, long attempts, long converged, double rate) {
    }

    /**
     * One search-size band. Sizes are not comparable on convergence alone: the criterion is "two
     * ships met", which a big search clears far more easily than a duo — it has more boats in the
     * draw — while a big search is usually after five, not two (issue #720). Split them so each band
     * can be read on its own terms.
     */
    public record SizeBand(String band, long attempts, long converged, double convergenceRate,
                           double goalCompletion) {
    }

    /** The full alliance-analytics payload the dashboard renders. */
    public record AllianceStats(long totalAttempts, long converged, double convergenceRate,
                                double goalCompletion, double averageTries, List<HeatCell> heatmap,
                                List<Integer> bestHours, long minSample, List<SizeBand> bySize) {
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
        double goalCompletion = averageGoalCompletion(rows);
        List<SizeBand> bySize = bandBreakdown(rows);

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

        return Response.ok(new AllianceStats(total, converged, rate, goalCompletion, avgTries,
                heatmap, bestHours, MIN_SAMPLE, bySize)).build();
    }

    /**
     * How much of what a search was after it actually got, averaged over the attempts.
     * <p>
     * The target is the smaller of the crew's size and what a server can hold: a pair is after two
     * ships, a group of eighteen cannot have more than {@value #SHIPS_PER_SERVER} together however
     * hard it tries. Scoring each attempt against its own target is what makes a duo and a
     * server-lock attempt comparable — the plain convergence rate is not, since it asks the same
     * "did two meet?" question of both (issue #720).
     */
    // Package-private so the scoring can be unit-tested directly rather than through the endpoint.
    static double averageGoalCompletion(List<AllianceAttempt> rows) {
        return rows.stream()
                .filter(a -> a.players >= 2) // a lone searcher has nobody to meet; not a failed goal
                .mapToDouble(a -> {
                    int target = Math.min(a.players, SHIPS_PER_SERVER);
                    return Math.min(1.0, (double) a.largestGroup / target);
                })
                .average()
                .orElse(0);
    }

    /** Groups the attempts into search-size bands, each scored on its own terms. */
    static List<SizeBand> bandBreakdown(List<AllianceAttempt> rows) {
        Map<String, List<AllianceAttempt>> bands = new LinkedHashMap<>();
        for (String band : List.of("2-3", "4-6", "7+")) {
            bands.put(band, new ArrayList<>());
        }
        for (AllianceAttempt a : rows) {
            if (a.players < 2) {
                continue; // nothing to converge with
            }
            bands.get(a.players <= 3 ? "2-3" : a.players <= 6 ? "4-6" : "7+").add(a);
        }

        List<SizeBand> out = new ArrayList<>();
        bands.forEach((band, list) -> {
            long attempts = list.size();
            long met = list.stream().filter(a -> a.converged).count();
            out.add(new SizeBand(band, attempts, met,
                    attempts == 0 ? 0 : (double) met / attempts,
                    averageGoalCompletion(list)));
        });
        return out;
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
