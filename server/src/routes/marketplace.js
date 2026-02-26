const express = require("express");
const { Op, fn, col, literal } = require("sequelize");
const { getModels } = require("../models");
const { optionalAuthMiddleware } = require("../middleware/auth");
const {
  fetchChronologicalRecommendations,
  fetchHybridRecommendations,
} = require("../services/recommendations");
const { logUserActionSafe } = require("../services/actionLogger");

const router = express.Router();

const DEFAULT_RECOMMENDED_LIMIT = 12;
const DEFAULT_POPULAR_LIMIT = 12;
const DEFAULT_SEARCH_LIMIT = 24;
const MAX_LIMIT = 60;
const MAX_QUERY_LENGTH = 80;
const MIN_QUERY_LENGTH = 2;
const MAX_ANALYTICS_EVENTS = 100;

const MARKETPLACE_ANALYTICS_ACTIONS = new Set([
  "marketplace_tab_click",
  "marketplace_carousel_nav",
  "marketplace_item_click",
  "marketplace_search_query",
]);

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeQuery(rawQuery) {
  if (typeof rawQuery !== "string") return "";
  return rawQuery.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

function normalizeToken(rawValue) {
  if (typeof rawValue !== "string") return null;
  const normalized = rawValue.trim().toLowerCase();
  return normalized || null;
}

function normalizePriceCents(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function parseOccurredAt(value) {
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) return new Date();
  return occurredAt;
}

async function buildLikeCountMap({ Like, postIds }) {
  const filteredPostIds = Array.isArray(postIds)
    ? [...new Set(postIds.filter((id) => typeof id === "string" && id.trim()))]
    : [];
  if (!filteredPostIds.length) return new Map();

  const likeRows = await Like.findAll({
    where: { postId: { [Op.in]: filteredPostIds } },
    attributes: [
      "postId",
      [fn("COUNT", col("id")), "likeCount"],
    ],
    group: ["postId"],
    raw: true,
  });

  const likeCountMap = new Map();
  for (const row of likeRows) {
    likeCountMap.set(row.postId, Number.parseInt(row.likeCount, 10) || 0);
  }
  return likeCountMap;
}

function toListing(post, likeCountMap) {
  const title = (post?.caption || "").trim();
  const fallbackTitle = title ? title.slice(0, 120) : "Untitled listing";
  const mappedLikeCount = likeCountMap instanceof Map
    ? Number(likeCountMap.get(post.id) || 0)
    : Number.parseInt(post?.likeCount, 10) || 0;

  return {
    id: post.id,
    type: post.type,
    title: fallbackTitle,
    caption: post.caption || "",
    imageUrl: post.imageUrl || null,
    imageUrls:
      Array.isArray(post.imageUrls) && post.imageUrls.length > 0
        ? post.imageUrls
        : post.imageUrl
          ? [post.imageUrl]
          : [],
    priceCents: Number.isFinite(post.priceCents) ? post.priceCents : null,
    category: post.category || "unknown",
    condition: post.condition || "unknown",
    isSold: Boolean(post.isSold),
    createdAt: post.createdAt,
    likeCount: mappedLikeCount,
    seller: post.author
      ? {
          id: post.author.id,
          username: post.author.username,
          name: post.author.name,
          profilePicture: post.author.profilePicture || null,
        }
      : null,
    // Location is not currently modeled on posts/authors; keep explicit null in payload.
    location: null,
  };
}

function buildPagination({ limit, offset, hasMore, nextOffset }) {
  const resolvedHasMore = Boolean(hasMore);
  return {
    limit,
    offset,
    hasMore: resolvedHasMore,
    nextOffset: resolvedHasMore
      ? Number.isFinite(nextOffset)
        ? nextOffset
        : offset + limit
      : null,
  };
}

router.get("/recommended", optionalAuthMiddleware, async (req, res) => {
  const models = getModels();
  const limit = clamp(toInt(req.query.limit, DEFAULT_RECOMMENDED_LIMIT), 1, MAX_LIMIT);
  const offset = clamp(toInt(req.query.offset, 0), 0, 10000);
  const userId = req.user?.id || null;

  try {
    let recommendationResult;

    if (userId) {
      try {
        recommendationResult = await fetchHybridRecommendations({
          models,
          type: "market",
          limit,
          offset,
          userId,
        });
      } catch (hybridErr) {
        console.error("Marketplace recommended hybrid fetch failed, falling back:", hybridErr);
        recommendationResult = await fetchChronologicalRecommendations({
          models,
          type: "market",
          limit,
          offset,
          userId,
        });
      }
    } else {
      recommendationResult = await fetchChronologicalRecommendations({
        models,
        type: "market",
        limit,
        offset,
        userId: null,
      });
    }

    const posts = Array.isArray(recommendationResult?.posts) ? recommendationResult.posts : [];
    const likeCountMap = await buildLikeCountMap({
      Like: models.Like,
      postIds: posts.map((post) => post.id),
    });

    return res.json({
      items: posts.map((post) => toListing(post, likeCountMap)),
      algorithm: recommendationResult?.algorithm || "chronological_fallback",
      personalized: Boolean(userId && recommendationResult?.personalized),
      pagination: buildPagination({
        limit,
        offset,
        hasMore: recommendationResult?.hasMore,
        nextOffset: recommendationResult?.nextOffset,
      }),
    });
  } catch (err) {
    console.error("Marketplace recommended fetch failed:", err);
    return res.status(500).json({ message: "Failed to load recommended marketplace listings." });
  }
});

router.get("/popular", optionalAuthMiddleware, async (req, res) => {
  const { Post, User, Like } = getModels();
  const limit = clamp(toInt(req.query.limit, DEFAULT_POPULAR_LIMIT), 1, MAX_LIMIT);
  const offset = clamp(toInt(req.query.offset, 0), 0, 10000);
  const userId = req.user?.id || null;

  try {
    const where = {
      type: "market",
      isPublic: true,
      isSold: false,
    };
    if (userId) {
      where.userId = { [Op.ne]: userId };
    }

    const rows = await Post.findAll({
      where,
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
        {
          model: Like,
          as: "likes",
          attributes: [],
        },
      ],
      attributes: {
        include: [[fn("COUNT", col("likes.id")), "likeCount"]],
      },
      group: ["Post.id", "author.id"],
      order: [
        [literal("COUNT(\"likes\".\"id\")"), "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: limit + 1,
      offset,
      subQuery: false,
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => toListing(row.toJSON()));

    return res.json({
      items,
      pagination: buildPagination({
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      }),
    });
  } catch (err) {
    console.error("Marketplace popular fetch failed:", err);
    return res.status(500).json({ message: "Failed to load popular marketplace listings." });
  }
});

router.get("/search", optionalAuthMiddleware, async (req, res) => {
  const { Post, User, Like } = getModels();
  const limit = clamp(toInt(req.query.limit, DEFAULT_SEARCH_LIMIT), 1, MAX_LIMIT);
  const offset = clamp(toInt(req.query.offset, 0), 0, 10000);
  const query = normalizeQuery(req.query.q);
  const category = normalizeToken(req.query.category);
  const condition = normalizeToken(req.query.condition);
  const minPriceCents = normalizePriceCents(req.query.minPrice);
  const maxPriceCents = normalizePriceCents(req.query.maxPrice);
  const userId = req.user?.id || null;

  const hasValidSearchQuery = query.length >= MIN_QUERY_LENGTH;
  const hasFilters = Boolean(category || condition || minPriceCents !== null || maxPriceCents !== null);

  if (!hasValidSearchQuery && !hasFilters) {
    return res.json({
      query,
      items: [],
      pagination: buildPagination({ limit, offset, hasMore: false, nextOffset: null }),
    });
  }

  try {
    const where = {
      type: "market",
      isPublic: true,
      isSold: false,
    };

    if (userId) {
      where.userId = { [Op.ne]: userId };
    }

    if (category) {
      where.category = category;
    }

    if (condition) {
      where.condition = condition;
    }

    if (minPriceCents !== null || maxPriceCents !== null) {
      where.priceCents = {};
      if (minPriceCents !== null) where.priceCents[Op.gte] = minPriceCents;
      if (maxPriceCents !== null) where.priceCents[Op.lte] = maxPriceCents;
    }

    if (hasValidSearchQuery) {
      const pattern = `%${query.toLowerCase()}%`;
      where[Op.or] = [
        { caption: { [Op.iLike]: pattern } },
        { brand: { [Op.iLike]: pattern } },
        { category: { [Op.iLike]: pattern } },
        { subcategory: { [Op.iLike]: pattern } },
        { "$author.username$": { [Op.iLike]: pattern } },
        { "$author.name$": { [Op.iLike]: pattern } },
      ];
    }

    const rows = await Post.findAll({
      where,
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limit + 1,
      offset,
      subQuery: false,
    });

    const hasMore = rows.length > limit;
    const visibleRows = rows.slice(0, limit);
    const likeCountMap = await buildLikeCountMap({
      Like,
      postIds: visibleRows.map((row) => row.id),
    });

    return res.json({
      query,
      items: visibleRows.map((row) => toListing(row.toJSON(), likeCountMap)),
      pagination: buildPagination({
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      }),
    });
  } catch (err) {
    console.error("Marketplace search failed:", err);
    return res.status(500).json({ message: "Failed to search marketplace listings." });
  }
});

router.post("/analytics", optionalAuthMiddleware, async (req, res) => {
  const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!rawEvents.length) {
    return res.status(400).json({ message: "events array is required." });
  }

  if (!req.user?.id) {
    return res.status(202).json({
      acceptedCount: 0,
      droppedCount: rawEvents.length,
      anonymous: true,
    });
  }

  const events = rawEvents.slice(0, MAX_ANALYTICS_EVENTS);
  let acceptedCount = 0;
  let droppedCount = rawEvents.length > MAX_ANALYTICS_EVENTS
    ? rawEvents.length - MAX_ANALYTICS_EVENTS
    : 0;

  try {
    for (const event of events) {
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        droppedCount += 1;
        continue;
      }

      const actionType = normalizeToken(event.actionType);
      if (!actionType || !MARKETPLACE_ANALYTICS_ACTIONS.has(actionType)) {
        droppedCount += 1;
        continue;
      }

      const targetIdCandidate = event.targetId ?? event.postId ?? actionType;
      const targetId = typeof targetIdCandidate === "string" && targetIdCandidate.trim()
        ? targetIdCandidate.trim().slice(0, 120)
        : actionType;

      const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? event.metadata
        : {};
      const query = normalizeQuery(event.query ?? metadata.query);
      const occurredAt = parseOccurredAt(event.occurredAt);

      const wrote = await logUserActionSafe({
        req,
        userId: req.user.id,
        actionType,
        targetType: "marketplace",
        targetId,
        metadata: {
          ...metadata,
          query,
          section: normalizeToken(event.section ?? metadata.section),
          postId:
            typeof (event.postId ?? metadata.postId) === "string"
              ? String(event.postId ?? metadata.postId).trim() || null
              : null,
        },
        occurredAt,
      });

      if (wrote) acceptedCount += 1;
      else droppedCount += 1;
    }

    return res.status(202).json({ acceptedCount, droppedCount });
  } catch (err) {
    console.error("Marketplace analytics logging failed:", err);
    return res.status(500).json({ message: "Failed to store marketplace analytics events." });
  }
});

module.exports = router;
