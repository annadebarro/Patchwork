"use strict";

const { Op } = require("sequelize");
const {
  DEFAULT_LIMIT_PER_TYPE,
  DEFAULT_RECOMMENDATION_CONFIG,
  buildUserPreferenceProfile,
  fetchCandidatePools,
  fetchUserNoveltyExclusions,
  getEffectiveConfig,
  scoreRegularPost,
  scoreMarketPost,
  blendAndDiversify,
} = require("./recommendationEngine");
const { getActiveConfig } = require("./recommendationConfig");

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_DEBUG_TOP_N = 20;

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRecommendationType(rawType) {
  if (!rawType) return null;
  const value = String(rawType).toLowerCase();
  if (value === "regular" || value === "market") return value;
  return null;
}

function parseRecommendationPaging(query) {
  return {
    limit: clamp(toInt(query?.limit, DEFAULT_LIMIT), 1, MAX_LIMIT),
    offset: clamp(toInt(query?.offset, 0), 0, 10000),
  };
}

function roundMetric(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

function buildDebugTopScored(scoredEntries, topN) {
  const safeTopN = clamp(Number.parseInt(topN, 10) || 0, 0, MAX_DEBUG_TOP_N);
  if (!safeTopN) return [];

  return (scoredEntries || []).slice(0, safeTopN).map((entry, index) => ({
    rank: index + 1,
    postId: entry?.post?.id || null,
    authorId: entry?.post?.author?.id || null,
    type: entry?.type || entry?.post?.type || null,
    score: roundMetric(entry?.score, 6),
    components: Object.fromEntries(
      Object.entries(entry?.components || {}).map(([key, value]) => [key, roundMetric(value, 6)])
    ),
    weights: Object.fromEntries(
      Object.entries(entry?.weights || {}).map(([key, value]) => [key, roundMetric(value, 6)])
    ),
    diagnostics: {
      coldStartMode: Boolean(entry?.diagnostics?.coldStartMode),
      historyConfidence: roundMetric(entry?.diagnostics?.historyConfidence, 6),
      regularSignalStrength: roundMetric(entry?.diagnostics?.regularSignalStrength, 6),
      marketSignalStrength: roundMetric(entry?.diagnostics?.marketSignalStrength, 6),
    },
  }));
}

async function resolveRuntimeConfig(models) {
  try {
    const activeConfig = await getActiveConfig({ models });
    if (activeConfig?.config && typeof activeConfig.config === "object") {
      return {
        config: getEffectiveConfig(activeConfig.config),
        version: Number(activeConfig.version || 0),
      };
    }
  } catch (err) {
    console.warn("Recommendation config load failed. Falling back to defaults.", err);
  }

  return {
    config: getEffectiveConfig(DEFAULT_RECOMMENDATION_CONFIG),
    version: 0,
  };
}

async function fetchChronologicalRecommendations({ models, type, limit, offset, userId }) {
  const runtimeConfig = await resolveRuntimeConfig(models);
  const where = { isPublic: true };
  if (type) where.type = type;
  if (userId) {
    where.userId = { [Op.ne]: userId };
  }
  if (type === "market") {
    where.isSold = false;
  } else if (!type) {
    where[Op.or] = [
      { type: "regular" },
      {
        type: "market",
        isSold: false,
      },
    ];
  }

  if (userId) {
    const novelty = await fetchUserNoveltyExclusions({
      models,
      userId,
      config: runtimeConfig.config,
    });
    if (novelty.excludedPostIds.length > 0) {
      where.id = { [Op.notIn]: novelty.excludedPostIds };
    }
  }

  const rows = await models.Post.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: limit + 1,
    offset,
    include: [
      {
        model: models.User,
        as: "author",
        attributes: ["id", "username", "name", "profilePicture"],
      },
    ],
  });

  return {
    algorithm: "chronological_fallback",
    personalized: false,
    posts: rows.slice(0, limit),
    hasMore: rows.length > limit,
    timings: {
      profileMs: 0,
      candidateFetchMs: 0,
      scoringMs: 0,
      totalMs: 0,
    },
  };
}

async function fetchHybridRecommendations({
  models,
  type,
  limit,
  offset,
  userId,
  now = new Date(),
  debugTopN = 0,
}) {
  const totalStartMs = Date.now();
  const runtimeConfig = await resolveRuntimeConfig(models);

  const profileStartMs = Date.now();
  const [profile, novelty] = await Promise.all([
    buildUserPreferenceProfile({
      models,
      userId,
      now,
      config: runtimeConfig.config,
    }),
    fetchUserNoveltyExclusions({
      models,
      userId,
      now,
      config: runtimeConfig.config,
    }),
  ]);
  const profileMs = Date.now() - profileStartMs;

  const neededWindowSize = offset + limit + 1;
  const dynamicPoolLimit = Math.max(
    runtimeConfig.config.pools?.defaultLimitPerType || DEFAULT_LIMIT_PER_TYPE,
    neededWindowSize + 50
  );

  const candidateStartMs = Date.now();
  const candidatePools = await fetchCandidatePools({
    models,
    userId,
    type,
    limitPerType: dynamicPoolLimit,
    followedAuthorIds: [...(profile?.followedAuthorSet || [])],
    excludePostIds: novelty.excludedPostIds,
    now,
    config: runtimeConfig.config,
  });
  const candidateFetchMs = Date.now() - candidateStartMs;

  const scoringStartMs = Date.now();
  const scoreContext = {
    profile,
    now,
    config: runtimeConfig.config,
  };

  const regularScored = candidatePools.regularCandidates.map((post) => scoreRegularPost(post, scoreContext));
  const marketScored = candidatePools.marketCandidates.map((post) => scoreMarketPost(post, scoreContext));

  const blended = blendAndDiversify({
    regularScored,
    marketScored,
    profile,
    requestedType: type,
    limit: neededWindowSize,
    config: runtimeConfig.config,
  });

  const pagedPosts = blended.posts.slice(offset, offset + limit);
  const hasMore = blended.posts.length > offset + limit;
  const scoringMs = Date.now() - scoringStartMs;

  return {
    algorithm: "hybrid_v1",
    personalized: true,
    posts: pagedPosts,
    hasMore,
    nextOffset: hasMore ? offset + pagedPosts.length : null,
    mix: blended.mix,
    configVersion: runtimeConfig.version,
    debug:
      Number(debugTopN) > 0
        ? {
            top: buildDebugTopScored(blended.scored, debugTopN),
            profile: {
              coldStartMode: Boolean(profile?.coldStartMode),
              relevantActionCount: Number(profile?.relevantActionCount || 0),
              marketShare: roundMetric(profile?.marketShare, 6),
              regularSignalStrength: roundMetric(profile?.regularSignalStrength, 6),
              marketSignalStrength: roundMetric(profile?.marketSignalStrength, 6),
              followedAuthorCount: profile?.followedAuthorSet?.size || 0,
              onboardingSeedBlend: roundMetric(profile?.onboardingSeedBlend, 6),
              onboardingBrandCount: Number(profile?.onboardingBrandCount || 0),
              onboardingRecognizedSizeCount: Number(profile?.onboardingRecognizedSizeCount || 0),
              onboardingCategorySeedCount: Number(profile?.onboardingCategorySeedCount || 0),
            },
          }
        : null,
    timings: {
      profileMs,
      candidateFetchMs,
      scoringMs,
      totalMs: Date.now() - totalStartMs,
    },
  };
}

module.exports = {
  normalizeRecommendationType,
  parseRecommendationPaging,
  fetchChronologicalRecommendations,
  fetchHybridRecommendations,
};
