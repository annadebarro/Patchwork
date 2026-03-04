"use strict";

const { Op, QueryTypes } = require("sequelize");

const UNKNOWN = "unknown";
const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_ACTION_SIGNAL_WEIGHTS = Object.freeze({
  user_follow: 3,
  post_patch_save: 3,
  post_like: 2,
  comment_create: 2,
  comment_like: 1,
  user_unfollow: -3,
  post_unlike: -2,
  comment_unlike: -1,
  feed_click: 0.5,
  feed_dwell: 0.25,
});

const DEFAULT_NOVELTY_ACTION_TYPES = Object.freeze([
  "feed_impression",
  "feed_click",
  "feed_dwell",
]);

const DEFAULT_NOVELTY_CONFIG = Object.freeze({
  excludeCurrentLikes: true,
  excludeCurrentPatches: true,
  seenCooldownDays: 7,
  maxSeenPostIds: 1000,
  seenActionTypes: DEFAULT_NOVELTY_ACTION_TYPES,
});

const DEFAULT_RECOMMENDATION_CONFIG = Object.freeze({
  version: "hybrid_v1",
  regularWeights: Object.freeze({
    followAff: 1.8,
    authorAff: 1.2,
    styleMatch: 1.0,
    colorMatch: 0.6,
    brandMatch: 0.6,
    engagementVelocity: 0.9,
    freshness: 0.8,
  }),
  marketWeights: Object.freeze({
    followAff: 1.6,
    authorAff: 1.0,
    categoryMatch: 1.0,
    brandMatch: 0.8,
    sizeMatch: 0.9,
    priceBandMatch: 0.8,
    conditionMatch: 0.7,
    engagementVelocity: 0.8,
    freshness: 0.7,
  }),
  freshnessHalfLifeDays: Object.freeze({
    regular: 7,
    market: 14,
  }),
  blend: Object.freeze({
    defaultMarketShare: 0.4,
    minMarketShare: 0.2,
    maxMarketShare: 0.8,
    minActionsForLearnedShare: 10,
  }),
  diversityCaps: Object.freeze([
    Object.freeze({ maxRankExclusive: 20, maxPerAuthor: 2 }),
    Object.freeze({ maxRankExclusive: 30, maxPerAuthor: 3 }),
  ]),
  pools: Object.freeze({
    defaultLimitPerType: 250,
    regularRecencyDays: 180,
    marketRecencyDays: 365,
    engagementWindowDays: 30,
    preferenceWindowDays: 90,
  }),
  novelty: DEFAULT_NOVELTY_CONFIG,
  actionSignalWeights: DEFAULT_ACTION_SIGNAL_WEIGHTS,
});
const ACTION_SIGNAL_WEIGHTS = DEFAULT_ACTION_SIGNAL_WEIGHTS;
const DEFAULT_MARKET_SHARE = DEFAULT_RECOMMENDATION_CONFIG.blend.defaultMarketShare;
const DEFAULT_LIMIT_PER_TYPE = DEFAULT_RECOMMENDATION_CONFIG.pools.defaultLimitPerType;
const COLD_START_ACTION_THRESHOLD = 8;
const FULL_HISTORY_ACTION_THRESHOLD = 28;
const FOLLOWED_AUTHOR_CANDIDATE_LIMIT = 150;
const MAX_FOLLOWED_AUTHOR_IDS = 300;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getEffectiveConfig(config) {
  const raw = config && typeof config === "object" ? config : {};

  const noveltyRaw =
    raw.novelty && typeof raw.novelty === "object" && !Array.isArray(raw.novelty)
      ? raw.novelty
      : {};
  const noveltyActionTypes = Array.isArray(noveltyRaw.seenActionTypes)
    ? [
        ...new Set(
          noveltyRaw.seenActionTypes
            .filter((value) => typeof value === "string" && value.trim())
            .map((value) => value.trim().toLowerCase())
        ),
      ]
    : [...DEFAULT_NOVELTY_ACTION_TYPES];

  const merged = {
    ...DEFAULT_RECOMMENDATION_CONFIG,
    regularWeights: {
      ...DEFAULT_RECOMMENDATION_CONFIG.regularWeights,
      ...(raw.regularWeights || {}),
    },
    marketWeights: {
      ...DEFAULT_RECOMMENDATION_CONFIG.marketWeights,
      ...(raw.marketWeights || {}),
    },
    freshnessHalfLifeDays: {
      ...DEFAULT_RECOMMENDATION_CONFIG.freshnessHalfLifeDays,
      ...(raw.freshnessHalfLifeDays || {}),
    },
    blend: {
      ...DEFAULT_RECOMMENDATION_CONFIG.blend,
      ...(raw.blend || {}),
    },
    pools: {
      ...DEFAULT_RECOMMENDATION_CONFIG.pools,
      ...(raw.pools || {}),
    },
    novelty: {
      ...DEFAULT_RECOMMENDATION_CONFIG.novelty,
      ...noveltyRaw,
      seenActionTypes: noveltyActionTypes.length > 0 ? noveltyActionTypes : [...DEFAULT_NOVELTY_ACTION_TYPES],
    },
    actionSignalWeights: {
      ...DEFAULT_RECOMMENDATION_CONFIG.actionSignalWeights,
      ...(raw.actionSignalWeights || {}),
    },
  };

  if (Array.isArray(raw.diversityCaps) && raw.diversityCaps.length > 0) {
    merged.diversityCaps = raw.diversityCaps.map((entry) => ({
      maxRankExclusive: Number(entry?.maxRankExclusive),
      maxPerAuthor: Number(entry?.maxPerAuthor),
    }));
  } else {
    merged.diversityCaps = [...DEFAULT_RECOMMENDATION_CONFIG.diversityCaps];
  }

  return merged;
}

