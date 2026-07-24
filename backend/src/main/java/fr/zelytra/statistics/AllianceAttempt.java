package fr.zelytra.statistics;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One anonymized alliance-formation attempt (issue #673): the outcome of a single countdown, once
 * detection has settled. Deliberately carries <b>no identifiers</b> — no username, account, IP or
 * session id — so each row is a standalone event with nothing to trace back to a person. Raw rows
 * (rather than pre-aggregated buckets) keep every future analysis open: re-aggregate by any
 * dimension, cross-tab owner region against server region, feed the regions globe.
 */
@Entity
@Table(name = "alliance_attempt")
public class AllianceAttempt extends PanacheEntity {

    /** When the attempt was recorded (UTC). Hour-of-day and day-of-week are derived from this. */
    @Column(name = "ts_utc", nullable = false)
    public Instant tsUtc;

    /** Lowercase ISO 3166-1 alpha-2 country of the session owner (browser locale), "" when unknown. */
    @Column(name = "owner_region")
    public String ownerRegion;

    /** Lowercase ISO country of the server carrying the most players, "" when none resolved. */
    @Column(name = "server_region")
    public String serverRegion;

    /** Players observed on a detected server at snapshot time. */
    @Column(name = "players")
    public int players;

    /** How many distinct servers the fleet landed on — 1 means it converged. */
    @Column(name = "distinct_servers")
    public int distinctServers;

    /** How many players landed on the single biggest server (a convergence-quality measure). */
    @Column(name = "largest_group")
    public int largestGroup;

    /** True when at least two players reached one shared server (distinctServers == 1 &amp;&amp; largestGroup &gt;= 2). */
    @Column(name = "converged")
    public boolean converged;

    /** Which try this was within the session (from FleetStats.tryAmount). */
    @Column(name = "try_number")
    public int tryNumber;
}
