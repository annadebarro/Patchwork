const express = require("express");
const { QueryTypes } = require("sequelize");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const requireAdminMiddleware = require("../middleware/admin");
const {
  buildRecommendationSimulation,
  normalizeSimulationMode,
  parseReplayParams,
} = require("../services/recommendationSimulation");
const {
  ALLOWED_TRACKS,
  parseSyntheticParams,
} = require("../services/recommendationSyntheticSimulation");
const {
  DEFAULT_SCOPE,
  applyConfig,
  getActiveConfig,
  listConfigHistory,
  mergeConfig,
  rollbackConfig,
} = require("../services/recommendationConfig");
const {
  createSimulationRun,
  getSimulationRunById,
  listSimulationRuns,
} = require("../services/recommendationSimulationRuns");
const { inspectFeatureSchemaHealth } = require("../services/schemaDoctor");

const FEED_ACTIONS = ["feed_impression", "feed_click", "feed_dwell"];
const DEFAULT_ACTION_WINDOW_DAYS = 7;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RUN_HISTORY = 100;

function pct(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function parseCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function parsePositiveInt(value, fallback, min, max) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeOptionalString(value, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function parseHistoryLimit(value) {
  return parsePositiveInt(value, 20, 1, MAX_RUN_HISTORY);
}

function parseIsoDate(value) {
  if (!value) return { valid: true, date: null };
  if (typeof value !== "string") return { valid: false, message: "Date filters must be ISO strings." };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, message: "Date filters must be valid ISO date strings." };
  }
  return { valid: true, date };
}

function parseSimulationQuery(query) {
  const rawType = typeof query?.type === "string" ? query.type.trim().toLowerCase() : "";
  if (rawType && !["all", "regular", "market"].includes(rawType)) {
    return { valid: false, message: "type must be one of all, regular, or market." };
  }

  const replay = parseReplayParams({
    ...query,
    type: rawType || "all",
  });

  return {
    valid: true,
    mode: "replay",
    params: replay,
    candidateConfigOverrides: {},
  };
}

function parseSimulationPayload(body = {}) {
  const payload = normalizeObject(body);
  const mode = normalizeSimulationMode(payload.mode);
  const candidateConfigOverrides = normalizeObject(payload.candidateConfigOverrides);

  if (mode === "synthetic") {
    return {
      valid: true,
      mode,
      params: parseSyntheticParams(payload),
      candidateConfigOverrides,
    };
  }

  const replay = parseReplayParams(payload);
  if (!["all", "regular", "market"].includes(replay.type)) {
    return { valid: false, message: "type must be one of all, regular, or market." };
  }

  return {
    valid: true,
    mode: "replay",
    params: replay,
    candidateConfigOverrides,
  };
}

function parseConfigApplyPayload(body = {}) {
  const payload = normalizeObject(body);
  const confirm = typeof payload.confirm === "string" ? payload.confirm.trim().toUpperCase() : "";
  if (confirm !== "APPLY") {
    return { valid: false, message: "confirm must be APPLY." };
  }

  const scope = normalizeOptionalString(payload.scope, 100) || DEFAULT_SCOPE;
  const sourceRunId = normalizeOptionalString(payload.sourceRunId, 64);
  if (sourceRunId && !UUID_REGEX.test(sourceRunId)) {
    return { valid: false, message: "sourceRunId must be a UUID when provided." };
  }

  return {
    valid: true,
    scope,
    sourceRunId: sourceRunId || null,
    notes: normalizeOptionalString(payload.notes, 2000),
    config: payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
      ? payload.config
      : null,
    candidateConfigOverrides: normalizeObject(payload.candidateConfigOverrides),
  };
}