function isUuidLike(value) {
  if (typeof value !== "string") return false;
  return UUID_LIKE_REGEX.test(value.trim());
}

function filterUuidLike(values) {
  return [
    ...new Set((values || []).filter((value) => isUuidLike(value)).map((value) => value.trim().toLowerCase())),
  ];
}

function normalizeToken(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function addToMap(map, key, delta) {
  if (!key || !Number.isFinite(delta) || delta === 0) return;
  map.set(key, (map.get(key) || 0) + delta);
}

function normalizeAffinityMap(rawMap) {
  const normalized = new Map();
  let maxValue = 0;

  for (const value of rawMap.values()) {
    if (value > maxValue) maxValue = value;
  }

  if (maxValue <= 0) return normalized;

  for (const [key, value] of rawMap.entries()) {
    if (value <= 0) continue;
    normalized.set(key, clamp(value / maxValue, 0, 1));
  }

  return normalized;
}

function getMapStrength(affinityMap) {
  if (!(affinityMap instanceof Map) || affinityMap.size === 0) return 0;

  let max = 0;
  let sum = 0;
  let count = 0;
  for (const value of affinityMap.values()) {
    const normalized = clamp(Number(value) || 0, 0, 1);
    if (normalized <= 0) continue;
    max = Math.max(max, normalized);
    sum += normalized;
    count += 1;
  }

  if (count === 0) return 0;
  const average = sum / count;
  const density = clamp(count / 6, 0, 1);
  return clamp((average * 0.6 + max * 0.4) * (0.55 + density * 0.45), 0, 1);
}

function getHistoryConfidence(profile) {
  const relevantActionCount = Number(profile?.relevantActionCount || 0);
  return clamp(relevantActionCount / FULL_HISTORY_ACTION_THRESHOLD, 0, 1);
}

function isColdStartProfile(profile) {
  const relevantActionCount = Number(profile?.relevantActionCount || 0);
  return relevantActionCount < COLD_START_ACTION_THRESHOLD;
}

function resolveRegularSignalStrength(profile) {
  if (Number.isFinite(Number(profile?.regularSignalStrength))) {
    return clamp(Number(profile.regularSignalStrength), 0, 1);
  }

  return clamp(
    getMapStrength(profile?.styleAffinity) * 0.35 +
      getMapStrength(profile?.colorAffinity) * 0.25 +
      getMapStrength(profile?.brandAffinity) * 0.2 +
      getMapStrength(profile?.authorAffinity) * 0.2,
    0,
    1
  );
}

function resolveMarketSignalStrength(profile) {
  if (Number.isFinite(Number(profile?.marketSignalStrength))) {
    return clamp(Number(profile.marketSignalStrength), 0, 1);
  }

  return clamp(
    getMapStrength(profile?.categoryAffinity) * 0.22 +
      getMapStrength(profile?.sizeAffinity) * 0.2 +
      getMapStrength(profile?.priceBandAffinity) * 0.2 +
      getMapStrength(profile?.conditionAffinity) * 0.18 +
      getMapStrength(profile?.brandAffinity) * 0.1 +
      getMapStrength(profile?.authorAffinity) * 0.1,
    0,
    1
  );
}

function buildRegularWeights(baseWeights, profile) {
  const historyConfidence = getHistoryConfidence(profile);
  const coldStartFactor = 1 - historyConfidence;
  const regularSignalStrength = resolveRegularSignalStrength(profile);
  const affinityScale = 0.35 + historyConfidence * 0.65;
  const velocityDampingFromAffinity = 1 - regularSignalStrength * 0.35;

  return {
    followAff: baseWeights.followAff * (1 + coldStartFactor * 0.12),
    authorAff: baseWeights.authorAff * affinityScale,
    styleMatch: baseWeights.styleMatch * affinityScale,
    colorMatch: baseWeights.colorMatch * affinityScale,
    brandMatch: baseWeights.brandMatch * affinityScale,
    engagementVelocity:
      baseWeights.engagementVelocity * (1 + coldStartFactor * 0.45) * velocityDampingFromAffinity,
    freshness: baseWeights.freshness * (1 + coldStartFactor * 0.25),
  };
}

function buildMarketWeights(baseWeights, profile) {
  const historyConfidence = getHistoryConfidence(profile);
  const marketSignalStrength = resolveMarketSignalStrength(profile);
  const marketShare = clamp(Number(profile?.marketShare || DEFAULT_MARKET_SHARE), 0, 1);

  // When market-specific history is weak, shift weight toward stable signals.
  const intentConfidence = clamp(marketSignalStrength * 0.75 + marketShare * 0.25, 0, 1);
  const lowIntentFactor = 1 - Math.min(historyConfidence, intentConfidence);
  const marketMatchScale = 0.15 + Math.min(historyConfidence, intentConfidence) * 0.85;

  return {
    followAff: baseWeights.followAff * (1 + lowIntentFactor * 0.3),
    authorAff: baseWeights.authorAff * (0.45 + historyConfidence * 0.55),
    categoryMatch: baseWeights.categoryMatch * marketMatchScale,
    brandMatch: baseWeights.brandMatch * (0.3 + Math.max(marketMatchScale, historyConfidence) * 0.7),
    sizeMatch: baseWeights.sizeMatch * marketMatchScale,
    priceBandMatch: baseWeights.priceBandMatch * marketMatchScale,
    conditionMatch: baseWeights.conditionMatch * marketMatchScale,
    engagementVelocity:
      baseWeights.engagementVelocity * (1 + lowIntentFactor * 0.5) * (1 - marketSignalStrength * 0.25),
    freshness: baseWeights.freshness * (1 + lowIntentFactor * 0.45),
  };
}

function pickPostIdFromAction(action) {
  if (action.targetType === "post" && action.targetId) {
    return String(action.targetId);
  }

  const metadataPostId = action?.metadataJson?.postId;
  if (typeof metadataPostId === "string" && metadataPostId.trim()) {
    return metadataPostId.trim();
  }

  return null;
}

function normalizeFeedType(value) {
  const normalized = normalizeToken(value);
  if (normalized === "regular" || normalized === "market") return normalized;
  return null;
}

function toPriceBand(priceCents) {
  const numeric = Number(priceCents);
  if (!Number.isFinite(numeric) || numeric <= 0) return UNKNOWN;
  if (numeric < 2500) return "budget";
  if (numeric < 7500) return "mid";
  if (numeric < 15000) return "premium";
  return "luxury";
}

function freshnessScore(createdAt, halfLifeDays, now = new Date()) {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 0;
  const ageMs = Math.max(0, now.getTime() - createdMs);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const decay = Math.exp((-Math.log(2) * ageDays) / halfLifeDays);
  return clamp(decay, 0, 1);
}

function averageTagAffinity(tags, affinityMap) {
  if (!Array.isArray(tags) || tags.length === 0) return 0;

  let sum = 0;
  let count = 0;
  for (const rawTag of tags) {
    const token = normalizeToken(rawTag);
    if (!token) continue;
    sum += affinityMap.get(token) || 0;
    count += 1;
  }

  return count > 0 ? clamp(sum / count, 0, 1) : 0;
}

function getMapValue(map, key) {
  if (!key) return 0;
  return clamp(map.get(key) || 0, 0, 1);
}

function buildAuthorCap(position, diversityCaps) {
  if (!Array.isArray(diversityCaps) || diversityCaps.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const sorted = [...diversityCaps]
    .filter((entry) => Number.isFinite(entry?.maxRankExclusive) && Number.isFinite(entry?.maxPerAuthor))
    .sort((a, b) => a.maxRankExclusive - b.maxRankExclusive);

  for (const entry of sorted) {
    if (position < entry.maxRankExclusive) {
      return entry.maxPerAuthor;
    }
  }

  return Number.POSITIVE_INFINITY;
}

function applyDiversityCaps(ranked, limit, diversityCaps) {
  const selected = [];
  const authorCounts = new Map();

  for (const candidate of ranked) {
    if (!candidate?.post?.author?.id) continue;

    const authorId = candidate.post.author.id;
    const currentCount = authorCounts.get(authorId) || 0;
    const cap = buildAuthorCap(selected.length, diversityCaps);

    if (currentCount >= cap) {
      continue;
    }

    selected.push(candidate);
    authorCounts.set(authorId, currentCount + 1);

    if (selected.length >= limit) {
      break;
    }
  }

  return {
    selected,
    hasMore: ranked.length > selected.length,
  };
}

function sortCandidatesDescending(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const aCreated = new Date(a.post?.createdAt || 0).getTime();
    const bCreated = new Date(b.post?.createdAt || 0).getTime();
    if (bCreated !== aCreated) return bCreated - aCreated;

    return String(a.post?.id || "").localeCompare(String(b.post?.id || ""));
  });
}

