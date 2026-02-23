"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const {
  fetchChronologicalRecommendations,
  normalizeRecommendationType,
  parseRecommendationPaging,
} = require("./recommendations");

test("normalizeRecommendationType accepts regular and market only", () => {
  assert.equal(normalizeRecommendationType("regular"), "regular");
  assert.equal(normalizeRecommendationType("market"), "market");
  assert.equal(normalizeRecommendationType("all"), null);
});

test("parseRecommendationPaging clamps limit and offset", () => {
  const parsed = parseRecommendationPaging({ limit: "200", offset: "-2" });
  assert.equal(parsed.limit, 100);
  assert.equal(parsed.offset, 0);
});

test("fetchChronologicalRecommendations excludes own posts and sold market posts in all feed", async () => {
  let capturedWhere = null;
  const models = {
    Post: {
      findAll: async ({ where }) => {
        capturedWhere = where;
        return [];
      },
    },
    User: {},
  };

  await fetchChronologicalRecommendations({
    models,
    type: null,
    limit: 10,
    offset: 0,
    userId: "viewer-1",
  });

  assert.equal(capturedWhere.userId[Op.ne], "viewer-1");
  assert.equal(Array.isArray(capturedWhere[Op.or]), true);
  assert.deepEqual(capturedWhere[Op.or], [
    { type: "regular" },
    { type: "market", isSold: false },
  ]);
});