function parseConfigRollbackPayload(body = {}) {
  const payload = normalizeObject(body);
  const confirm = typeof payload.confirm === "string" ? payload.confirm.trim().toUpperCase() : "";
  if (confirm !== "ROLLBACK") {
    return { valid: false, message: "confirm must be ROLLBACK." };
  }

  return {
    valid: true,
    scope: normalizeOptionalString(payload.scope, 100) || DEFAULT_SCOPE,
    notes: normalizeOptionalString(payload.notes, 2000),
  };
}

function summarizeSimulationResult(simulation) {
  const primaryTrack = simulation?.tracks?.realism || null;
  const fallbackBaseline = simulation?.baseline || primaryTrack?.baseline || {};
  const fallbackCandidate = simulation?.candidate || primaryTrack?.candidate || {};
  const fallbackDelta = simulation?.delta || primaryTrack?.delta || {};
  const fallbackCoverage = simulation?.coverage || primaryTrack?.coverage || {};
  const fallbackSlices = Array.isArray(simulation?.slices)
    ? simulation.slices
    : Array.isArray(primaryTrack?.slices)
      ? primaryTrack.slices
      : [];

  return {
    mode: simulation?.mode || "replay",
    generatedAt: simulation?.generatedAt || null,
    algorithmBaseline: simulation?.algorithmBaseline || "chronological_fallback",
    algorithmCandidate: simulation?.algorithmCandidate || "hybrid_v1",
    params: simulation?.params || {},
    baseline: fallbackBaseline,
    candidate: fallbackCandidate,
    delta: fallbackDelta,
    coverage: fallbackCoverage,
    tracks: simulation?.tracks || null,
    trackComparison: simulation?.trackComparison || null,
    biasDiagnostics: simulation?.biasDiagnostics || null,
    topSlices: fallbackSlices.slice(0, 8),
  };
}

async function getTableColumns(sequelize, tableName) {
  const rows = await sequelize.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = :tableName;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { tableName },
    }
  );

  return new Set(rows.map((row) => row.column_name));
}

