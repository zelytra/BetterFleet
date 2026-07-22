package fr.zelytra.statistics;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Store of anonymized {@link AllianceAttempt} rows (issue #673). Aggregations for the dashboard are
 * computed in {@link AllianceStatsEndpoints} by streaming the rows — fine at this volume; move to a
 * SQL {@code GROUP BY} here if the table ever grows large.
 */
@ApplicationScoped
public class AllianceAttemptRepository implements PanacheRepository<AllianceAttempt> {
}
