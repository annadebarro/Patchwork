# Recommendation KPI Semantics v1

## 1. Version, Scope, Effective Date
- Version: `v1`
- Effective date: `2026-02-11`
- Scope: Defines canonical recommendation KPI semantics for Patchwork using `user_actions` and `users`.
- Purpose: Remove ambiguity before recommendation model tuning so analytics, recommender evaluation, and tests use a single contract.

## 2. Source Tables and Required Columns
Primary sources:
- `user_actions`
  - Required columns: `id`, `user_id`, `action_type`, `target_type`, `target_id`, `metadata_json`, `source_surface`, `session_id`, `occurred_at`
- `users`
  - Required columns: `id`, `created_at`

Metadata fields expected in `user_actions.metadata_json`:
- `requestId`
- `feedType`
- `postId`
- `dwellMs`

SQL dialect: PostgreSQL.

## 3. Canonical Event Taxonomy
KPI-relevant event types:
- Exposure telemetry:
  - `feed_impression`
  - `feed_click`
  - `feed_dwell`
- Strong positive actions:
  - `user_follow`
  - `post_patch_save`
  - `post_like`
  - `comment_create`
  - `comment_like`
- Strong negative actions:
  - `user_unfollow`
  - `post_unlike`
  - `comment_unlike`

Derived output fields used across analytics:
- `session_instance_id` (derived)
- `user_cohort` (`new`, `returning`)
- `feed_type` (`all`, `regular`, `market`, `unknown`)
- `strong_action_weight`
- `meaningful_session_flag`
- `net_strong_score`
- `attributed_positive_post_action_flag`
- `bot_like_session_flag`

## 4. Sessionization Rules
1. Base session key is `user_id + session_id`.
2. Session-level KPI calculations only include rows where `session_id IS NOT NULL`.
3. Split a derived session instance when inactivity gap is greater than 30 minutes:
   - If `occurred_at - lag(occurred_at) > interval '30 minutes'`, start a new `session_instance_id`.
4. Daily quality metrics must include `% non-null session_id` across KPI-relevant events.

## 5. Attribution Rules
1. Attribution applies only to positive post-scoped strong actions (`post_patch_save`, `post_like`, `comment_create`, `comment_like`).
2. An action is attributed only if there is at least one prior feed exposure of the same `post_id` in the same derived `session_instance_id`.
3. Eligible exposures are deduped `feed_impression` and deduped `feed_click`.
4. For each action, attribution selects the latest qualifying prior exposure (`max occurred_at <= action occurred_at`).
5. Attribution is request-id based for exposures:
   - Only exposures with non-null `request_id` can attribute actions.
6. `user_follow` is session-level strong intent and not post-attributed unless future instrumentation adds post context.

## 6. Strong-Action Weight Table
| action_type | weight | polarity | post_scoped |
|---|---:|---|---|
| `user_follow` | +3 | positive | no |
| `post_patch_save` | +3 | positive | yes |
| `post_like` | +2 | positive | yes |
| `comment_create` | +2 | positive | yes |
| `comment_like` | +1 | positive | yes |
| `user_unfollow` | -3 | negative | no |
| `post_unlike` | -2 | negative | yes |
| `comment_unlike` | -1 | negative | yes |

Definition:
- `net_strong_score = sum(strong_action_weight)` over all strong actions in session.

## 7. Meaningful Session Definition
A session is meaningful when:
- `impression_count >= 10`
- `positive_strong_action_count >= 1`

Notes:
- `positive_strong_action_count` is row-based count of positive strong actions.
- Net score is not used to gate meaningfulness.

## 8. Exclusion Rules (Duplicates, Retries, Bot-Like Bursts)
### 8.1 Duplicate/retry handling
1. `feed_impression` and `feed_click` dedupe key:
   - `(user_id, session_instance_id, request_id, post_id, action_type)`
2. If `request_id` is null, dedupe fallback is row-level only (no retry collapsing).
3. `feed_dwell` is aggregated per `(user_id, session_instance_id, request_id, post_id)`:
   - `dwell_total_ms = sum(dwell_ms)`
   - `dwell_event_count = count(*)`
4. Request-id based attribution includes only exposure rows with non-null `request_id`.
5. Daily quality metrics must report request-id coverage on feed telemetry rows.

### 8.2 Bot-like burst exclusion
Exclude a session from KPI aggregates when either condition is true:
1. `session_duration_minutes >= 2` and `impressions_per_minute > 120`
2. `impression_count >= 50` and `dwell_event_coverage < 0.05`