async function buildRecommendationsOverview({ models, now = new Date(), listSimulationRunsFn = listSimulationRuns }) {
  const { User, Post } = models;
  const sequelize = User.sequelize;
  const since = new Date(now.getTime() - DEFAULT_ACTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [totalUsers, totalPosts, regularPosts, marketPosts, userActionColumns, postColumns, recentRuns] =
    await Promise.all([
      User.count(),
      Post.count(),
      Post.count({ where: { type: "regular" } }),
      Post.count({ where: { type: "market" } }),
      getTableColumns(sequelize, "user_actions"),
      getTableColumns(sequelize, "posts"),
      listSimulationRunsFn({ models, limit: 20 }).catch(() => []),
    ]);

  const actionTimeColumn = userActionColumns.has("occurred_at")
    ? "occurred_at"
    : userActionColumns.has("created_at")
      ? "created_at"
      : null;
  const hasActionType = userActionColumns.has("action_type");
  const hasSessionId = userActionColumns.has("session_id");
  const hasMetadataJson = userActionColumns.has("metadata_json");

  const actions7dRows = hasActionType && actionTimeColumn
    ? await sequelize.query(
        `
          SELECT
            action_type AS "actionType",
            COUNT(*)::bigint AS count
          FROM user_actions
          WHERE ${actionTimeColumn} >= :since
          GROUP BY action_type;
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { since },
        }
      )
    : [];

  const coverageRows = hasActionType
    ? await sequelize.query(
        `
          WITH feed_events AS (
            SELECT
              ${hasSessionId ? "session_id" : "NULL::UUID AS session_id"},
              ${hasMetadataJson ? "NULLIF(BTRIM(metadata_json ->> 'requestId'), '') AS request_id" : "NULL::TEXT AS request_id"}
            FROM user_actions
            WHERE action_type IN (:feedActions)
          )
          SELECT
            COUNT(*)::bigint AS total_events,
            COUNT(*) FILTER (WHERE session_id IS NOT NULL)::bigint AS with_session_id,
            COUNT(*) FILTER (WHERE request_id IS NOT NULL)::bigint AS with_request_id
          FROM feed_events;
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            feedActions: FEED_ACTIONS,
          },
        }
      )
    : [{ total_events: 0, with_session_id: 0, with_request_id: 0 }];

  const topStyleTags = postColumns.has("style_tags")
    ? await sequelize.query(
        `
          SELECT
            tag AS value,
            COUNT(*)::bigint AS count
          FROM posts p
          CROSS JOIN LATERAL UNNEST(COALESCE(p.style_tags, ARRAY[]::TEXT[])) AS tag
          WHERE BTRIM(tag) <> ''
          GROUP BY tag
          ORDER BY count DESC, tag ASC
          LIMIT 10;
        `,
        { type: QueryTypes.SELECT }
      )
    : [];

  const topColorTags = postColumns.has("color_tags")
    ? await sequelize.query(
        `
          SELECT
            tag AS value,
            COUNT(*)::bigint AS count
          FROM posts p
          CROSS JOIN LATERAL UNNEST(COALESCE(p.color_tags, ARRAY[]::TEXT[])) AS tag
          WHERE BTRIM(tag) <> ''
          GROUP BY tag
          ORDER BY count DESC, tag ASC
          LIMIT 10;
        `,
        { type: QueryTypes.SELECT }
      )
    : [];

  const coverage = coverageRows?.[0] || {};
  const totalFeedEvents = parseCount(coverage.total_events);
  const withSession = parseCount(coverage.with_session_id);
  const withRequestId = parseCount(coverage.with_request_id);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: DEFAULT_ACTION_WINDOW_DAYS,
    counts: {
      users: totalUsers,
      posts: totalPosts,
      postsByType: {
        regular: regularPosts,
        market: marketPosts,
      },
    },
    actions7d: actions7dRows
      .map((row) => ({
        actionType: row.actionType,
        count: parseCount(row.count),
      }))
      .sort((a, b) => b.count - a.count || a.actionType.localeCompare(b.actionType)),
    telemetryCoverage: {
      totalFeedEvents,
      withSessionId: withSession,
      withRequestId,
      sessionIdCoveragePct: pct(withSession, totalFeedEvents),
      requestIdCoveragePct: pct(withRequestId, totalFeedEvents),
    },
    topTags: {
      style: topStyleTags.map((row) => ({
        value: row.value,
        count: parseCount(row.count),
      })),
      color: topColorTags.map((row) => ({
        value: row.value,
        count: parseCount(row.count),
      })),
    },
    recentRuns: (Array.isArray(recentRuns) ? recentRuns : []).slice(0, 20),
  };
}

