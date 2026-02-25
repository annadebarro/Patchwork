"use strict";

const { Op, QueryTypes } = require("sequelize");
const {
  DEFAULT_RECOMMENDATION_CONFIG,
  buildEngagementVelocityByPostId,
  buildUserPreferenceProfile,
  blendAndDiversify,
  filterUuidLike,
  getEffectiveConfig,
  scoreMarketPost,
  scoreRegularPost,
} = require("./recommendationEngine");
const { getActiveConfig } = require("./recommendationConfig");
const { buildSyntheticRecommendationSimulation, parseSyntheticParams } = require("./recommendationSyntheticSimulation");

const STRONG_ACTION_GAINS = Object.freeze({
  post_patch_save: 3,
  post_like: 2,
  comment_create: 2,
  comment_like: 1,
});

const EVALUATION_ACTION_TYPES = Object.freeze([
  "feed_impression",
  "feed_click",
  "feed_dwell",
  "post_patch_save",
  "post_like",
  "comment_create",
  "comment_like",
]);

const MAX_DAYS = 60;
const MAX_K = 50;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parsePositiveInt(value, fallback, min, max) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, min, max);
}

function normalizeSimulationMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "synthetic" ? "synthetic" : "replay";
}

function normalizeFeedType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "regular" || normalized === "market") return normalized;
  if (normalized === "all") return "all";
  return "unknown";
}

function parseReplayParams(input = {}) {
  const type = normalizeFeedType(input.type) === "unknown" ? "all" : normalizeFeedType(input.type);
  return {
    days: parsePositiveInt(input.days, 14, 1, MAX_DAYS),
    type,
    k: parsePositiveInt(input.k, 20, 1, MAX_K),
  };
}

async function resolveCandidateConfig({ models, candidateConfig } = {}) {
  if (candidateConfig && typeof candidateConfig === "object") {
    return getEffectiveConfig(candidateConfig);
  }

  try {
    const active = await getActiveConfig({ models });
    if (active?.config && typeof active.config === "object") {
      return getEffectiveConfig(active.config);
    }
  } catch (err) {
    console.warn("Simulation config load failed. Using defaults.", err);
  }

  return getEffectiveConfig(DEFAULT_RECOMMENDATION_CONFIG);
}

function normalizePostIdFromEvent(event) {
  if (event.targetType === "post" && event.targetId) {
    return String(event.targetId);
  }
  const metadataPostId = event?.metadataJson?.postId;
  if (typeof metadataPostId === "string" && metadataPostId.trim()) {
    return metadataPostId.trim();
  }
  return null;
}

function normalizeRequestId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeSessionId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeSessionInstanceId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function toEpochMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function safeSourceSurface(value) {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  return normalized || "unknown";
}

function getSessionKey(event, stateByUser) {
  const userState = stateByUser.get(event.userId) || {
    derivedOrdinal: 0,
    lastDerivedMs: null,
  };

  const sessionInstanceId = normalizeSessionInstanceId(event?.metadataJson?.sessionInstanceId);
  if (sessionInstanceId) {
    stateByUser.set(event.userId, userState);
    return `sid-instance:${sessionInstanceId}`;
  }

  const sessionId = normalizeSessionId(event.sessionId);
  if (sessionId) {
    stateByUser.set(event.userId, userState);
    return `sid:${sessionId}`;
  }

  const eventMs = toEpochMs(event.occurredAt);
  if (
    userState.lastDerivedMs === null ||
    eventMs - userState.lastDerivedMs > 30 * 60 * 1000
  ) {
    userState.derivedOrdinal += 1;
  }

  userState.lastDerivedMs = eventMs;
  stateByUser.set(event.userId, userState);
  return `derived:${userState.derivedOrdinal}`;
}

function log2(value) {
  return Math.log(value) / Math.log(2);
}