Where:
- `dwell_event_coverage = dwell_event_count / impression_count`

Rationale:
- This is the approved measurable proxy for currently unavailable sub-300ms dwell logging.

## 9. Reporting Slices and Cohorts
Report KPI rollups by:
- `source_surface`
- `feed_type`
- `user_cohort`

Cohort rule:
- `new` if `session_start_at < users.created_at + interval '30 days'`
- `returning` otherwise

Time boundary:
- Daily UTC: `date_trunc('day', occurred_at AT TIME ZONE 'UTC')`

## 10. Canonical KPI Formulas
For each `(day_utc, source_surface, feed_type, user_cohort)` slice (after bot-like exclusion):
- `ctr = click_count / impression_count`
- `avg_dwell_ms_per_impression = dwell_total_ms / impression_count`
- `meaningful_session_rate = meaningful_sessions / sessions`
- `net_strong_score_per_session = sum(net_strong_score) / sessions`
- `net_strong_score_per_1k_impressions = 1000 * sum(net_strong_score) / impressions`
- `attributed_positive_post_action_rate = attributed_positive_post_actions / impressions`

Daily quality metrics (not bot-filtered):
- `known_surface_pct = 100 * count(source_surface != 'unknown') / count(all_kpi_rows)`
- `non_null_session_pct = 100 * count(session_id is not null) / count(all_kpi_rows)`
- `request_id_coverage_pct = 100 * count(feed telemetry rows with request_id) / count(feed telemetry rows)`

