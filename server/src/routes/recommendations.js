const express = require("express");
const { randomUUID } = require("crypto");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const {
  normalizeRecommendationType,
  parseRecommendationPaging,
  fetchChronologicalRecommendations,
  fetchHybridRecommendations,
} = require("../services/recommendations");
const {
  ACTION_TYPES,
  buildRecommendationActionMetadata,
  logUserActionSafe,
} = require("../services/actionLogger");

const FEED_TELEMETRY_ACTIONS = new Set([
  ACTION_TYPES.FEED_IMPRESSION,
  ACTION_TYPES.FEED_CLICK,
  ACTION_TYPES.FEED_DWELL,
]);
const MAX_TELEMETRY_EVENTS = 100;
const MAX_DEBUG_TOP_N = 20;

function parseOccurredAt(value) {
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) return new Date();
  return occurredAt;
}

function toTrimmedString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseDebugTopN(queryValue, isAdmin) {
  if (!isAdmin) return 0;
  const parsed = Number.parseInt(queryValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAX_DEBUG_TOP_N);
}

function toTimingLogString(timings = {}) {
  return [
    `profile=${Number(timings.profileMs || 0)}ms`,
    `candidates=${Number(timings.candidateFetchMs || 0)}ms`,
    `scoring=${Number(timings.scoringMs || 0)}ms`,
    `total=${Number(timings.totalMs || 0)}ms`,
  ].join(" ");
}

function buildRecommendationsRouter({
  getModelsFn = getModels,
  authMiddlewareFn = authMiddleware,
  fetchHybridFn = fetchHybridRecommendations,
  fetchChronologicalFn = fetchChronologicalRecommendations,
  logUserActionSafeFn = logUserActionSafe,
} = {}) {
  const router = express.Router();

  router.get("/", authMiddlewareFn, async (req, res) => {
    const rawType = req.query.type;
    const type = rawType ? normalizeRecommendationType(rawType) : null;
    if (rawType && !type) {
      return res.status(400).json({ message: "Type must be either 'regular' or 'market'." });
    }

    const { limit, offset } = parseRecommendationPaging(req.query);
    const debugTopN = parseDebugTopN(req.query?.debugTopN, req.user?.role === "admin");
    const requestId = randomUUID();

    let hybridError = null;

    try {
      const models = getModelsFn();
      const result = await fetchHybridFn({
        models,
        type,
        limit,
        offset,
        userId: req.user.id,
        debugTopN,
      });

      console.info(
        `[recommendations] algorithm=${result.algorithm} user=${req.user.id} type=${type || "all"} limit=${limit} offset=${offset} ${toTimingLogString(result.timings)}`
      );

      return res.json({
        algorithm: result.algorithm,
        personalized: result.personalized,
        requestId,
        posts: result.posts,
        pagination: {
          limit,
          offset,
          hasMore: Boolean(result.hasMore),
          nextOffset: result.nextOffset ?? (result.hasMore ? offset + result.posts.length : null),
        },
        ...(debugTopN > 0 && result.debug ? { debug: result.debug } : {}),
      });
    } catch (err) {
      hybridError = err;
      console.error("Recommendation hybrid fetch failed, falling back to chronological:", err);
    }

    try {
      const models = getModelsFn();
      const fallback = await fetchChronologicalFn({
        models,
        type,
        limit,
        offset,
        userId: req.user.id,
      });

      console.info(
        `[recommendations] algorithm=${fallback.algorithm} user=${req.user.id} type=${type || "all"} limit=${limit} offset=${offset} ${toTimingLogString(fallback.timings)}`
      );

      return res.json({
        algorithm: fallback.algorithm,
        personalized: fallback.personalized,
        requestId,
        posts: fallback.posts,
        pagination: {
          limit,
          offset,
          hasMore: Boolean(fallback.hasMore),
          nextOffset: fallback.hasMore ? offset + fallback.posts.length : null,
        },
        fallback: {
          active: true,
          reason: hybridError?.message || "hybrid_unavailable",
        },
      });
    } catch (fallbackErr) {
      console.error("Recommendation fallback fetch failed:", fallbackErr);
      return res.status(500).json({ message: "Failed to fetch recommendations." });
    }
  });

  router.post("/telemetry", authMiddlewareFn, async (req, res) => {
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!rawEvents.length) {
      return res.status(400).json({ message: "events array is required." });
    }

    const events = rawEvents.slice(0, MAX_TELEMETRY_EVENTS);
    let acceptedCount = 0;
    let droppedCount = rawEvents.length > MAX_TELEMETRY_EVENTS
      ? rawEvents.length - MAX_TELEMETRY_EVENTS
      : 0;

    try {
      for (const event of events) {
        if (!event || typeof event !== "object" || Array.isArray(event)) {
          droppedCount += 1;
          continue;
        }

        const actionTypeRaw = toTrimmedString(event.actionType);
        const actionType = actionTypeRaw ? actionTypeRaw.toLowerCase() : null;
        const postId = toTrimmedString(event.postId);

        if (!actionType || !postId || !FEED_TELEMETRY_ACTIONS.has(actionType)) {
          droppedCount += 1;
          continue;
        }

        const metadata = buildRecommendationActionMetadata({
          req,
          postId,
          metadata: {
            feedType: event.feedType,
            rankPosition: event.rankPosition,
            algorithm: event.algorithm,
            requestId: event.requestId,
            postId,
          },
        });

        if (actionType === ACTION_TYPES.FEED_DWELL) {
          const dwellMs = Number(event.dwellMs);
          if (Number.isFinite(dwellMs) && dwellMs >= 0) {
            metadata.dwellMs = Math.round(dwellMs);
          }
        }

        const wrote = await logUserActionSafeFn({
          req,
          userId: req.user.id,
          actionType,
          targetType: "post",
          targetId: postId,
          metadata,
          occurredAt: parseOccurredAt(event.occurredAt),
        });

        if (wrote) {
          acceptedCount += 1;
        } else {
          droppedCount += 1;
        }
      }

      return res.status(202).json({ acceptedCount, droppedCount });
    } catch (err) {
      console.error("Recommendation telemetry logging failed:", err);
      return res.status(500).json({ message: "Failed to store recommendation telemetry." });
    }
  });

  return router;
}

module.exports = buildRecommendationsRouter();
module.exports.buildRecommendationsRouter = buildRecommendationsRouter;