function buildInterleavedQueue(regularRanked, marketRanked, marketShare) {
  const queue = [];
  let regularIndex = 0;
  let marketIndex = 0;

  while (regularIndex < regularRanked.length || marketIndex < marketRanked.length) {
    const totalPlaced = regularIndex + marketIndex;
    const desiredMarketCount = (totalPlaced + 1) * marketShare;
    const shouldTakeMarket =
      (marketIndex < desiredMarketCount && marketIndex < marketRanked.length) ||
      regularIndex >= regularRanked.length;

    if (shouldTakeMarket && marketIndex < marketRanked.length) {
      queue.push(marketRanked[marketIndex]);
      marketIndex += 1;
      continue;
    }

    if (regularIndex < regularRanked.length) {
      queue.push(regularRanked[regularIndex]);
      regularIndex += 1;
      continue;
    }

    if (marketIndex < marketRanked.length) {
      queue.push(marketRanked[marketIndex]);
      marketIndex += 1;
    }
  }

  return queue;
}

function scoreRegularPost(post, context) {
  const config = getEffectiveConfig(context?.config);
  const profile = context.profile;
  const weights = buildRegularWeights(config.regularWeights, profile);
  const historyConfidence = getHistoryConfidence(profile);
  const authorId = post?.author?.id;

  const components = {
    followAff: profile.followedAuthorSet.has(authorId) ? 1 : 0,
    authorAff: getMapValue(profile.authorAffinity, authorId),
    styleMatch: averageTagAffinity(post.styleTags, profile.styleAffinity),
    colorMatch: averageTagAffinity(post.colorTags, profile.colorAffinity),
    brandMatch: getMapValue(profile.brandAffinity, normalizeToken(post.brand)),
    engagementVelocity: clamp(post._engagementVelocity || 0, 0, 1),
    freshness: freshnessScore(post.createdAt, config.freshnessHalfLifeDays.regular, context.now),
  };

  const score =
    weights.followAff * components.followAff +
    weights.authorAff * components.authorAff +
    weights.styleMatch * components.styleMatch +
    weights.colorMatch * components.colorMatch +
    weights.brandMatch * components.brandMatch +
    weights.engagementVelocity * components.engagementVelocity +
    weights.freshness * components.freshness;

  return {
    post,
    type: "regular",
    score,
    components,
    weights,
    diagnostics: {
      coldStartMode: isColdStartProfile(profile),
      historyConfidence,
      regularSignalStrength: resolveRegularSignalStrength(profile),
    },
  };
}