## 11. Executable SQL (CTE-based reference query)
```sql
WITH base_events AS (
  SELECT
    ua.id,
    ua.user_id,
    ua.action_type,
    ua.target_type,
    ua.target_id,
    ua.metadata_json,
    ua.source_surface,
    ua.session_id,
    ua.occurred_at,
    date_trunc('day', ua.occurred_at AT TIME ZONE 'UTC') AS day_utc,
    CASE
      WHEN ua.target_type = 'post' THEN ua.target_id
      WHEN ua.metadata_json ? 'postId' THEN NULLIF(btrim(ua.metadata_json->>'postId'), '')
      ELSE NULL
    END AS post_id,
    CASE
      WHEN lower(COALESCE(NULLIF(btrim(ua.metadata_json->>'feedType'), ''), 'unknown')) IN ('all', 'regular', 'market')
        THEN lower(COALESCE(NULLIF(btrim(ua.metadata_json->>'feedType'), ''), 'unknown'))
      ELSE 'unknown'
    END AS feed_type,
    NULLIF(btrim(ua.metadata_json->>'requestId'), '') AS request_id,
    CASE
      WHEN ua.metadata_json ? 'dwellMs'
           AND (ua.metadata_json->>'dwellMs') ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN round((ua.metadata_json->>'dwellMs')::numeric)::bigint
      ELSE NULL
    END AS dwell_ms
  FROM user_actions ua
  WHERE ua.action_type IN (
    'feed_impression', 'feed_click', 'feed_dwell',
    'user_follow', 'post_patch_save', 'post_like', 'comment_create', 'comment_like',
    'user_unfollow', 'post_unlike', 'comment_unlike'
  )
),
sessionized_events AS (
  SELECT
    seeded.*,
    sum(seeded.new_instance_flag) OVER (
      PARTITION BY seeded.user_id, seeded.session_id
      ORDER BY seeded.occurred_at, seeded.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS session_instance_ordinal,
    concat(
      seeded.user_id::text,
      ':',
      seeded.session_id::text,
      ':',
      lpad(
        sum(seeded.new_instance_flag) OVER (
          PARTITION BY seeded.user_id, seeded.session_id
          ORDER BY seeded.occurred_at, seeded.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::text,
        4,
        '0'
      )
    ) AS session_instance_id
  FROM (
    SELECT
      be.*,
      CASE
        WHEN lag(be.occurred_at) OVER (
          PARTITION BY be.user_id, be.session_id
          ORDER BY be.occurred_at, be.id
        ) IS NULL THEN 1
        WHEN be.occurred_at - lag(be.occurred_at) OVER (
          PARTITION BY be.user_id, be.session_id
          ORDER BY be.occurred_at, be.id
        ) > interval '30 minutes' THEN 1
        ELSE 0
      END AS new_instance_flag
    FROM base_events be
    WHERE be.session_id IS NOT NULL
  ) seeded
),
dedup_exposures AS (
  SELECT
    ranked.id,
    ranked.user_id,
    ranked.session_id,
    ranked.session_instance_id,
    ranked.day_utc,
    ranked.source_surface,
    ranked.feed_type,
    ranked.request_id,
    ranked.post_id,
    ranked.action_type,
    ranked.occurred_at
  FROM (
    SELECT
      se.*,
      row_number() OVER (
        PARTITION BY
          se.user_id,
          se.session_instance_id,
          CASE WHEN se.request_id IS NULL THEN se.id::text ELSE se.request_id END,
          se.post_id,
          se.action_type
        ORDER BY se.occurred_at, se.id
      ) AS rn
    FROM sessionized_events se
    WHERE se.action_type IN ('feed_impression', 'feed_click')
      AND se.post_id IS NOT NULL
  ) ranked
  WHERE ranked.rn = 1
),
dwell_rollup AS (
  SELECT
    se.user_id,
    se.session_id,
    se.session_instance_id,
    se.post_id,
    se.request_id,
    min(se.day_utc) AS day_utc,
    min(se.source_surface) AS source_surface,
    min(se.feed_type) AS feed_type,
    sum(COALESCE(se.dwell_ms, 0))::bigint AS dwell_total_ms,
    count(*)::bigint AS dwell_event_count
  FROM sessionized_events se
  WHERE se.action_type = 'feed_dwell'
    AND se.post_id IS NOT NULL
  GROUP BY
    se.user_id,
    se.session_id,
    se.session_instance_id,
    se.post_id,
    se.request_id
),
strong_actions AS (
  SELECT
    se.*,
    CASE se.action_type
      WHEN 'user_follow' THEN 3
      WHEN 'post_patch_save' THEN 3
      WHEN 'post_like' THEN 2
      WHEN 'comment_create' THEN 2
      WHEN 'comment_like' THEN 1
      WHEN 'user_unfollow' THEN -3
      WHEN 'post_unlike' THEN -2
      WHEN 'comment_unlike' THEN -1
      ELSE 0
    END AS strong_action_weight,
    CASE
      WHEN se.action_type IN ('post_patch_save', 'post_like', 'comment_create', 'comment_like', 'post_unlike', 'comment_unlike')
        THEN true
      ELSE false
    END AS is_post_scoped
  FROM sessionized_events se
  WHERE se.action_type IN (
    'user_follow', 'post_patch_save', 'post_like', 'comment_create', 'comment_like',
    'user_unfollow', 'post_unlike', 'comment_unlike'
  )
),
attributed_post_actions AS (
  SELECT
    sa.id AS action_id,
    sa.user_id,
    sa.session_id,
    sa.session_instance_id,
    sa.day_utc,
    sa.post_id,
    sa.action_type,
    sa.strong_action_weight,
    sa.occurred_at AS action_occurred_at,
    expo.id AS exposure_id,
    expo.request_id AS exposure_request_id,
    expo.action_type AS exposure_action_type,
    expo.occurred_at AS exposure_occurred_at,
    CASE WHEN expo.id IS NOT NULL THEN 1 ELSE 0 END AS attributed_positive_post_action_flag
  FROM strong_actions sa
  LEFT JOIN LATERAL (
    SELECT de.*
    FROM dedup_exposures de
    WHERE de.user_id = sa.user_id
      AND de.session_instance_id = sa.session_instance_id
      AND de.post_id = sa.post_id
      AND de.request_id IS NOT NULL
      AND de.occurred_at <= sa.occurred_at
    ORDER BY de.occurred_at DESC, de.id DESC
    LIMIT 1
  ) expo ON true
  WHERE sa.strong_action_weight > 0
    AND sa.is_post_scoped = true
),
session_rollup AS (
  SELECT
    core.user_id,
    core.session_id,
    core.session_instance_id,
    core.session_start_at,
    date_trunc('day', core.session_start_at AT TIME ZONE 'UTC') AS day_utc,
    COALESCE(surface_pick.source_surface, 'unknown') AS source_surface,
    COALESCE(feed_pick.feed_type, 'unknown') AS feed_type,
    COALESCE(exp.impression_count, 0)::bigint AS impression_count,
    COALESCE(exp.click_count, 0)::bigint AS click_count,
    COALESCE(dw.dwell_total_ms, 0)::bigint AS dwell_total_ms,
    COALESCE(dw.dwell_event_count, 0)::bigint AS dwell_event_count,
    COALESCE(sa.positive_strong_action_count, 0)::bigint AS positive_strong_action_count,
    COALESCE(sa.negative_strong_action_count, 0)::bigint AS negative_strong_action_count,
    COALESCE(sa.net_strong_score, 0)::bigint AS net_strong_score,
    COALESCE(apa.attributed_positive_post_actions, 0)::bigint AS attributed_positive_post_actions,
    CASE
      WHEN COALESCE(exp.impression_count, 0) >= 10
       AND COALESCE(sa.positive_strong_action_count, 0) >= 1 THEN 1
      ELSE 0
    END AS meaningful_session_flag,
    EXTRACT(EPOCH FROM (core.session_end_at - core.session_start_at)) / 60.0 AS session_duration_minutes,
    CASE
      WHEN COALESCE(exp.impression_count, 0) > 0
       AND EXTRACT(EPOCH FROM (core.session_end_at - core.session_start_at)) > 0
        THEN COALESCE(exp.impression_count, 0)
             / (EXTRACT(EPOCH FROM (core.session_end_at - core.session_start_at)) / 60.0)
      ELSE 0
    END AS impressions_per_minute,
    CASE
      WHEN COALESCE(exp.impression_count, 0) > 0
        THEN COALESCE(dw.dwell_event_count, 0)::numeric / COALESCE(exp.impression_count, 0)
      ELSE 0
    END AS dwell_event_coverage,
    CASE
      WHEN (
        EXTRACT(EPOCH FROM (core.session_end_at - core.session_start_at)) / 60.0 >= 2
        AND (
          CASE
            WHEN COALESCE(exp.impression_count, 0) > 0
             AND EXTRACT(EPOCH FROM (core.session_end_at - core.session_start_at)) > 0
              THEN COALESCE(exp.impression_count, 0)
                   / (EXTRACT(EPOCH FROM (core.session_end_at - core.session_start_at)) / 60.0)
            ELSE 0
          END
        ) > 120
      )
      OR (
        COALESCE(exp.impression_count, 0) >= 50
        AND (
          CASE
            WHEN COALESCE(exp.impression_count, 0) > 0
              THEN COALESCE(dw.dwell_event_count, 0)::numeric / COALESCE(exp.impression_count, 0)
            ELSE 0
          END
        ) < 0.05
      )
      THEN 1
      ELSE 0
    END AS bot_like_session_flag
  FROM (
    SELECT
      se.user_id,
      se.session_id,
      se.session_instance_id,
      min(se.occurred_at) AS session_start_at,
      max(se.occurred_at) AS session_end_at
    FROM sessionized_events se
    GROUP BY se.user_id, se.session_id, se.session_instance_id
  ) core
  LEFT JOIN LATERAL (
    SELECT s.source_surface
    FROM (
      SELECT
        se2.source_surface,
        count(*) AS event_count,
        min(se2.occurred_at) AS first_seen_at
      FROM sessionized_events se2
      WHERE se2.user_id = core.user_id
        AND se2.session_id = core.session_id
        AND se2.session_instance_id = core.session_instance_id
      GROUP BY se2.source_surface
    ) s
    ORDER BY s.event_count DESC, s.first_seen_at ASC, s.source_surface ASC
    LIMIT 1
  ) surface_pick ON true
  LEFT JOIN LATERAL (
    SELECT f.feed_type
    FROM (
      SELECT
        de2.feed_type,
        count(*) AS exposure_count,
        min(de2.occurred_at) AS first_seen_at
      FROM dedup_exposures de2
      WHERE de2.user_id = core.user_id
        AND de2.session_id = core.session_id
        AND de2.session_instance_id = core.session_instance_id
      GROUP BY de2.feed_type
    ) f
    ORDER BY f.exposure_count DESC, f.first_seen_at ASC, f.feed_type ASC
    LIMIT 1
  ) feed_pick ON true
  LEFT JOIN (
    SELECT
      de.user_id,
      de.session_id,
      de.session_instance_id,
      count(*) FILTER (WHERE de.action_type = 'feed_impression') AS impression_count,
      count(*) FILTER (WHERE de.action_type = 'feed_click') AS click_count
    FROM dedup_exposures de
    GROUP BY de.user_id, de.session_id, de.session_instance_id
  ) exp
    ON exp.user_id = core.user_id
   AND exp.session_id = core.session_id
   AND exp.session_instance_id = core.session_instance_id
  LEFT JOIN (
    SELECT
      dr.user_id,
      dr.session_id,
      dr.session_instance_id,
      sum(dr.dwell_total_ms)::bigint AS dwell_total_ms,
      sum(dr.dwell_event_count)::bigint AS dwell_event_count
    FROM dwell_rollup dr
    GROUP BY dr.user_id, dr.session_id, dr.session_instance_id
  ) dw
    ON dw.user_id = core.user_id
   AND dw.session_id = core.session_id
   AND dw.session_instance_id = core.session_instance_id
  LEFT JOIN (
    SELECT
      sa.user_id,
      sa.session_id,
      sa.session_instance_id,
      count(*) FILTER (WHERE sa.strong_action_weight > 0) AS positive_strong_action_count,
      count(*) FILTER (WHERE sa.strong_action_weight < 0) AS negative_strong_action_count,
      sum(sa.strong_action_weight)::bigint AS net_strong_score
    FROM strong_actions sa
    GROUP BY sa.user_id, sa.session_id, sa.session_instance_id
  ) sa
    ON sa.user_id = core.user_id
   AND sa.session_id = core.session_id
   AND sa.session_instance_id = core.session_instance_id
  LEFT JOIN (
    SELECT
      apa.user_id,
      apa.session_id,
      apa.session_instance_id,
      sum(apa.attributed_positive_post_action_flag)::bigint AS attributed_positive_post_actions
    FROM attributed_post_actions apa
    GROUP BY apa.user_id, apa.session_id, apa.session_instance_id
  ) apa
    ON apa.user_id = core.user_id
   AND apa.session_id = core.session_id
   AND apa.session_instance_id = core.session_instance_id
),
daily_kpi_rollup AS (
  SELECT
    sr.day_utc,
    sr.source_surface,
    sr.feed_type,
    CASE
      WHEN sr.session_start_at < (u.created_at + interval '30 days') THEN 'new'
      ELSE 'returning'
    END AS user_cohort,
    count(*)::bigint AS sessions,
    sum(sr.impression_count)::bigint AS impressions,
    sum(sr.click_count)::bigint AS clicks,
    sum(sr.dwell_total_ms)::bigint AS dwell_total_ms,
    sum(sr.positive_strong_action_count)::bigint AS positive_strong_actions,
    sum(sr.negative_strong_action_count)::bigint AS negative_strong_actions,
    sum(sr.net_strong_score)::bigint AS net_strong_score,
    sum(sr.attributed_positive_post_actions)::bigint AS attributed_positive_post_actions,
    sum(sr.meaningful_session_flag)::bigint AS meaningful_sessions,
    round(100.0 * sum(sr.click_count)::numeric / NULLIF(sum(sr.impression_count), 0), 4) AS ctr,
    round(sum(sr.dwell_total_ms)::numeric / NULLIF(sum(sr.impression_count), 0), 2) AS avg_dwell_ms_per_impression,
    round(sum(sr.meaningful_session_flag)::numeric / NULLIF(count(*), 0), 4) AS meaningful_session_rate,
    round(sum(sr.net_strong_score)::numeric / NULLIF(count(*), 0), 4) AS net_strong_score_per_session,
    round(1000.0 * sum(sr.net_strong_score)::numeric / NULLIF(sum(sr.impression_count), 0), 4) AS net_strong_score_per_1k_impressions,
    round(sum(sr.attributed_positive_post_actions)::numeric / NULLIF(sum(sr.impression_count), 0), 4) AS attributed_positive_post_action_rate,
    quality.known_surface_pct,
    quality.non_null_session_pct,
    quality.request_id_coverage_pct
  FROM session_rollup sr
  JOIN users u
    ON u.id = sr.user_id
  JOIN (
    SELECT
      be.day_utc,
      round(100.0 * avg(CASE WHEN COALESCE(be.source_surface, 'unknown') <> 'unknown' THEN 1.0 ELSE 0.0 END), 2)
        AS known_surface_pct,
      round(100.0 * avg(CASE WHEN be.session_id IS NOT NULL THEN 1.0 ELSE 0.0 END), 2)
        AS non_null_session_pct,
      round(
        100.0 * avg(
          CASE
            WHEN be.action_type IN ('feed_impression', 'feed_click', 'feed_dwell')
             AND be.request_id IS NOT NULL
              THEN 1.0
            WHEN be.action_type IN ('feed_impression', 'feed_click', 'feed_dwell')
              THEN 0.0
            ELSE NULL
          END
        ),
        2
      ) AS request_id_coverage_pct
    FROM base_events be
    GROUP BY be.day_utc
  ) quality
    ON quality.day_utc = sr.day_utc
  WHERE sr.bot_like_session_flag = 0
  GROUP BY
    sr.day_utc,
    sr.source_surface,
    sr.feed_type,
    CASE
      WHEN sr.session_start_at < (u.created_at + interval '30 days') THEN 'new'
      ELSE 'returning'
    END,
    quality.known_surface_pct,
    quality.non_null_session_pct,
    quality.request_id_coverage_pct
)
SELECT
  day_utc,
  source_surface,
  feed_type,
  user_cohort,
  sessions,
  impressions,
  clicks,
  dwell_total_ms,
  positive_strong_actions,
  negative_strong_actions,
  net_strong_score,
  attributed_positive_post_actions,
  meaningful_sessions,
  ctr,
  avg_dwell_ms_per_impression,
  meaningful_session_rate,
  net_strong_score_per_session,
  net_strong_score_per_1k_impressions,
  attributed_positive_post_action_rate,
  known_surface_pct,
  non_null_session_pct,
  request_id_coverage_pct
FROM daily_kpi_rollup
ORDER BY day_utc DESC, source_surface, feed_type, user_cohort;
```

