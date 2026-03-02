"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSyntheticRecommendationSimulation,
  parseSyntheticParams,
} = require("./recommendationSyntheticSimulation");
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

function buildSkewedModels() {
  const dominantAuthorId = "99990000-0000-4000-8000-000000000001";
  const regularPosts = Array.from({ length: 180 }).map((_, index) => {
    const dominant = index < 70;
    const authorSuffix = dominant ? "000001" : String(index).padStart(6, "0");
    return {
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      type: "regular",
      isPublic: true,
      isSold: false,
      createdAt: new Date(Date.UTC(2026, 1, 1 + (index % 30))).toISOString(),
      styleTags: ["casual"],
      colorTags: ["black"],
      brand: "uniqlo",
      category: "unknown",
      sizeLabel: "unknown",
      priceCents: null,
      condition: "unknown",
      author: {
        id: dominant ? dominantAuthorId : `99990000-0000-4000-8000-000000${authorSuffix}`,
        username: dominant ? "dominant_author" : `other_author_${index}`,
        name: dominant ? "Dominant Author" : `Other Author ${index}`,
        profilePicture: null,
      },
    };
  });

  const marketPosts = Array.from({ length: 20 }).map((_, index) => ({
    id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    type: "market",
    isPublic: true,
    isSold: false,
    createdAt: new Date(Date.UTC(2026, 1, 1 + (index % 20))).toISOString(),
    styleTags: ["vintage"],
    colorTags: ["olive"],
    brand: "levi's",
    category: "outerwear",
    sizeLabel: "m",
    priceCents: 9000,
    condition: "good",
    author: {
      id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
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

test("synthetic simulation is deterministic for fixed seed and params across tracks", async () => {
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
    tracks: ["realism", "balanced"],
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
  assert.ok(runA.tracks?.realism);
  assert.ok(runA.tracks?.balanced);
  assert.deepEqual(runA.delta, runB.delta);
  assert.deepEqual(runA.coverage, runB.coverage);
  assert.deepEqual(runA.sampleJourneys, runB.sampleJourneys);
  assert.deepEqual(runA.tracks, runB.tracks);
});

test("balanced track reduces author concentration on skewed inventory", async () => {
  const models = buildSkewedModels();
  const now = new Date("2026-02-20T00:00:00.000Z");
  const result = await buildSyntheticRecommendationSimulation({
    models,
    now,
    params: {
      seed: "skewed-bias-test",
      sessions: 140,
      users: 24,
      type: "all",
      k: 20,
      includeColdStart: false,
      adaptationMode: "light",
      personaMix: "balanced",
      tracks: ["realism", "balanced"],
    },
    candidateConfig: DEFAULT_RECOMMENDATION_CONFIG,
  });

  const realismTopAuthor = result.tracks.realism.biasDiagnostics.topAuthorSharePct;
  const balancedTopAuthor = result.tracks.balanced.biasDiagnostics.topAuthorSharePct;

  assert.ok(Number.isFinite(realismTopAuthor));
  assert.ok(Number.isFinite(balancedTopAuthor));
  assert.ok(
    balancedTopAuthor < realismTopAuthor,
    `expected balanced top author share (${balancedTopAuthor}) < realism (${realismTopAuthor})`
  );
});

test("parseSyntheticParams defaults to dual tracks and balanced policy", () => {
  const parsed = parseSyntheticParams({});
  assert.deepEqual(parsed.tracks, ["realism", "balanced"]);
  assert.equal(parsed.balancedPolicy.recencyShares.d0to7, 0.4);
  assert.equal(parsed.balancedPolicy.recencyShares.d8to30, 0.35);
  assert.equal(parsed.balancedPolicy.recencyShares.d31plus, 0.25);
});