function scoreMarketPost(post, context) {
  const config = getEffectiveConfig(context?.config);
  const profile = context.profile;
  const weights = buildMarketWeights(config.marketWeights, profile);
  const historyConfidence = getHistoryConfidence(profile);
  const authorId = post?.author?.id;
  const priceBand = toPriceBand(post.priceCents);

  const components = {
    followAff: profile.followedAuthorSet.has(authorId) ? 1 : 0,
    authorAff: getMapValue(profile.authorAffinity, authorId),
    categoryMatch: getMapValue(profile.categoryAffinity, normalizeToken(post.category)),
    brandMatch: getMapValue(profile.brandAffinity, normalizeToken(post.brand)),
    sizeMatch: getMapValue(profile.sizeAffinity, normalizeToken(post.sizeLabel)),
    priceBandMatch: getMapValue(profile.priceBandAffinity, priceBand),
    conditionMatch: getMapValue(profile.conditionAffinity, normalizeToken(post.condition)),
    engagementVelocity: clamp(post._engagementVelocity || 0, 0, 1),
    freshness: freshnessScore(post.createdAt, config.freshnessHalfLifeDays.market, context.now),
  };

  const score =
    weights.followAff * components.followAff +
    weights.authorAff * components.authorAff +
    weights.categoryMatch * components.categoryMatch +
    weights.brandMatch * components.brandMatch +
    weights.sizeMatch * components.sizeMatch +
    weights.priceBandMatch * components.priceBandMatch +
    weights.conditionMatch * components.conditionMatch +
    weights.engagementVelocity * components.engagementVelocity +
    weights.freshness * components.freshness;

  return {
    post,
    type: "market",
    score,
    components,
    weights,
    diagnostics: {
      coldStartMode: isColdStartProfile(profile),
      historyConfidence,
      marketSignalStrength: resolveMarketSignalStrength(profile),
    },
  };
}

