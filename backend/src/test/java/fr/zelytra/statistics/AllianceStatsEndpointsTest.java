package fr.zelytra.statistics;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The scoring behind the alliance dashboard (issue #720).
 * <p>
 * The point being pinned here is comparability: a pair that pairs up and a big crew that locks five
 * ships both achieved what they set out to do, and must score the same, while the plain convergence
 * rate calls a five-ship attempt that only managed two a success.
 */
class AllianceStatsEndpointsTest {

    private static AllianceAttempt attempt(int players, int largestGroup) {
        AllianceAttempt a = new AllianceAttempt();
        a.tsUtc = Instant.parse("2026-07-26T20:00:00Z");
        a.players = players;
        a.largestGroup = largestGroup;
        a.distinctServers = Math.max(1, players - largestGroup + 1);
        a.converged = largestGroup >= 2;
        a.tryNumber = 1;
        return a;
    }

    @Test
    void aPairAndAServerLockThatBothSucceedScoreTheSame() {
        // Two searching, two met: everything they were after.
        assertEquals(1.0, AllianceStatsEndpoints.averageGoalCompletion(List.of(attempt(2, 2))), 1e-9);
        // Eighteen searching, five met: also everything they could get — a server holds no more.
        assertEquals(1.0, AllianceStatsEndpoints.averageGoalCompletion(List.of(attempt(18, 5))), 1e-9);
    }

    @Test
    void aBigSearchThatOnlyPairedUpIsNotAFullSuccess() {
        // The old rate calls this converged; against a five-ship target it is 40% of the goal.
        AllianceAttempt a = attempt(18, 2);
        assertTrue(a.converged, "still counts as an alliance having formed");
        assertEquals(0.4, AllianceStatsEndpoints.averageGoalCompletion(List.of(a)), 1e-9);
    }

    @Test
    void theTargetIsCappedByWhatAServerHolds() {
        // Nothing above the capacity is expected of anyone, so more searchers never lowers the bar
        // beyond it: 5 met out of 7 or out of 18 is a full result either way.
        assertEquals(1.0, AllianceStatsEndpoints.averageGoalCompletion(List.of(attempt(7, 5))), 1e-9);
        assertEquals(1.0, AllianceStatsEndpoints.averageGoalCompletion(List.of(attempt(30, 5))), 1e-9);
    }

    @Test
    void goingOverTheTargetNeverScoresAboveFull() {
        assertEquals(1.0, AllianceStatsEndpoints.averageGoalCompletion(List.of(attempt(2, 4))), 1e-9);
    }

    @Test
    void aLoneSearcherIsIgnoredRatherThanCountedAsAFailure() {
        // Nobody to meet: scoring it 0 would drag the average down for a goal that never existed.
        assertEquals(0.0, AllianceStatsEndpoints.averageGoalCompletion(List.of(attempt(1, 1))), 1e-9);
        assertEquals(1.0,
                AllianceStatsEndpoints.averageGoalCompletion(List.of(attempt(1, 1), attempt(2, 2))),
                1e-9);
    }

    @Test
    void bandsSplitTheSearchesAndScoreEachOnItsOwnTarget() {
        List<AllianceAttempt> rows = List.of(
                attempt(2, 2),   // 2-3 : full
                attempt(3, 1),   // 2-3 : missed entirely
                attempt(5, 5),   // 4-6 : full
                attempt(18, 2)); // 7+  : converged, but 40% of a five-ship goal

        List<AllianceStatsEndpoints.SizeBand> bands = AllianceStatsEndpoints.bandBreakdown(rows);
        assertEquals(List.of("2-3", "4-6", "7+"), bands.stream().map(AllianceStatsEndpoints.SizeBand::band).toList());

        AllianceStatsEndpoints.SizeBand small = bands.get(0);
        assertEquals(2, small.attempts());
        assertEquals(0.5, small.convergenceRate(), 1e-9);
        assertEquals(2.0 / 3.0, small.goalCompletion(), 1e-9); // (2/2 + 1/3) / 2

        AllianceStatsEndpoints.SizeBand large = bands.get(2);
        assertEquals(1, large.attempts());
        // Where the two readings disagree, and why the band exists.
        assertEquals(1.0, large.convergenceRate(), 1e-9);
        assertEquals(0.4, large.goalCompletion(), 1e-9);
    }

    @Test
    void aRowRecordedUnderTheOldRuleIsCountedByTodaysRule() {
        // Written before #700, when converged meant "the whole fleet reached one server": three of the
        // four grouped up, so it was stored as a failure. Today that is an alliance, and the band must
        // say so rather than repeat what the flag was set to back then.
        AllianceAttempt legacy = attempt(4, 3);
        legacy.converged = false; // what the old rule decided, kept on the row as the audit trail

        List<AllianceStatsEndpoints.SizeBand> bands = AllianceStatsEndpoints.bandBreakdown(List.of(legacy));
        AllianceStatsEndpoints.SizeBand medium = bands.get(1); // 4-6
        assertEquals(1, medium.attempts());
        assertEquals(1, medium.converged(), "the stored flag must not decide this any more");
        assertEquals(1.0, medium.convergenceRate(), 1e-9);
    }

    @Test
    void aStoredFlagCannotInventAConvergenceEither() {
        // The reverse guard: a row whose flag says true but that never grouped anyone stays a failure.
        AllianceAttempt bogus = attempt(4, 1);
        bogus.converged = true;

        List<AllianceStatsEndpoints.SizeBand> bands = AllianceStatsEndpoints.bandBreakdown(List.of(bogus));
        assertEquals(0, bands.get(1).converged());
    }

    @Test
    void emptyBandsAreStillReportedRatherThanDropped() {
        List<AllianceStatsEndpoints.SizeBand> bands = AllianceStatsEndpoints.bandBreakdown(List.of());
        assertEquals(3, bands.size());
        assertTrue(bands.stream().allMatch(b -> b.attempts() == 0));
    }
}
