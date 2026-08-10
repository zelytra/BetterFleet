-- Fake-but-plausible data for the public statistics page, DEV ONLY.
--
-- Fills the two tables that page reads: `statistics` (one row per UTC day: downloads, sessions
-- opened, set-sail tries) and `alliance_attempt` (one anonymized row per countdown outcome). The
-- shapes are deliberately non-uniform so every widget has something honest-looking to show: a
-- growth trend, busier weekends, four "release day" download spikes with a two-day tail, an
-- evening-heavy hour histogram, and a convergence rate that improves off-peak.
--
-- Run it against the dev compose database (both tables are TRUNCATED first):
--
--   docker exec -i betterfleet-postgres-app \
--     psql -U "$POSTGRES_USER" -d BetterFleet < deployment/dev/seed-stats.sql
--
-- (the backend must have run once against this database, so Hibernate has created the tables)

BEGIN;

SELECT setseed(0.42); -- same fake data on every run

TRUNCATE public.statistics, public.alliance_attempt;

-- ---------------------------------------------------------------------------------------------
-- statistics: 180 days ending today. Baseline grows ~40 -> ~90 downloads/day, weekends run ~45%
-- hotter, and days 30/82/135/168 are releases: a burst that decays over the two days after.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.statistics (date, download, session_open, session_try)
SELECT d.day,
       d.downloads,
       (d.downloads * (2.2 + random() * 0.6))::int,
       (d.downloads * (2.2 + random() * 0.6) * (3.5 + random()))::int
FROM (
    SELECT day,
           (
             (40 + i * 50.0 / 180)                                   -- growth trend
             * (CASE WHEN EXTRACT(isodow FROM day) >= 6
                     THEN 1.45 ELSE 1.0 END)                          -- weekend bump
             * (0.75 + random() * 0.55)                               -- daily noise
             + (CASE
                  WHEN i IN (30, 82, 135, 168) THEN 320
                  WHEN i IN (31, 83, 136, 169) THEN 130
                  WHEN i IN (32, 84, 137, 170) THEN 55
                  ELSE 0
                END) * (0.8 + random() * 0.4)                         -- release spike + tail
           )::int AS downloads
    FROM generate_series(0, 179) AS i,
         LATERAL (SELECT current_date - 179 + i AS day) AS t
) AS d;

-- ---------------------------------------------------------------------------------------------
-- alliance_attempt: ~110 attempts/day (weekends busier, mild growth), evening-heavy hours,
-- convergence a bit better off-peak, owner regions weighted toward the community's real mix.
-- IDs are placed high and the Hibernate sequence bumped past them, so live inserts never collide.
-- ---------------------------------------------------------------------------------------------
-- Layered subqueries, NOT an uncorrelated LATERAL: Postgres evaluates an uncorrelated lateral
-- subquery once for the whole statement (volatile functions included), which collapses every
-- "random" draw into one constant. Volatile expressions in a SELECT list, by contrast, are
-- evaluated per row - so each layer draws its randoms in its select list and the next layer uses
-- them by name.
INSERT INTO public.alliance_attempt
    (id, ts_utc, owner_region, server_region, players, distinct_servers, largest_group,
     converged, try_number)
SELECT 1000000 + row_number() OVER (),
       a.ts_utc,
       a.owner_region,
       a.server_region,
       a.players,
       a.distinct_servers,
       a.players - a.distinct_servers + 1,               -- largest group, consistent by construction
       (a.players - a.distinct_servers + 1) >= 2,
       1 + floor(power(random(), 2) * 7)::int            -- most attempts succeed within a few tries
FROM (
    SELECT roll.day + make_interval(
             hours => roll.hour,
             mins  => floor(random() * 60)::int,
             secs  => floor(random() * 60)::int
           ) AS ts_utc,
           -- Owner country, weighted: fr-heavy community, then de/us/gb/es/it/pl/br/ru/ca/be/ch.
           (SELECT r FROM (VALUES (0.30, 'fr'), (0.45, 'de'), (0.57, 'us'), (0.67, 'gb'),
                                  (0.75, 'es'), (0.81, 'it'), (0.86, 'pl'), (0.90, 'br'),
                                  (0.93, 'ru'), (0.96, 'ca'), (0.98, 'be'), (1.01, 'ch'))
                          AS w(cut, r)
            WHERE roll.pick <= cut ORDER BY cut LIMIT 1) AS owner_region,
           -- Server country: the game hosts in a handful of datacenter regions.
           (ARRAY['de', 'fr', 'gb', 'us', 'nl'])[1 + floor(random() * 5)::int] AS server_region,
           roll.players,
           -- Convergence quality: 1 distinct server is the win; probability improves off-peak
           -- (02:00-14:00 UTC) when matchmaking pools are thinner.
           CASE
             WHEN random() < (0.62 + CASE WHEN roll.hour BETWEEN 2 AND 13 THEN 0.16 ELSE 0.0 END)
               THEN 1
             ELSE least(roll.players, 2 + floor(random() * 3)::int)
           END AS distinct_servers
    FROM (
        -- One row per attempt, each with its own hour/pick/players draws.
        SELECT day,
               -- Two-thirds of attempts land in the 16:00-23:00 UTC evening block.
               CASE WHEN random() < 0.66
                    THEN (16 + floor(random() * 8)::int) % 24
                    ELSE floor(random() * 24)::int
               END AS hour,
               random() AS pick,
               2 + floor(power(random(), 1.6) * 7)::int AS players   -- 2 is the mode, 8 the rare max
                                                                     -- (keeps the "7+" size band alive)
        FROM generate_series(0, 179) AS i
        CROSS JOIN LATERAL (SELECT current_date - 179 + i AS day) AS t
        CROSS JOIN LATERAL generate_series(
            1,
            (
              (75 + i * 30.0 / 180)                                   -- mild growth
              * (CASE WHEN EXTRACT(isodow FROM day) >= 6 THEN 1.6 ELSE 1.0 END)
              * (0.7 + random() * 0.6)
            )::int
        ) AS attempt
    ) AS roll
) AS a;

-- Keep Hibernate's id allocator ahead of the seeded ids.
SELECT setval('public.alliance_attempt_seq',
              (SELECT max(id) + 1000 FROM public.alliance_attempt));

COMMIT;

-- A glance at what was written.
SELECT count(*) AS statistics_days,
       sum(download) AS total_downloads FROM public.statistics;
SELECT count(*) AS alliance_attempts,
       round(avg(CASE WHEN converged THEN 1 ELSE 0 END)::numeric, 3) AS converged_rate
FROM public.alliance_attempt;