function blendAndDiversify({ regularScored, marketScored, profile, requestedType, limit, config }) {
  const effectiveConfig = getEffectiveConfig(config);
  const blendConfig = effectiveConfig.blend;
  const normalizedType = requestedType === "regular" || requestedType === "market" ? requestedType : null;
  const safeLimit = Math.max(1, Number(limit) || 1);

  const regularRanked = sortCandidatesDescending(regularScored || []);
  const marketRanked = sortCandidatesDescending(marketScored || []);

  if (normalizedType === "regular") {
    const { selected, hasMore } = applyDiversityCaps(regularRanked, safeLimit, effectiveConfig.diversityCaps);
    return {
      scored: selected,
      posts: selected.map((entry) => entry.post),
      hasMore,
      mix: { marketShare: 0, effectiveType: "regular" },
    };
  }

  if (normalizedType === "market") {
    const { selected, hasMore } = applyDiversityCaps(marketRanked, safeLimit, effectiveConfig.diversityCaps);
    return {
      scored: selected,
      posts: selected.map((entry) => entry.post),
      hasMore,
      mix: { marketShare: 1, effectiveType: "market" },
    };
  }

  const hasEnoughHistory = (profile.relevantActionCount || 0) >= blendConfig.minActionsForLearnedShare;
  const rawShare = hasEnoughHistory ? profile.marketShare : blendConfig.defaultMarketShare;
  const marketShare = clamp(
    Number.isFinite(rawShare) ? rawShare : blendConfig.defaultMarketShare,
    blendConfig.minMarketShare,
    blendConfig.maxMarketShare
  );

  const queue = buildInterleavedQueue(regularRanked, marketRanked, marketShare);
  const { selected, hasMore } = applyDiversityCaps(queue, safeLimit, effectiveConfig.diversityCaps);

  return {
    scored: selected,
    posts: selected.map((entry) => entry.post),
    hasMore,
    mix: {
      marketShare,
      effectiveType: "all",
    },
  };
}

