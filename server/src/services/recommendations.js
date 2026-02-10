"use strict";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

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
    offset: clamp(toInt(query?.offset, 0), 0, 1000),
  };
}

// Fallback recommendation strategy until ranker/simulation integration is ready.
async function fetchChronologicalRecommendations({ models, type, limit, offset }) {
  const where = { isPublic: true };
  if (type) where.type = type;

  return models.Post.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    include: [
      {
        model: models.User,
        as: "author",
        attributes: ["id", "username", "name", "profilePicture"],
      },
    ],
  });
}

module.exports = {
  normalizeRecommendationType,
  parseRecommendationPaging,
  fetchChronologicalRecommendations,
};
