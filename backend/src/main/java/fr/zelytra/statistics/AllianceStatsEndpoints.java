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
import java.util.TreeMap;

/**
 * Read-only, anonymous aggregations over {@link AllianceAttempt} for the public statistics
 * dashboard (issue #673). Streams the rows and groups them in memory: fine at this volume; move
 * to SQL GROUP BY if the table ever grows large. Never exposes a raw row, only aggregates.
 */
@Path("/stats")
public class AllianceStatsEndpoints {

    // A cell/region needs at least this many attempts before its rate is trusted in the UI (#673 §6).
    private static final long MIN_SAMPLE = 30;

    /**
     * The most ships a crew can realistically gather on one server. A Sea of Thieves server holds 5-6
     * ships, and during a search every player sails alone on their own boat, so this is also the most
     * players a search can ever land together, however many are looking (issue #720).
     */
    private static final int SHIPS_PER_SERVER = 5;

    /**
     * Whether an attempt counts as an alliance having formed, decided here rather than read from the
     * stored {@code converged} flag.
     * <p>
     * That flag holds whatever rule was in force the day the row was written: until #700 it meant
     * "the whole fleet reached one server" ({@code distinctServers == 1}), and since then it means
     * "at least two met". A search where three players out of four grouped up was therefore recorded
     * as a failure in June and is a success today: same event, opposite answer, and the older row
     * keeps its answer for ever. Adding them up gives a percentage that silently changes definition
     * partway through its own history.
     * <p>
     * Deriving it from {@code largestGroup}, which every row has always carried, puts the whole
     * dashboard on one rule. The column stays written at record time: it is the audit trail of what
     * was decided back then, and comparing the two is how you measure the gap.
     */
    private static boolean converged(AllianceAttempt attempt) {
        return attempt.largestGroup >= 2;
    }

    /**
     * The dashboard's one denominator rule (#846): a lone searcher has nobody to meet, so a
     * {@code players < 2} row can never satisfy {@link #converged}. Counting such rows in any
     * denominator turns "how often do alliances form" into "how often does someone search alone".
     * The size bands and {@link #averageGoalCompletion} always excluded them, while the headline,
     * the heatmap and the best hours did not - same page, same 55 conversions, 12% on one line and
     * 18% a few lines below. Applied once, where {@link #alliance} loads its rows, so no aggregate
     * of that payload can drift off the rule again; the static helpers keep their own guards
     * because they are also called, and unit-tested, with raw lists. The rows themselves stay
     * persisted: solo-search volume is still a signal, and {@code /tries} deliberately stays
     * unfiltered - it backs a global histogram, not this dashboard.
     */
    private static boolean countsForAlliance(AllianceAttempt attempt) {
        return attempt.players >= 2;
    }

    @Inject
    AllianceAttemptRepository repository;

    /** One (day-of-week 1-7, hour 0-23 UTC) cell of the convergence heatmap. */
    public record HeatCell(int dayOfWeek, int hour, long attempts, long converged, double rate) {
    }

    /**
     * One search-size band. Sizes are not comparable on convergence alone: the criterion is "two
     * ships met", which a big search clears far more easily than a duo (it has more boats in the
     * draw), while a big search is usually after five, not two (issue #720). Split them so each band
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

    /**
     * One try-number bucket of the tries histogram: how many countdowns were recorded at that try,
     * and how many of them formed an alliance (today's rule, like everything else here).
     */
    public record TryCount(int tryNumber, long attempts, long converged) {
    }

