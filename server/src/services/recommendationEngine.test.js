"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const {
  DEFAULT_MARKET_SHARE,
  buildUserPreferenceProfile,
  blendAndDiversify,
  fetchCandidatePools,
  filterUuidLike,
  scoreRegularPost,
  toPriceBand,
} = require("./recommendationEngine");

function createProfile(overrides = {}) {
  return {
    followedAuthorSet: new Set(),
    authorAffinity: new Map(),
    categoryAffinity: new Map(),
    brandAffinity: new Map(),
    styleAffinity: new Map(),
    colorAffinity: new Map(),
    sizeAffinity: new Map(),
    priceBandAffinity: new Map(),
    conditionAffinity: new Map(),
    marketShare: DEFAULT_MARKET_SHARE,
    relevantActionCount: 0,
    ...overrides,
  };
}

test("toPriceBand maps expected thresholds", () => {
  assert.equal(toPriceBand(null), "unknown");
  assert.equal(toPriceBand(1000), "budget");
  assert.equal(toPriceBand(3000), "mid");
  assert.equal(toPriceBand(10000), "premium");
  assert.equal(toPriceBand(20000), "luxury");
});

test("scoreRegularPost boosts followed authors", () => {
  const now = new Date("2026-02-18T00:00:00.000Z");
  const basePost = {
    id: "post-1",
    createdAt: "2026-02-17T00:00:00.000Z",
    styleTags: ["casual"],
    colorTags: ["black"],
    brand: "nike",
    author: { id: "author-1" },
    _engagementVelocity: 0.5,
  };

  const followedProfile = createProfile({
    followedAuthorSet: new Set(["author-1"]),
    styleAffinity: new Map([["casual", 1]]),
    colorAffinity: new Map([["black", 1]]),
    brandAffinity: new Map([["nike", 1]]),
  });
  const nonFollowedProfile = createProfile({
    followedAuthorSet: new Set(),
    styleAffinity: new Map([["casual", 1]]),
    colorAffinity: new Map([["black", 1]]),
    brandAffinity: new Map([["nike", 1]]),
  });

  const followedScore = scoreRegularPost(basePost, { profile: followedProfile, now }).score;
  const nonFollowedScore = scoreRegularPost(basePost, { profile: nonFollowedProfile, now }).score;

  assert.ok(followedScore > nonFollowedScore);
});

test("blendAndDiversify uses default market share when history is sparse", () => {
  const profile = createProfile({
    marketShare: 0.8,
    relevantActionCount: 2,
  });

  const regularScored = [
    { score: 10, post: { id: "r1", createdAt: new Date().toISOString(), author: { id: "a1" } } },
    { score: 9, post: { id: "r2", createdAt: new Date().toISOString(), author: { id: "a2" } } },
  ];
  const marketScored = [
    { score: 10, post: { id: "m1", createdAt: new Date().toISOString(), author: { id: "b1" } } },
    { score: 9, post: { id: "m2", createdAt: new Date().toISOString(), author: { id: "b2" } } },
  ];

  const result = blendAndDiversify({
    regularScored,
    marketScored,
    profile,
    requestedType: null,
    limit: 4,
  });

  assert.equal(result.mix.marketShare, DEFAULT_MARKET_SHARE);
  assert.equal(result.posts.length, 4);
});

test("fetchCandidatePools applies own-post and sold filters", async () => {
  const calls = [];
  const makePost = (id, type, authorId) => ({
    toJSON: () => ({
      id,
      type,
      author: { id: authorId },
      createdAt: new Date().toISOString(),
      styleTags: [],
      colorTags: [],
      brand: "",
      category: "unknown",
      condition: "unknown",
      sizeLabel: "unknown",
      priceCents: null,
    }),
  });

  const models = {
    User: {},
    Post: {
      sequelize: {
        query: async () => [],
      },
      findAll: async ({ where }) => {
        calls.push(where);
        if (where.type === "regular") {
          return [makePost("regular-1", "regular", "author-1")];
        }
        return [makePost("market-1", "market", "author-2")];
      },
    },
  };

  const result = await fetchCandidatePools({
    models,
    userId: "viewer-1",
    type: null,
    limitPerType: 5,
    now: new Date(),
  });

  assert.equal(calls.length, 2);
  const regularWhere = calls.find((entry) => entry.type === "regular");
  const marketWhere = calls.find((entry) => entry.type === "market");

  assert.equal(regularWhere.userId[Op.ne], "viewer-1");
  assert.equal(marketWhere.userId[Op.ne], "viewer-1");
  assert.equal(marketWhere.isSold, false);

  assert.equal(result.regularCandidates.length, 1);
  assert.equal(result.marketCandidates.length, 1);
  assert.equal(result.regularCandidates[0]._engagementVelocity, 0);
  assert.equal(result.marketCandidates[0]._engagementVelocity, 0);
});

test("filterUuidLike drops invalid IDs", () => {
  const ids = filterUuidLike([
    "not-a-uuid",
    "  ",
    "a7df1162-04d7-4846-be01-21a095c96e63",
    "A7DF1162-04D7-4846-BE01-21A095C96E63",
  ]);

  assert.equal(ids.length, 1);
  assert.equal(ids[0], "a7df1162-04d7-4846-be01-21a095c96e63");
});

test("buildUserPreferenceProfile ignores invalid post IDs in action history", async () => {
  const validPostId = "a7df1162-04d7-4846-be01-21a095c96e63";
  let capturedWhere = null;

  const models = {
    Follow: {
      findAll: async () => [],
    },
    UserAction: {
      findAll: async () => [
        {
          actionType: "post_like",
          targetType: "post",
          targetId: "test-target",
          metadataJson: {},
          occurredAt: new Date().toISOString(),
        },
        {
          actionType: "post_like",
          targetType: "post",
          targetId: validPostId,
          metadataJson: {},
          occurredAt: new Date().toISOString(),
        },
      ],
    },
    Post: {
      findAll: async ({ where }) => {
        capturedWhere = where;
        return [];
      },
    },
  };

  await buildUserPreferenceProfile({
    models,
    userId: "viewer-1",
    now: new Date(),
  });

  assert.deepEqual(capturedWhere.id[Op.in], [validPostId]);
});