## 12. Validation Queries and Acceptance Checks
Use these checks during recommender/testing work to confirm KPI semantics are applied consistently.

### 12.1 Coverage sanity
```sql
SELECT
  round(100.0 * avg(CASE WHEN source_surface IS NOT NULL AND source_surface <> 'unknown' THEN 1.0 ELSE 0.0 END), 2)
    AS known_surface_pct,
  round(100.0 * avg(CASE WHEN session_id IS NOT NULL THEN 1.0 ELSE 0.0 END), 2)
    AS non_null_session_pct
FROM user_actions
WHERE occurred_at >= now() - interval '7 days';
```

### 12.2 Request-id coverage on feed telemetry
```sql
SELECT
  round(
    100.0 * avg(
      CASE
        WHEN action_type IN ('feed_impression', 'feed_click', 'feed_dwell')
         AND NULLIF(btrim(metadata_json->>'requestId'), '') IS NOT NULL
          THEN 1.0
        WHEN action_type IN ('feed_impression', 'feed_click', 'feed_dwell')
          THEN 0.0
        ELSE NULL
      END
    ),
    2
  ) AS request_id_coverage_pct
FROM user_actions
WHERE occurred_at >= now() - interval '7 days';
```

### 12.3 Required fields are populated
```sql
SELECT count(*) AS invalid_rows
FROM user_actions
WHERE action_type IN (
  'feed_impression', 'feed_click', 'feed_dwell',
  'user_follow', 'post_patch_save', 'post_like', 'comment_create', 'comment_like',
  'user_unfollow', 'post_unlike', 'comment_unlike'
)
AND (
  action_type IS NULL
  OR target_type IS NULL
  OR target_id IS NULL
  OR occurred_at IS NULL
);
```

