const express = require("express");
const { QueryTypes } = require("sequelize");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const requireAdminMiddleware = require("../middleware/admin");

const FEED_ACTIONS = ["feed_impression", "feed_click", "feed_dwell"];
const DEFAULT_ACTION_WINDOW_DAYS = 7;

function pct(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function parseCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
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

async function buildRecommendationsOverview({ models, now = new Date() }) {
  const { User, Post } = models;
  const sequelize = User.sequelize;
  const since = new Date(now.getTime() - DEFAULT_ACTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [totalUsers, totalPosts, regularPosts, marketPosts, userActionColumns, postColumns] = await Promise.all([
    User.count(),
    Post.count(),
    Post.count({ where: { type: "regular" } }),
    Post.count({ where: { type: "market" } }),
    getTableColumns(sequelize, "user_actions"),
    getTableColumns(sequelize, "posts"),
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
  };
}

function buildAdminRouter({
  getModelsFn = getModels,
  authMiddlewareFn = authMiddleware,
  adminMiddlewareFn = requireAdminMiddleware,
} = {}) {
  const router = express.Router();

  router.get(
    "/recommendations/overview",
    authMiddlewareFn,
    adminMiddlewareFn,
    async (_req, res) => {
      try {
        const models = getModelsFn();
        const overview = await buildRecommendationsOverview({ models });
        return res.json({ overview });
      } catch (err) {
        console.error("Admin recommendations overview failed:", err);
        return res.status(500).json({ message: "Failed to load admin recommendation overview." });
      }
    }
  );

  return router;
}

module.exports = buildAdminRouter();
module.exports.buildAdminRouter = buildAdminRouter;
module.exports.buildRecommendationsOverview = buildRecommendationsOverview;
