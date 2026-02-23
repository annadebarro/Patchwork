"use strict";

const { Op } = require("sequelize");
const {
  DEFAULT_RECOMMENDATION_CONFIG,
  buildEngagementVelocityByPostId,
  blendAndDiversify,
  getEffectiveConfig,
  scoreMarketPost,
  scoreRegularPost,
  toPriceBand,
} = require("./recommendationEngine");

const MAX_SESSIONS = 5000;
const MAX_USERS = 1000;
const MAX_K = 100;

const DEFAULT_PARAMS = Object.freeze({
  seed: "patchwork-sim-v1",
  sessions: 1000,
  users: 100,
  type: "all",
  k: 20,
  includeColdStart: true,
  adaptationMode: "light",
  personaMix: "balanced",
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeFeedType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "regular" || normalized === "market" || normalized === "all") return normalized;
  return "all";
}

function toEpochMs(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hashSeed(seed) {
  const normalized = String(seed || "patchwork-sim-v1");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createDeterministicRng(seed) {
  let state = hashSeed(seed) || 1;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomChoice(array, rng) {
  if (!Array.isArray(array) || array.length === 0) return null;
  const index = Math.floor(rng() * array.length);
  return array[index] || null;
}

function sampleWithoutReplacement(array, count, rng) {
  if (!Array.isArray(array) || array.length === 0 || count <= 0) return [];
  const target = Math.min(count, array.length);
  const indices = array.map((_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  return indices.slice(0, target).map((index) => array[index]);
}

function normalizeToken(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
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

function addToMap(map, key, delta) {
  if (!key || !Number.isFinite(delta) || delta <= 0) return;
  map.set(key, (map.get(key) || 0) + delta);
}

function buildProfileFromSeedPosts({ personaType, seedPosts, marketShare }) {
  const authorRaw = new Map();
  const categoryRaw = new Map();
  const brandRaw = new Map();
  const styleRaw = new Map();
  const colorRaw = new Map();
  const sizeRaw = new Map();
  const priceBandRaw = new Map();
  const conditionRaw = new Map();
  const followedAuthorSet = new Set();

  for (const post of seedPosts) {
    if (!post) continue;
    const authorId = post.author?.id;
    if (authorId) {
      addToMap(authorRaw, authorId, 1);
      followedAuthorSet.add(authorId);
    }

    const category = normalizeToken(post.category);
    if (category && category !== "unknown") addToMap(categoryRaw, category, 1);

    const brand = normalizeToken(post.brand);
    if (brand) addToMap(brandRaw, brand, 1);

    const size = normalizeToken(post.sizeLabel);
    if (size && size !== "unknown") addToMap(sizeRaw, size, 1);

    const condition = normalizeToken(post.condition);
    if (condition && condition !== "unknown") addToMap(conditionRaw, condition, 1);

    const priceBand = toPriceBand(post.priceCents);
    if (priceBand && priceBand !== "unknown") addToMap(priceBandRaw, priceBand, 1);

    const styleTags = Array.isArray(post.styleTags) ? post.styleTags : [];
    for (const tag of styleTags) {
      addToMap(styleRaw, normalizeToken(tag), 1 / Math.max(styleTags.length, 1));
    }

    const colorTags = Array.isArray(post.colorTags) ? post.colorTags : [];
    for (const tag of colorTags) {
      addToMap(colorRaw, normalizeToken(tag), 1 / Math.max(colorTags.length, 1));
    }
  }

  return {
    personaType,
    followedAuthorSet,
    authorAffinity: normalizeAffinityMap(authorRaw),
    categoryAffinity: normalizeAffinityMap(categoryRaw),
    brandAffinity: normalizeAffinityMap(brandRaw),
    styleAffinity: normalizeAffinityMap(styleRaw),
    colorAffinity: normalizeAffinityMap(colorRaw),
    sizeAffinity: normalizeAffinityMap(sizeRaw),
    priceBandAffinity: normalizeAffinityMap(priceBandRaw),
    conditionAffinity: normalizeAffinityMap(conditionRaw),
    marketShare,
    relevantActionCount: personaType === "cold_start" ? 0 : 30,
  };
}

function createPersonaCatalog({ universe, includeColdStart, rng }) {
  const regularSeed = sampleWithoutReplacement(universe.regular, 10, rng);
  const marketSeed = sampleWithoutReplacement(universe.market, 10, rng);
  const mixedSeed = sampleWithoutReplacement(
    [...sampleWithoutReplacement(universe.regular, 6, rng), ...sampleWithoutReplacement(universe.market, 6, rng)],
    12,
    rng
  );

  const catalog = [
    {
      type: "regular_focused",
      profile: buildProfileFromSeedPosts({
        personaType: "regular_focused",
        seedPosts: regularSeed,
        marketShare: 0.25,
      }),
    },
    {
      type: "market_focused",
      profile: buildProfileFromSeedPosts({
        personaType: "market_focused",
        seedPosts: marketSeed,
        marketShare: 0.75,
      }),
    },
    {
      type: "mixed",
      profile: buildProfileFromSeedPosts({
        personaType: "mixed",
        seedPosts: mixedSeed,
        marketShare: 0.5,
      }),
    },
  ];

  if (includeColdStart) {
    catalog.push({
      type: "cold_start",
      profile: {
        personaType: "cold_start",
        followedAuthorSet: new Set(),
        authorAffinity: new Map(),
        categoryAffinity: new Map(),
        brandAffinity: new Map(),
        styleAffinity: new Map(),
        colorAffinity: new Map(),
        sizeAffinity: new Map(),
        priceBandAffinity: new Map(),
        conditionAffinity: new Map(),
        marketShare: 0.4,
        relevantActionCount: 0,
      },
    });
  }

  return catalog;
}

function cloneProfile(profile) {
  return {
    personaType: profile.personaType,
    followedAuthorSet: new Set(profile.followedAuthorSet),
    authorAffinity: new Map(profile.authorAffinity),
    categoryAffinity: new Map(profile.categoryAffinity),
    brandAffinity: new Map(profile.brandAffinity),
    styleAffinity: new Map(profile.styleAffinity),
    colorAffinity: new Map(profile.colorAffinity),
    sizeAffinity: new Map(profile.sizeAffinity),
    priceBandAffinity: new Map(profile.priceBandAffinity),
    conditionAffinity: new Map(profile.conditionAffinity),
    marketShare: profile.marketShare,
    relevantActionCount: profile.relevantActionCount,
  };
}

function buildPersonaTypeQueue({ users, includeColdStart, rng, personaMix }) {
  const queue = [];
  const coldShare = includeColdStart ? 0.15 : 0;
  const mix = personaMix === "balanced"
    ? {
        regular_focused: (1 - coldShare) / 3,
        market_focused: (1 - coldShare) / 3,
        mixed: (1 - coldShare) / 3,
        cold_start: coldShare,
      }
    : {
        regular_focused: (1 - coldShare) / 3,
        market_focused: (1 - coldShare) / 3,
        mixed: (1 - coldShare) / 3,
        cold_start: coldShare,
      };

  const choices = Object.keys(mix);
  const cumulative = [];
  let running = 0;
  for (const key of choices) {
    running += mix[key];
    cumulative.push({ key, threshold: running });
  }

  for (let index = 0; index < users; index += 1) {
    const value = rng();
    let selected = choices[0];
    for (const entry of cumulative) {
      if (value <= entry.threshold) {
        selected = entry.key;
        break;
      }
    }
    queue.push(selected);
  }

  return queue;
}

function selectFeedType({ globalType, profile, rng }) {
  if (globalType === "regular" || globalType === "market") return globalType;
  return rng() < clamp(profile.marketShare, 0.1, 0.9) ? "market" : "regular";
}

function buildCandidateSet({ universe, feedType, candidateSize, profile, rng }) {
  if (feedType === "regular") {
    return sampleWithoutReplacement(universe.regular, candidateSize, rng);
  }
  if (feedType === "market") {
    return sampleWithoutReplacement(universe.market, candidateSize, rng);
  }

  const marketTarget = Math.round(candidateSize * clamp(profile.marketShare, 0.2, 0.8));
  const regularTarget = Math.max(0, candidateSize - marketTarget);
  const regular = sampleWithoutReplacement(universe.regular, regularTarget, rng);
  const market = sampleWithoutReplacement(universe.market, marketTarget, rng);
  return sampleWithoutReplacement([...regular, ...market], candidateSize, rng);
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function computeLatentUtility(post, profile, config, now, rng) {
  const context = { profile, config, now };
  const scored = post.type === "market"
    ? scoreMarketPost(post, context)
    : scoreRegularPost(post, context);
  const base = scored.score / 6.5;
  const ageDays = (now.getTime() - toEpochMs(post.createdAt)) / (24 * 60 * 60 * 1000);
  const noveltyBoost = ageDays < 14 ? 0.06 : 0;
  const noise = (rng() - 0.5) * 0.12;
  return clamp(sigmoid(base - 0.65 + noveltyBoost + noise), 0, 1);
}

function initializeRelevance(candidatePosts) {
  const map = new Map();
  for (const post of candidatePosts) {
    map.set(post.id, 0);
  }
  return map;
}

function addActionRelevance(relevanceByPostId, postId, delta) {
  relevanceByPostId.set(postId, (relevanceByPostId.get(postId) || 0) + delta);
}

function simulateSessionInteractions({ rankedPosts, candidatePosts, k, profile, config, now, rng }) {
  const relevanceByPost = initializeRelevance(candidatePosts);
  const utilityByPostId = new Map();

  for (const post of candidatePosts) {
    utilityByPostId.set(post.id, computeLatentUtility(post, profile, config, now, rng));
  }

  const events = {
    clicks: 0,
    dwellEvents: 0,
    likes: 0,
    saves: 0,
    comments: 0,
    weightedGainAtK: 0,
  };

  const topPosts = rankedPosts.slice(0, Math.max(1, k));
  const actionByPostId = new Map();

  for (let index = 0; index < topPosts.length; index += 1) {
    const post = topPosts[index];
    const utility = utilityByPostId.get(post.id) || 0;
    const positionBias = 1 / Math.sqrt(index + 1);
    const clickProbability = clamp(utility * positionBias * 0.95, 0, 0.95);

    const action = {
      clicked: false,
      dwellMs: 0,
      liked: false,
      saved: false,
      commented: false,
      utility: Number(utility.toFixed(4)),
    };

    if (rng() < clickProbability) {
      action.clicked = true;
      events.clicks += 1;
      addActionRelevance(relevanceByPost, post.id, 1);

      const dwellProbability = clamp(utility * 0.85 + 0.1, 0, 0.95);
      if (rng() < dwellProbability) {
        action.dwellMs = Math.round(300 + utility * 6000 * rng());
        events.dwellEvents += 1;
        addActionRelevance(relevanceByPost, post.id, 0.5 * clamp(action.dwellMs / 6000, 0, 1));
      }

      if (rng() < clamp(utility * 0.45, 0, 0.85)) {
        action.liked = true;
        events.likes += 1;
        addActionRelevance(relevanceByPost, post.id, 2);
      }
      if (rng() < clamp(utility * 0.2, 0, 0.75)) {
        action.saved = true;
        events.saves += 1;
        addActionRelevance(relevanceByPost, post.id, 3);
      }
      if (rng() < clamp(utility * 0.18, 0, 0.65)) {
        action.commented = true;
        events.comments += 1;
        addActionRelevance(relevanceByPost, post.id, 2);
      }
    }

    actionByPostId.set(post.id, action);
    events.weightedGainAtK += relevanceByPost.get(post.id) || 0;
  }

  return {
    relevanceByPost,
    actionByPostId,
    events,
  };
}

function log2(value) {
  return Math.log(value) / Math.log(2);
}

function computeRankingMetrics(rankingIds, relevanceByPostId, k) {
  const topIds = rankingIds.slice(0, k);
  let dcg = 0;
  let gain = 0;
  let reciprocalRank = 0;

  for (let index = 0; index < topIds.length; index += 1) {
    const postId = topIds[index];
    const rel = relevanceByPostId.get(postId) || 0;
    gain += rel;
    if (rel > 0) {
      dcg += rel / log2(index + 2);
      if (reciprocalRank === 0) reciprocalRank = 1 / (index + 1);
    }
  }

  const ideal = [...relevanceByPostId.values()]
    .filter((value) => value > 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  let idcg = 0;
  for (let index = 0; index < ideal.length; index += 1) {
    idcg += ideal[index] / log2(index + 2);
  }

  return {
    ndcgAtK: idcg > 0 ? dcg / idcg : 0,
    mrrAtK: reciprocalRank,
    weightedGainAtK: gain,
  };
}

function createAggregate() {
  return {
    requests: 0,
    ndcgAtK: 0,
    mrrAtK: 0,
    weightedGainAtK: 0,
  };
}

function addMetric(target, metric) {
  target.requests += 1;
  target.ndcgAtK += metric.ndcgAtK;
  target.mrrAtK += metric.mrrAtK;
  target.weightedGainAtK += metric.weightedGainAtK;
}

function finalizeAggregate(aggregate) {
  if (!aggregate.requests) {
    return {
      requests: 0,
      ndcgAtK: 0,
      mrrAtK: 0,
      weightedGainAtK: 0,
    };
  }
  return {
    requests: aggregate.requests,
    ndcgAtK: Number((aggregate.ndcgAtK / aggregate.requests).toFixed(4)),
    mrrAtK: Number((aggregate.mrrAtK / aggregate.requests).toFixed(4)),
    weightedGainAtK: Number((aggregate.weightedGainAtK / aggregate.requests).toFixed(4)),
  };
}

function subtractMetrics(candidate, baseline) {
  return {
    requests: candidate.requests,
    ndcgAtK: Number((candidate.ndcgAtK - baseline.ndcgAtK).toFixed(4)),
    mrrAtK: Number((candidate.mrrAtK - baseline.mrrAtK).toFixed(4)),
    weightedGainAtK: Number((candidate.weightedGainAtK - baseline.weightedGainAtK).toFixed(4)),
  };
}

function applyProfileAdaptation({ profile, rankedPosts, actionByPostId, adaptationMode }) {
  if (adaptationMode !== "light") return;

  const step = 0.06;
  const bump = (map, key, delta = step) => {
    if (!key) return;
    map.set(key, clamp((map.get(key) || 0) + delta, 0, 1.5));
  };

  let positiveMarket = 0;
  let positiveRegular = 0;

  for (const post of rankedPosts.slice(0, 30)) {
    const action = actionByPostId.get(post.id);
    if (!action || (!action.clicked && !action.liked && !action.saved && !action.commented)) {
      continue;
    }

    const intensity = action.saved ? 1.2 : action.liked ? 1 : action.commented ? 0.9 : 0.5;
    const delta = step * intensity;
    const authorId = post.author?.id;
    if (authorId) {
      bump(profile.authorAffinity, authorId, delta);
      if (action.saved || action.liked) {
        profile.followedAuthorSet.add(authorId);
      }
    }

    const brand = normalizeToken(post.brand);
    if (brand) bump(profile.brandAffinity, brand, delta);

    if (post.type === "market") {
      positiveMarket += 1;
      const category = normalizeToken(post.category);
      const size = normalizeToken(post.sizeLabel);
      const condition = normalizeToken(post.condition);
      const priceBand = toPriceBand(post.priceCents);
      if (category && category !== "unknown") bump(profile.categoryAffinity, category, delta);
      if (size && size !== "unknown") bump(profile.sizeAffinity, size, delta);
      if (condition && condition !== "unknown") bump(profile.conditionAffinity, condition, delta);
      if (priceBand && priceBand !== "unknown") bump(profile.priceBandAffinity, priceBand, delta);
    } else {
      positiveRegular += 1;
      const styleTags = Array.isArray(post.styleTags) ? post.styleTags : [];
      for (const styleTag of styleTags) {
        const token = normalizeToken(styleTag);
        if (token) bump(profile.styleAffinity, token, delta / Math.max(styleTags.length, 1));
      }
      const colorTags = Array.isArray(post.colorTags) ? post.colorTags : [];
      for (const colorTag of colorTags) {
        const token = normalizeToken(colorTag);
        if (token) bump(profile.colorAffinity, token, delta / Math.max(colorTags.length, 1));
      }
    }
    profile.relevantActionCount += 1;
  }

  const total = positiveRegular + positiveMarket;
  if (total > 0) {
    const observedShare = positiveMarket / total;
    profile.marketShare = clamp(profile.marketShare * 0.88 + observedShare * 0.12, 0.1, 0.9);
  }
}

function summarizeTopPosts(posts, actionByPostId, k) {
  return posts.slice(0, Math.min(k, 10)).map((post, index) => {
    const action = actionByPostId.get(post.id) || {};
    return {
      rank: index + 1,
      postId: post.id,
      type: post.type,
      authorId: post.author?.id || null,
      clicked: Boolean(action.clicked),
      liked: Boolean(action.liked),
      saved: Boolean(action.saved),
      commented: Boolean(action.commented),
      dwellMs: action.dwellMs || 0,
      utility: Number(action.utility || 0),
    };
  });
}

async function loadUniverse({ models, config, now }) {
  const effectiveConfig = getEffectiveConfig(config);
  const poolConfig = effectiveConfig.pools;
  const universeLimit = Math.max(poolConfig.defaultLimitPerType * 4, 800);
  const include = [
    {
      model: models.User,
      as: "author",
      attributes: ["id", "username", "name", "profilePicture"],
    },
  ];

  const [regularRows, marketRows] = await Promise.all([
    models.Post.findAll({
      where: {
        isPublic: true,
        type: "regular",
        createdAt: {
          [Op.gte]: new Date(
            now.getTime() - poolConfig.regularRecencyDays * 24 * 60 * 60 * 1000
          ),
        },
      },
      order: [["createdAt", "DESC"]],
      include,
      limit: universeLimit,
    }),
    models.Post.findAll({
      where: {
        isPublic: true,
        type: "market",
        isSold: false,
        createdAt: {
          [Op.gte]: new Date(
            now.getTime() - poolConfig.marketRecencyDays * 24 * 60 * 60 * 1000
          ),
        },
      },
      order: [["createdAt", "DESC"]],
      include,
      limit: universeLimit,
    }),
  ]);

  const regular = regularRows.map((row) => row.toJSON());
  const market = marketRows.map((row) => row.toJSON());
  const velocityMap = await buildEngagementVelocityByPostId({
    models,
    postIds: [...regular, ...market].map((entry) => entry.id),
    now,
    config: effectiveConfig,
  });

  for (const post of regular) {
    post._engagementVelocity = velocityMap.get(post.id) || 0;
  }
  for (const post of market) {
    post._engagementVelocity = velocityMap.get(post.id) || 0;
  }

  return { regular, market };
}

function sortChronological(posts) {
  return [...posts].sort((a, b) => {
    const aMs = toEpochMs(a.createdAt);
    const bMs = toEpochMs(b.createdAt);
    if (bMs !== aMs) return bMs - aMs;
    return String(a.id).localeCompare(String(b.id));
  });
}

function parseSyntheticParams(input = {}) {
  return {
    seed: typeof input.seed === "string" && input.seed.trim() ? input.seed.trim() : DEFAULT_PARAMS.seed,
    sessions: clamp(Number.parseInt(input.sessions, 10) || DEFAULT_PARAMS.sessions, 1, MAX_SESSIONS),
    users: clamp(Number.parseInt(input.users, 10) || DEFAULT_PARAMS.users, 1, MAX_USERS),
    type: normalizeFeedType(input.type || DEFAULT_PARAMS.type),
    k: clamp(Number.parseInt(input.k, 10) || DEFAULT_PARAMS.k, 1, MAX_K),
    includeColdStart:
      typeof input.includeColdStart === "boolean"
        ? input.includeColdStart
        : DEFAULT_PARAMS.includeColdStart,
    adaptationMode:
      typeof input.adaptationMode === "string" && input.adaptationMode.trim()
        ? input.adaptationMode.trim().toLowerCase()
        : DEFAULT_PARAMS.adaptationMode,
    personaMix:
      typeof input.personaMix === "string" && input.personaMix.trim()
        ? input.personaMix.trim().toLowerCase()
        : DEFAULT_PARAMS.personaMix,
  };
}

async function buildSyntheticRecommendationSimulation({
  models,
  now = new Date(),
  params = {},
  candidateConfig = DEFAULT_RECOMMENDATION_CONFIG,
} = {}) {
  const parsed = parseSyntheticParams(params);
  const rng = createDeterministicRng(parsed.seed);
  const effectiveCandidateConfig = getEffectiveConfig(candidateConfig);
  const universe = await loadUniverse({
    models,
    config: effectiveCandidateConfig,
    now,
  });

  const catalog = createPersonaCatalog({
    universe,
    includeColdStart: parsed.includeColdStart,
    rng,
  });
  const catalogByType = new Map(catalog.map((entry) => [entry.type, entry.profile]));
  const personaTypes = buildPersonaTypeQueue({
    users: parsed.users,
    includeColdStart: parsed.includeColdStart,
    rng,
    personaMix: parsed.personaMix,
  });

  const users = personaTypes.map((personaType, index) => ({
    id: `synthetic-user-${index + 1}`,
    cohort: personaType === "cold_start" ? "new" : "returning",
    personaType,
    baselineProfile: cloneProfile(catalogByType.get(personaType) || catalogByType.get("mixed")),
    candidateProfile: cloneProfile(catalogByType.get(personaType) || catalogByType.get("mixed")),
  }));

  const baselineAgg = createAggregate();
  const candidateAgg = createAggregate();
  const sliceAgg = new Map();
  const sampleJourneys = [];
  let totalCandidates = 0;

  for (let sessionIndex = 0; sessionIndex < parsed.sessions; sessionIndex += 1) {
    const user = users[sessionIndex % users.length];
    const feedType = selectFeedType({
      globalType: parsed.type,
      profile: user.candidateProfile,
      rng,
    });
    const candidatePosts = buildCandidateSet({
      universe,
      feedType,
      candidateSize: Math.max(parsed.k * 5, 120),
      profile: user.candidateProfile,
      rng,
    });
    if (!candidatePosts.length) continue;

    totalCandidates += candidatePosts.length;

    const baselineRankedPosts = sortChronological(candidatePosts);
    const scoreContext = { now, config: effectiveCandidateConfig, profile: user.candidateProfile };
    const regularScored = [];
    const marketScored = [];
    for (const post of candidatePosts) {
      if (post.type === "regular") {
        regularScored.push(scoreRegularPost(post, scoreContext));
      } else if (post.type === "market") {
        marketScored.push(scoreMarketPost(post, scoreContext));
      }
    }
    const candidateRankedPosts = blendAndDiversify({
      regularScored,
      marketScored,
      profile: user.candidateProfile,
      requestedType: feedType === "all" ? null : feedType,
      limit: candidatePosts.length,
      config: effectiveCandidateConfig,
    }).posts;

    const baselineInteractions = simulateSessionInteractions({
      rankedPosts: baselineRankedPosts,
      candidatePosts,
      k: parsed.k,
      profile: user.baselineProfile,
      config: effectiveCandidateConfig,
      now,
      rng,
    });
    const candidateInteractions = simulateSessionInteractions({
      rankedPosts: candidateRankedPosts,
      candidatePosts,
      k: parsed.k,
      profile: user.candidateProfile,
      config: effectiveCandidateConfig,
      now,
      rng,
    });

    applyProfileAdaptation({
      profile: user.baselineProfile,
      rankedPosts: baselineRankedPosts,
      actionByPostId: baselineInteractions.actionByPostId,
      adaptationMode: parsed.adaptationMode,
    });
    applyProfileAdaptation({
      profile: user.candidateProfile,
      rankedPosts: candidateRankedPosts,
      actionByPostId: candidateInteractions.actionByPostId,
      adaptationMode: parsed.adaptationMode,
    });

    const baselineMetric = computeRankingMetrics(
      baselineRankedPosts.map((post) => post.id),
      baselineInteractions.relevanceByPost,
      parsed.k
    );
    const candidateMetric = computeRankingMetrics(
      candidateRankedPosts.map((post) => post.id),
      candidateInteractions.relevanceByPost,
      parsed.k
    );

    addMetric(baselineAgg, baselineMetric);
    addMetric(candidateAgg, candidateMetric);

    const sliceKey = `${feedType}|synthetic_feed|${user.cohort}|${user.personaType}`;
    if (!sliceAgg.has(sliceKey)) {
      sliceAgg.set(sliceKey, {
        feedType,
        sourceSurface: "synthetic_feed",
        cohort: user.cohort,
        personaType: user.personaType,
        baseline: createAggregate(),
        candidate: createAggregate(),
      });
    }
    const slice = sliceAgg.get(sliceKey);
    addMetric(slice.baseline, baselineMetric);
    addMetric(slice.candidate, candidateMetric);

    if (sampleJourneys.length < 6) {
      sampleJourneys.push({
        sessionIndex: sessionIndex + 1,
        userId: user.id,
        personaType: user.personaType,
        cohort: user.cohort,
        feedType,
        baselineEvents: baselineInteractions.events,
        candidateEvents: candidateInteractions.events,
        baselineTop: summarizeTopPosts(
          baselineRankedPosts,
          baselineInteractions.actionByPostId,
          parsed.k
        ),
        candidateTop: summarizeTopPosts(
          candidateRankedPosts,
          candidateInteractions.actionByPostId,
          parsed.k
        ),
      });
    }
  }

  const baseline = finalizeAggregate(baselineAgg);
  const candidate = finalizeAggregate(candidateAgg);
  const delta = subtractMetrics(candidate, baseline);

  const slices = [...sliceAgg.values()]
    .map((entry) => {
      const baselineSlice = finalizeAggregate(entry.baseline);
      const candidateSlice = finalizeAggregate(entry.candidate);
      return {
        feedType: entry.feedType,
        sourceSurface: entry.sourceSurface,
        cohort: entry.cohort,
        personaType: entry.personaType,
        baseline: baselineSlice,
        candidate: candidateSlice,
        delta: subtractMetrics(candidateSlice, baselineSlice),
      };
    })
    .sort((a, b) => b.candidate.requests - a.candidate.requests);

  return {
    mode: "synthetic",
    generatedAt: now.toISOString(),
    algorithmBaseline: "chronological_fallback",
    algorithmCandidate: "hybrid_v1",
    params: parsed,
    baseline,
    candidate,
    delta,
    coverage: {
      syntheticUsers: users.length,
      sessionsPlanned: parsed.sessions,
      sessionsEvaluated: candidate.requests,
      averageCandidates: candidate.requests > 0 ? Number((totalCandidates / candidate.requests).toFixed(2)) : 0,
      coldStartUsers: users.filter((entry) => entry.personaType === "cold_start").length,
    },
    slices,
    sampleJourneys,
    candidateConfig: effectiveCandidateConfig,
    notes: [
      "Synthetic deterministic persona simulation on real post inventory.",
      "No synthetic user actions were written to production telemetry tables.",
    ],
  };
}

module.exports = {
  buildSyntheticRecommendationSimulation,
  parseSyntheticParams,
};
