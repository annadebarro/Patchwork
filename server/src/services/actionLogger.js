"use strict";

const { getModels } = require("../models");

const SOURCE_SURFACES = Object.freeze({
  SOCIAL_FEED: "social_feed",
  POST_DETAIL: "post_detail",
  PROFILE: "profile",
  SEARCH_RESULTS: "search_results",
  UNKNOWN: "unknown",
});
const ALLOWED_SURFACES = new Set(Object.values(SOURCE_SURFACES));

const ACTION_TYPES = Object.freeze({
  FEED_IMPRESSION: "feed_impression",
  FEED_CLICK: "feed_click",
  FEED_DWELL: "feed_dwell",
  POST_PATCH_SAVE: "post_patch_save",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSurface(value) {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "unknown";
  return ALLOWED_SURFACES.has(normalized) ? normalized : "unknown";
}

function normalizeSessionId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return UUID_RE.test(normalized) ? normalized : null;
}

function extractSessionId(req) {
  return normalizeSessionId(req?.headers?.["x-pw-session-id"]);
}

function isActionLoggingEnabled() {
  return String(process.env.ACTION_LOGGING_ENABLED ?? "true").toLowerCase() !== "false";
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeRankPosition(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizePostId(value) {
  if (value === undefined || value === null) return null;
  return normalizeOptionalString(String(value));
}

function buildRecommendationActionMetadata({ req, metadata, postId } = {}) {
  const normalizedMetadata = normalizeMetadata(metadata);

  return {
    ...normalizedMetadata,
    surface: normalizeSurface(normalizedMetadata.surface ?? req?.headers?.["x-pw-surface"]),
    sessionId: normalizeSessionId(normalizedMetadata.sessionId) ?? extractSessionId(req),
    feedType: normalizeOptionalString(normalizedMetadata.feedType),
    rankPosition: normalizeRankPosition(normalizedMetadata.rankPosition),
    algorithm: normalizeOptionalString(normalizedMetadata.algorithm),
    requestId: normalizeOptionalString(normalizedMetadata.requestId),
    postId: normalizePostId(normalizedMetadata.postId ?? postId),
  };
}

async function logUserActionSafe({
  req,
  userId,
  actionType,
  targetType,
  targetId,
  metadata,
  occurredAt,
  modelsOverride,
} = {}) {
  if (!isActionLoggingEnabled()) return false;

  if (!userId || !actionType || !targetType || targetId === undefined || targetId === null) {
    console.warn("Skipping user action log due to missing required fields.", {
      userId,
      actionType,
      targetType,
      targetId,
    });
    return false;
  }

  try {
    const models = modelsOverride || getModels();
    const surfaceHeader = req?.headers?.["x-pw-surface"];
    const sourceSurface = normalizeSurface(surfaceHeader);
    const sessionId = extractSessionId(req);

    await models.UserAction.create({
      userId,
      actionType,
      targetType,
      targetId: String(targetId),
      metadataJson: normalizeMetadata(metadata),
      sourceSurface,
      sessionId,
      occurredAt: occurredAt instanceof Date ? occurredAt : new Date(),
    });

    return true;
  } catch (error) {
    console.error("User action logging failed.", {
      error: error?.message || String(error),
      userId,
      actionType,
      targetType,
      targetId,
    });
    return false;
  }
}

module.exports = {
  SOURCE_SURFACES,
  ACTION_TYPES,
  normalizeSurface,
  extractSessionId,
  buildRecommendationActionMetadata,
  logUserActionSafe,
};
