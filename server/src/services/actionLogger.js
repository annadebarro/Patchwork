"use strict";

const { getModels } = require("../models");

const ALLOWED_SURFACES = new Set([
  "social_feed",
  "post_detail",
  "profile",
  "search_results",
  "unknown",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSurface(value) {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "unknown";
  return ALLOWED_SURFACES.has(normalized) ? normalized : "unknown";
}

function extractSessionId(req) {
  const raw = req?.headers?.["x-pw-session-id"];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  if (!normalized) return null;
  return UUID_RE.test(normalized) ? normalized : null;
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
  normalizeSurface,
  extractSessionId,
  logUserActionSafe,
};