async function buildEngagementVelocityByPostId({ models, postIds, now = new Date(), config }) {
  const effectiveConfig = getEffectiveConfig(config);
  const engagementWindowDays = effectiveConfig.pools.engagementWindowDays;
  const uniqueIds = filterUuidLike(postIds);
  if (!uniqueIds.length) return new Map();

  const since = new Date(now.getTime() - engagementWindowDays * 24 * 60 * 60 * 1000);
  const sequelize = models.Post.sequelize;

  const [likeRows, commentRows, patchRows] = await Promise.all([
    sequelize.query(
      `
        SELECT post_id AS "postId", COUNT(*)::bigint AS count
        FROM likes
        WHERE post_id IN (:postIds)
          AND created_at >= :since
        GROUP BY post_id;
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { postIds: uniqueIds, since },
      }
    ),
    sequelize.query(
      `
        SELECT post_id AS "postId", COUNT(*)::bigint AS count
        FROM comments
        WHERE post_id IN (:postIds)
          AND created_at >= :since
        GROUP BY post_id;
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { postIds: uniqueIds, since },
      }
    ),
    sequelize.query(
      `
        SELECT post_id AS "postId", COUNT(*)::bigint AS count
        FROM patches
        WHERE post_id IN (:postIds)
          AND created_at >= :since
        GROUP BY post_id;
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { postIds: uniqueIds, since },
      }
    ),
  ]);

  const totals = new Map();
  for (const id of uniqueIds) {
    totals.set(id, 0);
  }

  for (const row of likeRows) {
    totals.set(row.postId, (totals.get(row.postId) || 0) + Number(row.count || 0));
  }
  for (const row of commentRows) {
    totals.set(row.postId, (totals.get(row.postId) || 0) + Number(row.count || 0) * 1.5);
  }
  for (const row of patchRows) {
    totals.set(row.postId, (totals.get(row.postId) || 0) + Number(row.count || 0) * 2);
  }

  let maxLogValue = 0;
  const logTotals = new Map();
  for (const [postId, value] of totals.entries()) {
    const logValue = Math.log1p(Math.max(0, value));
    logTotals.set(postId, logValue);
    if (logValue > maxLogValue) maxLogValue = logValue;
  }

  const normalized = new Map();
  for (const [postId, logValue] of logTotals.entries()) {
    normalized.set(postId, maxLogValue > 0 ? clamp(logValue / maxLogValue, 0, 1) : 0);
  }

  return normalized;
}

async function fetchCandidatePools({
  models,
  userId,
  type,
  limitPerType,
  followedAuthorIds,
  excludePostIds,
  now = new Date(),
  config,
} = {}) {
  const effectiveConfig = getEffectiveConfig(config);
  const poolConfig = effectiveConfig.pools;
  const requestedType = type === "regular" || type === "market" ? type : null;
  const safeLimit = Math.max(
    1,
    Number(limitPerType) || Number(poolConfig.defaultLimitPerType) || DEFAULT_LIMIT_PER_TYPE
  );
  const excludedIds = filterUuidLike(excludePostIds);

  const regularWhere = {
    isPublic: true,
    userId: { [Op.ne]: userId },
    type: "regular",
    createdAt: {
      [Op.gte]: new Date(now.getTime() - poolConfig.regularRecencyDays * 24 * 60 * 60 * 1000),
    },
  };

  const marketWhere = {
    isPublic: true,
    isSold: false,
    userId: { [Op.ne]: userId },
    type: "market",
    createdAt: {
      [Op.gte]: new Date(now.getTime() - poolConfig.marketRecencyDays * 24 * 60 * 60 * 1000),
    },
  };

  if (excludedIds.length > 0) {
    regularWhere.id = { [Op.notIn]: excludedIds };
    marketWhere.id = { [Op.notIn]: excludedIds };
  }

  const include = [
    {
      model: models.User,
      as: "author",
      attributes: ["id", "username", "name", "profilePicture"],
    },
  ];

  const followedAuthorList = Array.isArray(followedAuthorIds)
    ? followedAuthorIds
        .filter((followeeId) => typeof followeeId === "string" && followeeId && followeeId !== userId)
        .slice(0, MAX_FOLLOWED_AUTHOR_IDS)
    : null;

  const [regularRows, marketRows, followRows] = await Promise.all([
    requestedType === "market"
      ? Promise.resolve([])
      : models.Post.findAll({
          where: regularWhere,
          order: [["createdAt", "DESC"]],
          include,
          limit: safeLimit,
        }),
    requestedType === "regular"
      ? Promise.resolve([])
      : models.Post.findAll({
          where: marketWhere,
          order: [["createdAt", "DESC"]],
          include,
          limit: safeLimit,
        }),
    followedAuthorList
      ? Promise.resolve([])
      : models?.Follow?.findAll && userId
      ? models.Follow.findAll({
          where: { followerId: userId },
          attributes: ["followeeId"],
          raw: true,
          limit: MAX_FOLLOWED_AUTHOR_IDS,
        })
      : Promise.resolve([]),
  ]);

  const resolvedFollowedAuthorIds = followedAuthorList || [
    ...new Set(
      (followRows || [])
        .map((row) => row.followeeId)
        .filter((followeeId) => typeof followeeId === "string" && followeeId && followeeId !== userId)
    ),
  ];

  const [regularBoostRows, marketBoostRows] = resolvedFollowedAuthorIds.length > 0
    ? await Promise.all([
        requestedType === "market"
          ? Promise.resolve([])
          : models.Post.findAll({
              where: {
                ...regularWhere,
                userId: { [Op.in]: resolvedFollowedAuthorIds },
              },
              order: [["createdAt", "DESC"]],
              include,
              limit: FOLLOWED_AUTHOR_CANDIDATE_LIMIT,
            }),
        requestedType === "regular"
          ? Promise.resolve([])
          : models.Post.findAll({
              where: {
                ...marketWhere,
                userId: { [Op.in]: resolvedFollowedAuthorIds },
              },
              order: [["createdAt", "DESC"]],
              include,
              limit: FOLLOWED_AUTHOR_CANDIDATE_LIMIT,
            }),
      ])
    : [[], []];

  function buildMergedCandidates(priorityRows, baseRows) {
    const merged = [];
    const seen = new Set();
    for (const row of [...priorityRows, ...baseRows]) {
      const candidate = row?.toJSON ? row.toJSON() : row;
      if (!candidate?.id || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      merged.push(candidate);
      if (merged.length >= safeLimit) break;
    }
    return merged;
  }

  const regularCandidates = buildMergedCandidates(regularBoostRows, regularRows);
  const marketCandidates = buildMergedCandidates(marketBoostRows, marketRows);

  const engagementMap = await buildEngagementVelocityByPostId({
    models,
    postIds: [...regularCandidates, ...marketCandidates].map((post) => post.id),
    now,
    config: effectiveConfig,
  });

  for (const candidate of regularCandidates) {
    candidate._engagementVelocity = engagementMap.get(candidate.id) || 0;
  }
  for (const candidate of marketCandidates) {
    candidate._engagementVelocity = engagementMap.get(candidate.id) || 0;
  }

  return {
    regularCandidates,
    marketCandidates,
  };
}

async function fetchUserNoveltyExclusions({ models, userId, now = new Date(), config } = {}) {
  const effectiveConfig = getEffectiveConfig(config);
  const noveltyConfig = effectiveConfig.novelty || DEFAULT_NOVELTY_CONFIG;
  if (!userId) {
    return {
      likedPostIdSet: new Set(),
      patchedPostIdSet: new Set(),
      seenPostIdSet: new Set(),
      excludedPostIdSet: new Set(),
      likedPostIds: [],
      patchedPostIds: [],
      seenPostIds: [],
      excludedPostIds: [],
    };
  }

  const [likeRows, patchRows, seenRows] = await Promise.all([
    noveltyConfig.excludeCurrentLikes && models?.Like?.findAll
      ? models.Like.findAll({
          where: { userId },
          attributes: ["postId"],
          raw: true,
        })
      : Promise.resolve([]),
    noveltyConfig.excludeCurrentPatches && models?.Patch?.findAll
      ? models.Patch.findAll({
          where: { userId },
          attributes: ["postId"],
          raw: true,
        })
      : Promise.resolve([]),
    noveltyConfig.maxSeenPostIds > 0 &&
    Array.isArray(noveltyConfig.seenActionTypes) &&
    noveltyConfig.seenActionTypes.length > 0 &&
    models?.UserAction?.sequelize
      ? models.UserAction.sequelize.query(
          `
            SELECT
              target_id AS "postId",
              MAX(occurred_at) AS "lastOccurredAt"
            FROM user_actions
            WHERE user_id = :userId
              AND target_type = 'post'
              AND action_type IN (:actionTypes)
              AND occurred_at >= :since
            GROUP BY target_id
            ORDER BY MAX(occurred_at) DESC
            LIMIT :limit;
          `,
          {
            type: QueryTypes.SELECT,
            replacements: {
              userId,
              actionTypes: noveltyConfig.seenActionTypes,
              since: new Date(
                now.getTime() - noveltyConfig.seenCooldownDays * 24 * 60 * 60 * 1000
              ),
              limit: noveltyConfig.maxSeenPostIds,
            },
          }
        )
      : Promise.resolve([]),
  ]);

  const likedPostIds = filterUuidLike((likeRows || []).map((row) => row.postId));
  const patchedPostIds = filterUuidLike((patchRows || []).map((row) => row.postId));
  const seenPostIds = filterUuidLike((seenRows || []).map((row) => row.postId)).slice(
    0,
    noveltyConfig.maxSeenPostIds
  );

  const likedPostIdSet = new Set(likedPostIds);
  const patchedPostIdSet = new Set(patchedPostIds);
  const seenPostIdSet = new Set(seenPostIds);
  const excludedPostIdSet = new Set([...likedPostIdSet, ...patchedPostIdSet, ...seenPostIdSet]);

  return {
    likedPostIdSet,
    patchedPostIdSet,
    seenPostIdSet,
    excludedPostIdSet,
    likedPostIds,
    patchedPostIds,
    seenPostIds,
    excludedPostIds: [...excludedPostIdSet],
  };
}

async function buildUserPreferenceProfile({ models, userId, now = new Date(), config } = {}) {
  const effectiveConfig = getEffectiveConfig(config);
  const preferenceWindowDays = effectiveConfig.pools.preferenceWindowDays;
  const signalWeights = effectiveConfig.actionSignalWeights;
  const blendConfig = effectiveConfig.blend;
  const since = new Date(now.getTime() - preferenceWindowDays * 24 * 60 * 60 * 1000);

  const [followRows, actionRows] = await Promise.all([
    models.Follow.findAll({
      where: { followerId: userId },
      attributes: ["followeeId"],
      raw: true,
    }),
    models.UserAction.findAll({
      where: {
        userId,
        occurredAt: {
          [Op.gte]: since,
        },
      },
      attributes: ["actionType", "targetType", "targetId", "metadataJson", "occurredAt"],
      order: [["occurredAt", "DESC"]],
      raw: true,
    }),
  ]);

  const followedAuthorSet = new Set(followRows.map((row) => row.followeeId));

  const postIds = new Set();
  for (const action of actionRows) {
    const postId = pickPostIdFromAction(action);
    if (postId) postIds.add(postId);
  }

  const postIdList = filterUuidLike([...postIds]);
  const postRows = postIdList.length > 0
    ? await models.Post.findAll({
        where: { id: { [Op.in]: postIdList } },
        attributes: [
          "id",
          "userId",
          "type",
          "category",
          "brand",
          "styleTags",
          "colorTags",
          "sizeLabel",
          "priceCents",
          "condition",
        ],
        raw: true,
      })
    : [];
  const postById = new Map(postRows.map((post) => [post.id, post]));

  const authorRaw = new Map();
  const categoryRaw = new Map();
  const brandRaw = new Map();
  const styleRaw = new Map();
  const colorRaw = new Map();
  const sizeRaw = new Map();
  const priceBandRaw = new Map();
  const conditionRaw = new Map();

  let regularPositiveWeight = 0;
  let marketPositiveWeight = 0;
  let relevantActionCount = 0;

  for (const action of actionRows) {
    const actionType = normalizeToken(action.actionType);
    if (!Object.prototype.hasOwnProperty.call(signalWeights, actionType)) {
      continue;
    }

    let weight = signalWeights[actionType];
    if (actionType === "feed_dwell") {
      const dwellMs = Number(action?.metadataJson?.dwellMs);
      if (!Number.isFinite(dwellMs) || dwellMs < 300) {
        weight = 0;
      } else {
        weight = signalWeights.feed_dwell * clamp(dwellMs / 3000, 0, 1);
      }
    }

    if (!Number.isFinite(weight) || weight === 0) continue;

    if (action.targetType === "user") {
      addToMap(authorRaw, String(action.targetId), weight);
    }

    const postId = pickPostIdFromAction(action);
    const post = postId ? postById.get(postId) : null;
    const feedType = normalizeFeedType(action?.metadataJson?.feedType);
    const resolvedType = post?.type || feedType;

    if (weight > 0 && resolvedType) {
      if (resolvedType === "regular") regularPositiveWeight += weight;
      if (resolvedType === "market") marketPositiveWeight += weight;
      relevantActionCount += 1;
    }

    if (!post) continue;

    addToMap(authorRaw, String(post.userId), weight);

    const category = normalizeToken(post.category);
    if (category && category !== UNKNOWN) {
      addToMap(categoryRaw, category, weight);
    }

    const brand = normalizeToken(post.brand);
    if (brand) {
      addToMap(brandRaw, brand, weight);
    }

    const styleTags = Array.isArray(post.styleTags) ? post.styleTags : [];
    if (styleTags.length > 0) {
      const perTag = weight / styleTags.length;
      for (const styleTag of styleTags) {
        addToMap(styleRaw, normalizeToken(styleTag), perTag);
      }
    }

    const colorTags = Array.isArray(post.colorTags) ? post.colorTags : [];
    if (colorTags.length > 0) {
      const perTag = weight / colorTags.length;
      for (const colorTag of colorTags) {
        addToMap(colorRaw, normalizeToken(colorTag), perTag);
      }
    }

    const sizeLabel = normalizeToken(post.sizeLabel);
    if (sizeLabel && sizeLabel !== UNKNOWN) {
      addToMap(sizeRaw, sizeLabel, weight);
    }

    const condition = normalizeToken(post.condition);
    if (condition && condition !== UNKNOWN) {
      addToMap(conditionRaw, condition, weight);
    }

    const priceBand = toPriceBand(post.priceCents);
    if (priceBand !== UNKNOWN) {
      addToMap(priceBandRaw, priceBand, weight);
    }
  }

  const positiveTotal = regularPositiveWeight + marketPositiveWeight;
  const fallbackShare = blendConfig.defaultMarketShare;
  const marketShare = positiveTotal > 0 ? marketPositiveWeight / positiveTotal : fallbackShare;
  const authorAffinity = normalizeAffinityMap(authorRaw);
  const categoryAffinity = normalizeAffinityMap(categoryRaw);
  const brandAffinity = normalizeAffinityMap(brandRaw);
  const styleAffinity = normalizeAffinityMap(styleRaw);
  const colorAffinity = normalizeAffinityMap(colorRaw);
  const sizeAffinity = normalizeAffinityMap(sizeRaw);
  const priceBandAffinity = normalizeAffinityMap(priceBandRaw);
  const conditionAffinity = normalizeAffinityMap(conditionRaw);

  const regularSignalStrength = clamp(
    getMapStrength(styleAffinity) * 0.35 +
      getMapStrength(colorAffinity) * 0.25 +
      getMapStrength(brandAffinity) * 0.2 +
      getMapStrength(authorAffinity) * 0.2,
    0,
    1
  );

  const marketSignalStrength = clamp(
    getMapStrength(categoryAffinity) * 0.22 +
      getMapStrength(sizeAffinity) * 0.2 +
      getMapStrength(priceBandAffinity) * 0.2 +
      getMapStrength(conditionAffinity) * 0.18 +
      getMapStrength(brandAffinity) * 0.1 +
      getMapStrength(authorAffinity) * 0.1,
    0,
    1
  );

  return {
    followedAuthorSet,
    authorAffinity,
    categoryAffinity,
    brandAffinity,
    styleAffinity,
    colorAffinity,
    sizeAffinity,
    priceBandAffinity,
    conditionAffinity,
    marketShare: clamp(marketShare, blendConfig.minMarketShare, blendConfig.maxMarketShare),
    relevantActionCount,
    coldStartMode: relevantActionCount < COLD_START_ACTION_THRESHOLD,
    regularSignalStrength,
    marketSignalStrength,
  };
}

module.exports = {
  ACTION_SIGNAL_WEIGHTS,
  DEFAULT_ACTION_SIGNAL_WEIGHTS,
  DEFAULT_NOVELTY_ACTION_TYPES,
  DEFAULT_NOVELTY_CONFIG,
  DEFAULT_LIMIT_PER_TYPE,
  DEFAULT_MARKET_SHARE,
  DEFAULT_RECOMMENDATION_CONFIG,
  buildEngagementVelocityByPostId,
  buildUserPreferenceProfile,
  blendAndDiversify,
  fetchCandidatePools,
  fetchUserNoveltyExclusions,
  filterUuidLike,
  getEffectiveConfig,
  isUuidLike,
  scoreMarketPost,
  scoreRegularPost,
  toPriceBand,
};