function buildAdminRouter({
  getModelsFn = getModels,
  authMiddlewareFn = authMiddleware,
  adminMiddlewareFn = requireAdminMiddleware,
  buildRecommendationSimulationFn = buildRecommendationSimulation,
  createSimulationRunFn = createSimulationRun,
  listSimulationRunsFn = listSimulationRuns,
  getSimulationRunByIdFn = getSimulationRunById,
  getActiveConfigFn = getActiveConfig,
  listConfigHistoryFn = listConfigHistory,
  applyConfigFn = applyConfig,
  rollbackConfigFn = rollbackConfig,
  mergeConfigFn = mergeConfig,
} = {}) {
  const router = express.Router();

  async function runAndPersistSimulation({ req, models, mode, params, candidateConfig }) {
    const startedAt = Date.now();
    const simulation = await buildRecommendationSimulationFn({
      models,
      mode,
      params,
      days: params?.days,
      type: params?.type,
      k: params?.k,
      candidateConfig,
    });
    const durationMs = Date.now() - startedAt;

    let run = null;
    try {
      run = await createSimulationRunFn({
        models,
        mode: simulation?.mode || mode,
        params: simulation?.params || params,
        resultSummary: {
          ...summarizeSimulationResult(simulation),
          durationMs,
        },
        candidateConfig: simulation?.candidateConfig || candidateConfig || null,
        createdBy: req.user?.id || null,
      });
    } catch (err) {
      console.warn("Failed to persist recommendation simulation run:", err);
    }

    return { simulation, runId: run?.id || null, durationMs };
  }

  router.get(
    "/recommendations/overview",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (_req, res) => {
      try {
        const models = getModelsFn();
        const overview = await buildRecommendationsOverview({
          models,
          listSimulationRunsFn,
        });
        return res.json({ overview });
      } catch (err) {
        console.error("Admin recommendations overview failed:", err);
        return res.status(500).json({ message: "Failed to load admin recommendation overview." });
      }
    }
  );

  router.get(
    "/recommendations/simulate",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (req, res) => {
      const query = parseSimulationQuery(req.query);
      if (!query.valid) {
        return res.status(400).json({ message: query.message });
      }

      try {
        const models = getModelsFn();
        const active = await getActiveConfigFn({ models });
        const { simulation, runId, durationMs } = await runAndPersistSimulation({
          req,
          models,
          mode: query.mode,
          params: query.params,
          candidateConfig: active?.config || null,
        });
        console.info(
          `[admin-recommendations] mode=${query.mode} runId=${runId || "none"} durationMs=${durationMs}`
        );
        return res.json({ simulation, runId });
      } catch (err) {
        console.error("Admin recommendations simulation failed:", err);
        return res.status(500).json({ message: "Failed to run recommendation simulation." });
      }
    }
  );

  router.post(
    "/recommendations/simulate",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (req, res) => {
      const payload = parseSimulationPayload(req.body);
      if (!payload.valid) {
        return res.status(400).json({ message: payload.message || "Invalid simulation payload." });
      }

      try {
        const models = getModelsFn();
        const active = await getActiveConfigFn({ models });
        const candidateConfig = mergeConfigFn(active?.config || {}, payload.candidateConfigOverrides || {});
        const { simulation, runId, durationMs } = await runAndPersistSimulation({
          req,
          models,
          mode: payload.mode,
          params: payload.params,
          candidateConfig,
        });
        console.info(
          `[admin-recommendations] mode=${payload.mode} runId=${runId || "none"} durationMs=${durationMs}`
        );
        return res.json({ simulation, runId });
      } catch (err) {
        console.error("Admin recommendations simulation failed:", err);
        return res.status(500).json({ message: "Failed to run recommendation simulation." });
      }
    }
  );

  router.get(
    "/recommendations/runs",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (req, res) => {
      const fromDate = parseIsoDate(req.query?.from);
      if (!fromDate.valid) return res.status(400).json({ message: fromDate.message });

      const toDate = parseIsoDate(req.query?.to);
      if (!toDate.valid) return res.status(400).json({ message: toDate.message });

      if (fromDate.date && toDate.date && fromDate.date > toDate.date) {
        return res.status(400).json({ message: "from must be less than or equal to to." });
      }

      try {
        const models = getModelsFn();
        const rawMode = typeof req.query?.mode === "string" ? req.query.mode.trim().toLowerCase() : "";
        const mode = rawMode === "replay" || rawMode === "synthetic" ? rawMode : null;
        const rawTrack = typeof req.query?.track === "string" ? req.query.track.trim().toLowerCase() : "";
        const track = ALLOWED_TRACKS.includes(rawTrack) ? rawTrack : null;
        const runs = await listSimulationRunsFn({
          models,
          mode,
          track,
          from: fromDate.date,
          to: toDate.date,
          limit: parseHistoryLimit(req.query?.limit),
        });
        return res.json({ runs });
      } catch (err) {
        console.error("Admin recommendation run history failed:", err);
        return res.status(500).json({ message: "Failed to load recommendation run history." });
      }
    }
  );

  router.get(
    "/recommendations/runs/:runId",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (req, res) => {
      const runId = normalizeOptionalString(req.params?.runId, 64);
      if (!runId) {
        return res.status(400).json({ message: "runId is required." });
      }

      try {
        const models = getModelsFn();
        const run = await getSimulationRunByIdFn({
          models,
          id: runId,
        });
        if (!run) {
          return res.status(404).json({ message: "Simulation run not found." });
        }
        return res.json({ run });
      } catch (err) {
        console.error("Admin recommendation run detail failed:", err);
        return res.status(500).json({ message: "Failed to load recommendation run detail." });
      }
    }
  );

  router.get(
    "/recommendations/schema-health",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (_req, res) => {
      try {
        const models = getModelsFn();
        const schemaHealth = await inspectFeatureSchemaHealth({ models });
        return res.json({ schemaHealth });
      } catch (err) {
        console.error("Admin recommendation schema health failed:", err);
        return res.status(500).json({ message: "Failed to load schema health diagnostics." });
      }
    }
  );

  router.get(
    "/recommendations/config/active",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (_req, res) => {
      try {
        const models = getModelsFn();
        const activeConfig = await getActiveConfigFn({ models });
        return res.json({ activeConfig });
      } catch (err) {
        console.error("Admin recommendation active config fetch failed:", err);
        return res.status(500).json({ message: "Failed to load active recommendation config." });
      }
    }
  );

  router.get(
    "/recommendations/config/history",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (req, res) => {
      try {
        const models = getModelsFn();
        const history = await listConfigHistoryFn({
          models,
          scope: normalizeOptionalString(req.query?.scope, 100) || DEFAULT_SCOPE,
          limit: parseHistoryLimit(req.query?.limit),
        });
        return res.json({ history });
      } catch (err) {
        console.error("Admin recommendation config history fetch failed:", err);
        return res.status(500).json({ message: "Failed to load recommendation config history." });
      }
    }
  );

  router.post(
    "/recommendations/config/apply",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (req, res) => {
      const payload = parseConfigApplyPayload(req.body);
      if (!payload.valid) {
        return res.status(400).json({ message: payload.message });
      }

      try {
        const models = getModelsFn();
        const active = await getActiveConfigFn({ models, scope: payload.scope });
        const configToApply = payload.config
          ? payload.config
          : mergeConfigFn(active?.config || {}, payload.candidateConfigOverrides);

        const applied = await applyConfigFn({
          models,
          scope: payload.scope,
          config: configToApply,
          createdBy: req.user?.id || null,
          source: payload.sourceRunId ? "simulation" : "manual",
          sourceRunId: payload.sourceRunId,
          notes: payload.notes,
        });
        return res.json({ config: applied });
      } catch (err) {
        console.error("Admin recommendation config apply failed:", err);
        return res.status(400).json({ message: err.message || "Failed to apply recommendation config." });
      }
    }
  );

  router.post(
    "/recommendations/config/rollback",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (req, res) => {
      const payload = parseConfigRollbackPayload(req.body);
      if (!payload.valid) {
        return res.status(400).json({ message: payload.message });
      }

      try {
        const models = getModelsFn();
        const rolledBack = await rollbackConfigFn({
          models,
          scope: payload.scope,
          createdBy: req.user?.id || null,
          notes: payload.notes,
        });
        return res.json({ config: rolledBack });
      } catch (err) {
        console.error("Admin recommendation config rollback failed:", err);
        return res.status(400).json({ message: err.message || "Failed to rollback recommendation config." });
      }
    }
  );

  return router;
}

module.exports = buildAdminRouter();
module.exports.buildAdminRouter = buildAdminRouter;
module.exports.buildRecommendationsOverview = buildRecommendationsOverview;
module.exports.parseConfigApplyPayload = parseConfigApplyPayload;
module.exports.parseConfigRollbackPayload = parseConfigRollbackPayload;
module.exports.parseSimulationPayload = parseSimulationPayload;
module.exports.parseSimulationQuery = parseSimulationQuery;
