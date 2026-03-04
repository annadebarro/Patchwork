"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const {
  fetchChronologicalRecommendations,
  fetchHybridRecommendations,
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
    User: {
      sequelize: {
        query: async () => [],
      },
    },
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

test("fetchChronologicalRecommendations excludes novelty-suppressed post IDs", async () => {
  const excludedPostId = "11111111-1111-4111-8111-111111111111";
  let capturedWhere = null;

  const models = {
    Post: {
      findAll: async ({ where }) => {
        capturedWhere = where;
        return [];
      },
    },
    Like: {
      findAll: async () => [{ postId: excludedPostId }],
    },
    Patch: {
      findAll: async () => [],
    },
    UserAction: {
      sequelize: {
        query: async () => [],
      },
    },
    User: {
      sequelize: {
        query: async () => [],
      },
    },
  };

  await fetchChronologicalRecommendations({
    models,
    type: "regular",
    limit: 10,
    offset: 0,
    userId: "viewer-1",
  });

  assert.deepEqual(capturedWhere.id[Op.notIn], [excludedPostId]);
});

test("fetchHybridRecommendations omits novelty-suppressed posts from candidate pools", async () => {
  const excludedPostId = "11111111-1111-4111-8111-111111111111";
  const allowedPostId = "22222222-2222-4222-8222-222222222222";
  const seenPostId = "33333333-3333-4333-8333-333333333333";
  const postQueries = [];

  const models = {
    User: {
      sequelize: {
        query: async () => [],
      },
    },
    Follow: {
      findAll: async () => [],
    },
    Like: {
      findAll: async () => [{ postId: excludedPostId }],
    },
    Patch: {
      findAll: async () => [],
    },
    UserAction: {
      findAll: async () => [],
      sequelize: {
        query: async (_sql, options) => {
          if (options?.replacements?.actionTypes) {
            return [{ postId: seenPostId }];
          }
          return [];
        },
      },
    },
    Post: {
      sequelize: {
        query: async () => [],
      },
      findAll: async ({ where }) => {
        postQueries.push(where);
        if (where.type === "regular") {
          return [
            {
              toJSON: () => ({
                id: allowedPostId,
                type: "regular",
                createdAt: new Date().toISOString(),
                styleTags: [],
                colorTags: [],
                brand: "",
                category: "unknown",
                condition: "unknown",
                sizeLabel: "unknown",
                priceCents: null,
                author: { id: "author-1" },
              }),
            },
          ];
        }
        return [];
      },
    },
  };

  const result = await fetchHybridRecommendations({
    models,
    type: "regular",
    limit: 10,
    offset: 0,
    userId: "viewer-1",
    now: new Date("2026-03-02T00:00:00.000Z"),
  });

  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].id, allowedPostId);
  assert.ok(postQueries.length >= 1);
  for (const where of postQueries) {
    assert.ok(where.id[Op.notIn].includes(excludedPostId));
    assert.ok(where.id[Op.notIn].includes(seenPostId));
  }
});