    @GET
    @Path("/alliance")
    @Produces(MediaType.APPLICATION_JSON)
    public Response alliance(@QueryParam("ownerRegion") String ownerRegion,
                             @QueryParam("serverRegion") String serverRegion) {
        List<AllianceAttempt> rows = repository.listAll().stream()
                .filter(a -> blankOrEquals(ownerRegion, a.ownerRegion))
                .filter(a -> blankOrEquals(serverRegion, a.serverRegion))
                .filter(AllianceStatsEndpoints::countsForAlliance)
                .toList();

        long total = rows.size();
        long converged = rows.stream().filter(AllianceStatsEndpoints::converged).count();
        double rate = total == 0 ? 0 : (double) converged / total;
        double avgTries = rows.stream().mapToInt(a -> a.tryNumber).average().orElse(0);
        double goalCompletion = averageGoalCompletion(rows);
        List<SizeBand> bySize = bandBreakdown(rows);

        // Group by (day-of-week, hour) in UTC: [attempts, converged] per cell and per hour.
        Map<String, long[]> cells = new LinkedHashMap<>();
        Map<Integer, long[]> byHour = new LinkedHashMap<>();
        for (AllianceAttempt a : rows) {
            ZonedDateTime t = a.tsUtc.atZone(ZoneOffset.UTC);
            int dow = t.getDayOfWeek().getValue();
            int hour = t.getHour();
            long[] cell = cells.computeIfAbsent(dow + "-" + hour, k -> new long[2]);
            cell[0]++;
            if (converged(a)) cell[1]++;
            long[] h = byHour.computeIfAbsent(hour, k -> new long[2]);
            h[0]++;
            if (converged(a)) h[1]++;
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
     * server-lock attempt comparable: the plain convergence rate is not, since it asks the same
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
            long met = list.stream().filter(AllianceStatsEndpoints::converged).count();
            out.add(new SizeBand(band, attempts, met,
                    attempts == 0 ? 0 : (double) met / attempts,
                    averageGoalCompletion(list)));
        });
        return out;
    }

    /**
     * Attempt counts by country, busiest first. {@code dimension=server} counts the country of the
     * server the biggest group ended up on (the game's datacenters); anything else counts the
     * session owner's country, which is what the globe has always shown. Rows with no resolved
     * country are skipped rather than shown as a fake "unknown" region.
     */
    @GET
    @Path("/regions")
    @Produces(MediaType.APPLICATION_JSON)
    public Response regions(@QueryParam("dimension") String dimension) {
        boolean byServer = "server".equalsIgnoreCase(dimension);
        Map<String, Long> counts = new LinkedHashMap<>();
        for (AllianceAttempt a : repository.listAll()) {
            String region = byServer ? a.serverRegion : a.ownerRegion;
            if (region == null || region.isBlank()) continue;
            counts.merge(region.toLowerCase(), 1L, Long::sum);
        }
        List<RegionCount> out = new ArrayList<>();
        counts.forEach((region, n) -> out.add(new RegionCount(region, n)));
        out.sort((x, y) -> Long.compare(y.attempts(), x.attempts()));
        return Response.ok(out).build();
    }

    /**
     * The tries histogram: for each recorded try number, how many countdowns happened on that try
     * and how many of them formed an alliance. One bucket per try number seen in the data, sorted
     * ascending; the website folds the long tail into a final band itself. Deliberately unfiltered:
     * it backs a global "which try finally clicks" chart, not the region-filtered dashboard.
     */
    @GET
    @Path("/tries")
    @Produces(MediaType.APPLICATION_JSON)
    public Response tries() {
        Map<Integer, long[]> byTry = new TreeMap<>();
        for (AllianceAttempt a : repository.listAll()) {
            if (a.tryNumber < 1) continue; // pre-#673 malformed rows carry no usable try number
            long[] bucket = byTry.computeIfAbsent(a.tryNumber, k -> new long[2]);
            bucket[0]++;
            if (converged(a)) bucket[1]++;
        }
        List<TryCount> out = new ArrayList<>();
        byTry.forEach((tryNumber, bucket) -> out.add(new TryCount(tryNumber, bucket[0], bucket[1])));
        return Response.ok(out).build();
    }

    private static boolean blankOrEquals(String filter, String value) {
        return filter == null || filter.isBlank() || filter.equalsIgnoreCase(value);
    }
}
