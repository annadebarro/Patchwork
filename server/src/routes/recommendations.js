const express = require("express");
const { randomUUID } = require("crypto");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const {
  normalizeRecommendationType,
  parseRecommendationPaging,
  fetchChronologicalRecommendations,
} = require("../services/recommendations");
const {
  ACTION_TYPES,
  buildRecommendationActionMetadata,
  logUserActionSafe,
} = require("../services/actionLogger");

const router = express.Router();
const FEED_TELEMETRY_ACTIONS = new Set([
  ACTION_TYPES.FEED_IMPRESSION,
  ACTION_TYPES.FEED_CLICK,
  ACTION_TYPES.FEED_DWELL,
]);
const MAX_TELEMETRY_EVENTS = 100;

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

router.get("/", authMiddleware, async (req, res) => {
  const rawType = req.query.type;
  const type = rawType ? normalizeRecommendationType(rawType) : null;
  if (rawType && !type) {
    return res.status(400).json({ message: "Type must be either 'regular' or 'market'." });
  }

  const { limit, offset } = parseRecommendationPaging(req.query);
  const requestId = randomUUID();

  try {
    const models = getModels();
    const result = await fetchChronologicalRecommendations({
      models,
      type,
      limit,
      offset,
      userId: req.user.id,
    });

    return res.json({
      algorithm: "chronological_fallback",
      personalized: false,
      requestId,
      posts: result.posts,
      pagination: {
        limit,
        offset,
        hasMore: result.hasMore,
        nextOffset: result.hasMore ? offset + result.posts.length : null,
      },
    });
  } catch (err) {
    console.error("Recommendation fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch recommendations." });
  }
});

router.post("/telemetry", authMiddleware, async (req, res) => {
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

      const wrote = await logUserActionSafe({
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

module.exports = router;