### 12.4 Scenario checks
Expected outcomes for test scenarios:
1. Duplicate recommendation request replay with same `requestId` does not inflate impression/click counts.
2. Events with `>30m` inactivity split into separate `session_instance_id`.
3. Session with `10 impressions + 1 post_like` is meaningful.
4. Session with `10 impressions + only post_unlike` is not meaningful.
5. Like then unlike in same session produces `+2 -2 = 0` net contribution.
6. Post-like without prior same-session feed exposure is not post-attributed.
7. Post-like with prior same-session exposure is attributed exactly once.
8. New/returning boundary uses `< created_at + interval '30 days'` for `new`.
9. Bot proxy exclusion triggers for high-impression / low-dwell-coverage sessions.
10. Rows missing `session_id` are excluded from session denominators but included in quality metrics.

## 13. Known Limitations and Non-Goals
- This spec is documentation-only and does not change runtime APIs, DB schema, or logging behavior.
- Strong-action attribution is post-scoped and requires prior feed exposure in-session; user-level actions without post context are not post-attributed.
- Missing `request_id` exposure rows are not eligible for request-id-based attribution.
- Sub-300ms dwell events are not currently logged; burst filtering uses a dwell-coverage proxy.

## Spec Completeness Checklist
- [x] Every metric term has one unambiguous definition.
- [x] Every metric has explicit denominator and exclusion logic.
- [x] Every join/attribution rule is deterministic.
- [x] SQL can run directly against `user_actions` + `users`.
