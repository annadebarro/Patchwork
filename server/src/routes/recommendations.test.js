"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { buildRecommendationsRouter } = require("./recommendations");

async function withServer(handler) {
  const app = express();
  app.use(express.json());
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const port = server.address().port;
    await handler({ app, port });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("recommendations route returns hybrid_v1 response", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/recommendations",
      buildRecommendationsRouter({
        getModelsFn: () => ({}),
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "user-1" };
          next();
        },
        fetchHybridFn: async () => ({
          algorithm: "hybrid_v1",
          personalized: true,
          posts: [{ id: "post-1" }],
          hasMore: true,
          nextOffset: 1,
          timings: {
            profileMs: 10,
            candidateFetchMs: 20,
            scoringMs: 30,
            totalMs: 60,
          },
        }),
        fetchChronologicalFn: async () => {
          throw new Error("fallback should not be called");
        },
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/recommendations?limit=1&offset=0`);
    assert.equal(res.status, 200);

    const payload = await res.json();
    assert.equal(payload.algorithm, "hybrid_v1");
    assert.equal(payload.personalized, true);
    assert.equal(payload.posts.length, 1);
    assert.equal(payload.pagination.hasMore, true);
  });
});

test("recommendations route falls back to chronological on hybrid failure", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/recommendations",
      buildRecommendationsRouter({
        getModelsFn: () => ({}),
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "user-1" };
          next();
        },
        fetchHybridFn: async () => {
          throw new Error("hybrid exploded");
        },
        fetchChronologicalFn: async () => ({
          algorithm: "chronological_fallback",
          personalized: false,
          posts: [{ id: "post-2" }],
          hasMore: false,
          timings: {
            profileMs: 0,
            candidateFetchMs: 0,
            scoringMs: 0,
            totalMs: 5,
          },
        }),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/recommendations?limit=1&offset=0`);
    assert.equal(res.status, 200);

    const payload = await res.json();
    assert.equal(payload.algorithm, "chronological_fallback");
    assert.equal(payload.personalized, false);
    assert.equal(payload.fallback.active, true);
    assert.equal(payload.posts.length, 1);
  });
});

test("recommendations telemetry accepts valid events and drops invalid entries", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/recommendations",
      buildRecommendationsRouter({
        getModelsFn: () => ({}),
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "user-1" };
          next();
        },
        logUserActionSafeFn: async () => true,
      })
    );

    const body = {
      events: [
        {
          actionType: "feed_impression",
          postId: "post-1",
          feedType: "all",
          rankPosition: 1,
          algorithm: "hybrid_v1",
          requestId: "request-1",
          occurredAt: new Date().toISOString(),
        },
        {
          actionType: "invalid",
          postId: "post-2",
        },
      ],
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/recommendations/telemetry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    assert.equal(res.status, 202);
    const payload = await res.json();
    assert.equal(payload.acceptedCount, 1);
    assert.equal(payload.droppedCount, 1);
  });
});

test("recommendations route exposes debug scoring only for admin users", async () => {
  await withServer(async ({ app, port }) => {
    let capturedDebugTopN = null;
    app.use(
      "/api/recommendations",
      buildRecommendationsRouter({
        getModelsFn: () => ({}),
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user", role: "admin" };
          next();
        },
        fetchHybridFn: async ({ debugTopN }) => {
          capturedDebugTopN = debugTopN;
          return {
            algorithm: "hybrid_v1",
            personalized: true,
            posts: [{ id: "post-1" }],
            hasMore: false,
            nextOffset: null,
            debug: {
              top: [{ rank: 1, postId: "post-1", score: 1.234 }],
            },
            timings: {
              profileMs: 5,
              candidateFetchMs: 8,
              scoringMs: 9,
              totalMs: 22,
            },
          };
        },
      })
    );

    const res = await fetch(
      `http://127.0.0.1:${port}/api/recommendations?limit=1&offset=0&debugTopN=3`
    );
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(capturedDebugTopN, 3);
    assert.deepEqual(payload.debug.top, [{ rank: 1, postId: "post-1", score: 1.234 }]);
  });

  await withServer(async ({ app, port }) => {
    let capturedDebugTopN = null;
    app.use(
      "/api/recommendations",
      buildRecommendationsRouter({
        getModelsFn: () => ({}),
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "user-1", role: "user" };
          next();
        },
        fetchHybridFn: async ({ debugTopN }) => {
          capturedDebugTopN = debugTopN;
          return {
            algorithm: "hybrid_v1",
            personalized: true,
            posts: [{ id: "post-1" }],
            hasMore: false,
            nextOffset: null,
            debug: { top: [{ rank: 1, postId: "post-1" }] },
            timings: {
              profileMs: 5,
              candidateFetchMs: 8,
              scoringMs: 9,
              totalMs: 22,
            },
          };
        },
      })
    );

    const res = await fetch(
      `http://127.0.0.1:${port}/api/recommendations?limit=1&offset=0&debugTopN=3`
    );
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(capturedDebugTopN, 0);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "debug"), false);
  });
});
