"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSyntheticRecommendationSimulation } = require("./recommendationSyntheticSimulation");
const { DEFAULT_RECOMMENDATION_CONFIG } = require("./recommendationEngine");

function wrapPost(post) {
  return {
    toJSON: () => ({ ...post }),
  };
}

function buildModels() {
  const regularPosts = Array.from({ length: 14 }).map((_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    type: "regular",
    isPublic: true,
    isSold: false,
    createdAt: new Date(Date.UTC(2026, 1, 1 + index)).toISOString(),
    styleTags: ["casual", index % 2 ? "streetwear" : "minimal"],
    colorTags: [index % 2 ? "black" : "blue"],
    brand: index % 2 ? "nike" : "uniqlo",
    category: "unknown",
    sizeLabel: "unknown",
    priceCents: null,
    condition: "unknown",
    author: {
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      username: `regular_${index + 1}`,
      name: `Regular ${index + 1}`,
      profilePicture: null,
    },
  }));

  const marketPosts = Array.from({ length: 14 }).map((_, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    type: "market",
    isPublic: true,
    isSold: false,
    createdAt: new Date(Date.UTC(2026, 1, 1 + index)).toISOString(),
    styleTags: ["vintage"],
    colorTags: [index % 2 ? "tan" : "olive"],
    brand: index % 2 ? "levi's" : "patagonia",
    category: index % 2 ? "bottoms" : "outerwear",
    sizeLabel: index % 2 ? "m" : "l",
    priceCents: index % 2 ? 6500 : 14500,
    condition: index % 2 ? "good" : "new",
    author: {
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      username: `market_${index + 1}`,
      name: `Market ${index + 1}`,
      profilePicture: null,
    },
  }));

  return {
    User: {},
    Post: {
      sequelize: {
        query: async () => [],
      },
      findAll: async ({ where }) => {
        if (where?.type === "regular") return regularPosts.map(wrapPost);
        return marketPosts.map(wrapPost);
      },
    },
  };
}

test("synthetic simulation is deterministic for fixed seed and params", async () => {
  const models = buildModels();
  const now = new Date("2026-02-18T00:00:00.000Z");
  const params = {
    seed: "deterministic-seed",
    sessions: 60,
    users: 12,
    type: "all",
    k: 12,
    includeColdStart: true,
    adaptationMode: "light",
    personaMix: "balanced",
  };

  const runA = await buildSyntheticRecommendationSimulation({
    models,
    now,
    params,
    candidateConfig: DEFAULT_RECOMMENDATION_CONFIG,
  });

  const runB = await buildSyntheticRecommendationSimulation({
    models,
    now,
    params,
    candidateConfig: DEFAULT_RECOMMENDATION_CONFIG,
  });

  assert.equal(runA.mode, "synthetic");
  assert.deepEqual(runA.delta, runB.delta);
  assert.deepEqual(runA.coverage, runB.coverage);
  assert.deepEqual(runA.sampleJourneys, runB.sampleJourneys);
});