function computeRankingMetrics(rankingIds, relevanceByPostId, k) {
  const topIds = rankingIds.slice(0, k);

  let dcg = 0;
  let weightedGainAtK = 0;
  let reciprocalRank = 0;

  for (let index = 0; index < topIds.length; index += 1) {
    const postId = topIds[index];
    const gain = relevanceByPostId.get(postId) || 0;
    weightedGainAtK += gain;

    if (gain > 0) {
      dcg += gain / log2(index + 2);
      if (reciprocalRank === 0) {
        reciprocalRank = 1 / (index + 1);
      }
    }
  }

  const idealGains = [...relevanceByPostId.values()]
    .filter((gain) => gain > 0)
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  for (let index = 0; index < idealGains.length; index += 1) {
    idcg += idealGains[index] / log2(index + 2);
  }

  const ndcgAtK = idcg > 0 ? dcg / idcg : 0;
  return {
    ndcgAtK,
    mrrAtK: reciprocalRank,
    weightedGainAtK,
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

function addToAggregate(target, metric) {
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

function computeCohort(userCreatedAt, sessionStartAt) {
  const userCreatedMs = toEpochMs(userCreatedAt);
  const sessionMs = toEpochMs(sessionStartAt);
  if (!userCreatedMs || !sessionMs) return "returning";

  const boundary = userCreatedMs + 30 * 24 * 60 * 60 * 1000;
  return sessionMs < boundary ? "new" : "returning";
}

async function loadSimulationEvents({ models, since }) {
  const sequelize = models.User.sequelize;

  return sequelize.query(
    `
      SELECT
        id,
        user_id AS "userId",
        action_type AS "actionType",
        target_type AS "targetType",
        target_id AS "targetId",
        metadata_json AS "metadataJson",
        source_surface AS "sourceSurface",
        session_id AS "sessionId",
        COALESCE(occurred_at, created_at) AS "occurredAt"
      FROM user_actions
      WHERE COALESCE(occurred_at, created_at) >= :since
        AND action_type IN (:actionTypes)
      ORDER BY user_id ASC, COALESCE(occurred_at, created_at) ASC, id ASC;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        since,
        actionTypes: EVALUATION_ACTION_TYPES,
      },
    }
  );
}

function buildEvaluationGroups({ events, requestedType }) {
  const stateByUser = new Map();
  const sessionEventsByKey = new Map();
  const groupsByKey = new Map();
  const impressionPostIds = new Set();

  for (const event of events) {
    const sessionKey = getSessionKey(event, stateByUser);
    const scopedSessionKey = `${event.userId}|${sessionKey}`;

    event._sessionKey = scopedSessionKey;
    if (!sessionEventsByKey.has(scopedSessionKey)) {
      sessionEventsByKey.set(scopedSessionKey, []);
    }
    sessionEventsByKey.get(scopedSessionKey).push(event);

    if (event.actionType !== "feed_impression") continue;

    const requestId = normalizeRequestId(event?.metadataJson?.requestId);
    const postId = normalizePostIdFromEvent(event);
    if (!requestId || !postId) continue;

    const feedType = normalizeFeedType(event?.metadataJson?.feedType);
    if (requestedType !== "all" && feedType !== "unknown" && feedType !== requestedType) {
      continue;
    }

    const groupKey = `${event.userId}|${scopedSessionKey}|${requestId}`;
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        key: groupKey,
        userId: event.userId,
        sessionKey: scopedSessionKey,
        requestId,
        feedType,
        sourceSurface: safeSourceSurface(event.sourceSurface),
        startAt: event.occurredAt,
        impressionOrder: [],
        impressionSet: new Set(),
      });
    }

    const group = groupsByKey.get(groupKey);
    if (!group.impressionSet.has(postId)) {
      group.impressionSet.add(postId);
      group.impressionOrder.push(postId);
      impressionPostIds.add(postId);
    }

    if (toEpochMs(event.occurredAt) < toEpochMs(group.startAt)) {
      group.startAt = event.occurredAt;
    }
  }

  return {
    groups: [...groupsByKey.values()],
    sessionEventsByKey,
    impressionPostIds: [...impressionPostIds],
  };
}

function buildRelevanceByPost({ group, sessionEvents, candidateIdSet }) {
  const relevanceByPost = new Map();

  for (const postId of candidateIdSet) {
    relevanceByPost.set(postId, 0);
  }

  const sessionStartMs = toEpochMs(group.startAt);

  for (const event of sessionEvents) {
    if (toEpochMs(event.occurredAt) < sessionStartMs) continue;

    const postId = normalizePostIdFromEvent(event);
    if (!postId || !candidateIdSet.has(postId)) continue;

    const actionType = event.actionType;
    const metadata = event.metadataJson || {};

    if (actionType === "feed_click") {
      const eventRequestId = normalizeRequestId(metadata.requestId);
      if (eventRequestId === group.requestId) {
        relevanceByPost.set(postId, (relevanceByPost.get(postId) || 0) + 1);
      }
      continue;
    }

    if (actionType === "feed_dwell") {
      const eventRequestId = normalizeRequestId(metadata.requestId);
      if (eventRequestId === group.requestId) {
        const dwellMs = Number(metadata.dwellMs);
        if (Number.isFinite(dwellMs) && dwellMs >= 300) {
          const dwellGain = 0.5 * clamp(dwellMs / 6000, 0, 1);
          relevanceByPost.set(postId, (relevanceByPost.get(postId) || 0) + dwellGain);
        }
      }
      continue;
    }

    const strongGain = STRONG_ACTION_GAINS[actionType];
    if (Number.isFinite(strongGain)) {
      relevanceByPost.set(postId, (relevanceByPost.get(postId) || 0) + strongGain);
    }
  }

  return relevanceByPost;
}

function sortChronologicalCandidateIds(posts) {
  return [...posts]
    .sort((a, b) => {
      const aMs = toEpochMs(a.createdAt);
      const bMs = toEpochMs(b.createdAt);
      if (bMs !== aMs) return bMs - aMs;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((post) => post.id);
}

async function buildReplayRecommendationSimulation({
  models,
  params = {},
  now = new Date(),
  candidateConfig = null,
} = {}) {
  const parsedParams = parseReplayParams(params);
  const effectiveConfig = getEffectiveConfig(candidateConfig);
  const normalizedType = parsedParams.type;
  const safeDays = parsedParams.days;
  const safeK = parsedParams.k;

  const since = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
  const events = await loadSimulationEvents({ models, since });

  const { groups, sessionEventsByKey, impressionPostIds } = buildEvaluationGroups({
    events,
    requestedType: normalizedType,
  });
  const validImpressionPostIds = filterUuidLike(impressionPostIds);

  const posts = validImpressionPostIds.length > 0
    ? await models.Post.findAll({
        where: { id: { [Op.in]: validImpressionPostIds } },
        include: [
          {
            model: models.User,
            as: "author",
            attributes: ["id", "username", "name", "createdAt"],
          },
        ],
      })
    : [];

  const postById = new Map(posts.map((post) => [post.id, post.toJSON()]));
  const engagementVelocityByPostId = await buildEngagementVelocityByPostId({
    models,
    postIds: validImpressionPostIds,
    now,
    config: effectiveConfig,
  });

  const userIds = [...new Set(groups.map((group) => group.userId))];
  const users = userIds.length > 0
    ? await models.User.findAll({
        where: { id: { [Op.in]: userIds } },
        attributes: ["id", "createdAt"],
        raw: true,
      })
    : [];
  const userCreatedAtById = new Map(users.map((user) => [user.id, user.createdAt]));

  const profileCache = new Map();

  const baselineAgg = createAggregate();
  const candidateAgg = createAggregate();
  const sliceAggregates = new Map();

  let skippedNoCandidates = 0;

  for (const group of groups) {
    let profile = profileCache.get(group.userId);
    if (!profile) {
      profile = await buildUserPreferenceProfile({
        models,
        userId: group.userId,
        now,
        config: effectiveConfig,
      });
      profileCache.set(group.userId, profile);
    }

    const candidatePosts = [];
    for (const postId of group.impressionOrder) {
      const post = postById.get(postId);
      if (!post) continue;

      if (normalizedType !== "all" && post.type !== normalizedType) continue;
      if (post.type === "market" && post.isSold) continue;

      candidatePosts.push({
        ...post,
        _engagementVelocity: engagementVelocityByPostId.get(post.id) || 0,
      });
    }

    if (!candidatePosts.length) {
      skippedNoCandidates += 1;
      continue;
    }

    const requestedType = normalizedType === "all"
      ? group.feedType === "regular" || group.feedType === "market"
        ? group.feedType
        : null
      : normalizedType;

    const context = { profile, now, config: effectiveConfig };
    const regularScored = [];
    const marketScored = [];

    for (const post of candidatePosts) {
      if (post.type === "regular") {
        regularScored.push(scoreRegularPost(post, context));
      } else if (post.type === "market" && !post.isSold) {
        marketScored.push(scoreMarketPost(post, context));
      }
    }

    const candidateRanked = blendAndDiversify({
      regularScored,
      marketScored,
      profile,
      requestedType,
      limit: candidatePosts.length,
      config: effectiveConfig,
    }).posts.map((post) => post.id);

    const baselineRanked = sortChronologicalCandidateIds(candidatePosts);
    const sessionEvents = sessionEventsByKey.get(group.sessionKey) || [];
    const candidateIdSet = new Set(candidatePosts.map((post) => post.id));
    const relevanceByPost = buildRelevanceByPost({
      group,
      sessionEvents,
      candidateIdSet,
    });

    const baselineMetric = computeRankingMetrics(baselineRanked, relevanceByPost, safeK);
    const candidateMetric = computeRankingMetrics(candidateRanked, relevanceByPost, safeK);

    addToAggregate(baselineAgg, baselineMetric);
    addToAggregate(candidateAgg, candidateMetric);

    const feedType = normalizedType === "all"
      ? group.feedType === "regular" || group.feedType === "market"
        ? group.feedType
        : "all"
      : normalizedType;

    const cohort = computeCohort(userCreatedAtById.get(group.userId), group.startAt);
    const sliceKey = `${feedType}|${group.sourceSurface}|${cohort}`;

    if (!sliceAggregates.has(sliceKey)) {
      sliceAggregates.set(sliceKey, {
        feedType,
        sourceSurface: group.sourceSurface,
        cohort,
        baseline: createAggregate(),
        candidate: createAggregate(),
      });
    }

    const slice = sliceAggregates.get(sliceKey);
    addToAggregate(slice.baseline, baselineMetric);
    addToAggregate(slice.candidate, candidateMetric);
  }

  const baseline = finalizeAggregate(baselineAgg);
  const candidate = finalizeAggregate(candidateAgg);
  const delta = subtractMetrics(candidate, baseline);

  const slices = [...sliceAggregates.values()].map((entry) => {
    const baselineSlice = finalizeAggregate(entry.baseline);
    const candidateSlice = finalizeAggregate(entry.candidate);
    return {
      feedType: entry.feedType,
      sourceSurface: entry.sourceSurface,
      cohort: entry.cohort,
      baseline: baselineSlice,
      candidate: candidateSlice,
      delta: subtractMetrics(candidateSlice, baselineSlice),
    };
  });

  return {
    mode: "replay",
    generatedAt: now.toISOString(),
    algorithmBaseline: "chronological_fallback",
    algorithmCandidate: "hybrid_v1",
    params: parsedParams,
    baseline,
    candidate,
    delta,
    coverage: {
      totalEvents: events.length,
      totalImpressionEvents: events.filter((event) => event.actionType === "feed_impression").length,
      groupsConstructed: groups.length,
      groupsEvaluated: candidate.requests,
      groupsSkippedNoCandidates: skippedNoCandidates,
      uniqueUsersEvaluated: profileCache.size,
    },
    slices,
    candidateConfig: effectiveConfig,
    notes: [
      "Counterfactual-lite evaluation on observed candidate sets from impression logs.",
      "Not a causal lift estimate.",
    ],
  };
}

async function buildRecommendationSimulation({
  models,
  mode = "replay",
  params = {},
  days,
  type,
  k,
  now = new Date(),
  candidateConfig = null,
} = {}) {
  const normalizedMode = normalizeSimulationMode(mode);
  const mergedParams = {
    ...(params && typeof params === "object" ? params : {}),
    ...(days !== undefined ? { days } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(k !== undefined ? { k } : {}),
  };

  const resolvedCandidateConfig = await resolveCandidateConfig({
    models,
    candidateConfig,
  });

  if (normalizedMode === "synthetic") {
    return buildSyntheticRecommendationSimulation({
      models,
      now,
      params: parseSyntheticParams(mergedParams),
      candidateConfig: resolvedCandidateConfig,
    });
  }

  return buildReplayRecommendationSimulation({
    models,
    now,
    params: parseReplayParams(mergedParams),
    candidateConfig: resolvedCandidateConfig,
  });
}

module.exports = {
  buildRecommendationSimulation,
  buildReplayRecommendationSimulation,
  buildEvaluationGroups,
  buildRelevanceByPost,
  computeRankingMetrics,
  normalizeSimulationMode,
  normalizeFeedType,
  parseReplayParams,
  parsePositiveInt,
  resolveCandidateConfig,
  sortChronologicalCandidateIds,
};
