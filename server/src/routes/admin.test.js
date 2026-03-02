"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { buildAdminRouter } = require("./admin");

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

function createStubModels({ legacyUserActions = false } = {}) {
  const userActionColumns = legacyUserActions
    ? ["action_type", "created_at"]
    : ["action_type", "occurred_at", "session_id", "metadata_json"];

  const sequelize = {
    fn: (_name, _col) => "count_fn",
    col: (value) => value,
    query: async (sql, options = {}) => {
      if (sql.includes("information_schema.columns")) {
        const tableName = options?.replacements?.tableName;
        if (tableName === "user_actions") {
          return userActionColumns.map((columnName) => ({ column_name: columnName }));
        }
        if (tableName === "posts") {
          return [{ column_name: "style_tags" }, { column_name: "color_tags" }];
        }
        return [];
      }
      if (sql.includes("FROM user_actions") && sql.includes("GROUP BY action_type")) {
        return [
          { actionType: "feed_impression", count: "200" },
          { actionType: "post_like", count: "30" },
        ];
      }
      if (sql.includes("WITH feed_events")) {
        if (legacyUserActions) {
          return [{ total_events: "100", with_session_id: "0", with_request_id: "0" }];
        }
        return [{ total_events: "100", with_session_id: "70", with_request_id: "65" }];
      }
      if (sql.includes("style_tags")) {
        return [{ value: "casual", count: "24" }];
      }
      if (sql.includes("color_tags")) {
        return [{ value: "black", count: "19" }];
      }
      return [];
    },
  };

  return {
    User: {
      sequelize,
      count: async () => 10,
    },
    Post: {
      count: async ({ where } = {}) => {
        if (where?.type === "regular") return 6;
        if (where?.type === "market") return 4;
        return 10;
      },
    },
  };
}

test("admin route returns 403 for non-admin users", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "viewer-user" };
          next();
        },
        adminMiddlewareFn: (_req, res) => {
          res.status(403).json({ message: "Admin access required." });
        },
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/overview`);
    assert.equal(res.status, 403);
    const payload = await res.json();
    assert.equal(payload.message, "Admin access required.");
  });
});

test("admin route returns recommendation overview for admins", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/overview`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.overview.counts.users, 10);
    assert.equal(payload.overview.counts.postsByType.regular, 6);
    assert.equal(payload.overview.counts.postsByType.market, 4);
    assert.equal(payload.overview.telemetryCoverage.totalFeedEvents, 100);
    assert.equal(payload.overview.topTags.style[0].value, "casual");
  });
});

test("admin route supports legacy user_actions schema without telemetry columns", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: () => createStubModels({ legacyUserActions: true }),
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/overview`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.overview.counts.users, 10);
    assert.equal(payload.overview.actions7d[0].actionType, "feed_impression");
    assert.equal(payload.overview.telemetryCoverage.withSessionId, 0);
    assert.equal(payload.overview.telemetryCoverage.withRequestId, 0);
  });
});

test("admin simulation route validates type query", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
        buildRecommendationSimulationFn: async () => ({ ok: true }),
        createSimulationRunFn: async () => ({ id: "run-1" }),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/simulate?type=invalid`);
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.match(payload.message, /type must be one of all, regular, or market/i);
  });
});

test("admin simulation route returns simulation payload for admins", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
        buildRecommendationSimulationFn: async ({ days, type, k }) => ({
          generatedAt: new Date().toISOString(),
          params: { days, type, k },
          baseline: { requests: 10, ndcgAtK: 0.2, mrrAtK: 0.1, weightedGainAtK: 1.2 },
          candidate: { requests: 10, ndcgAtK: 0.3, mrrAtK: 0.2, weightedGainAtK: 1.8 },
          delta: { requests: 10, ndcgAtK: 0.1, mrrAtK: 0.1, weightedGainAtK: 0.6 },
          coverage: { groupsEvaluated: 10 },
          slices: [],
        }),
        createSimulationRunFn: async () => ({ id: "run-2" }),
      })
    );

    const res = await fetch(
      `http://127.0.0.1:${port}/api/admin/recommendations/simulate?days=7&type=regular&k=15`
    );
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.simulation.params.days, 7);
    assert.equal(payload.simulation.params.type, "regular");
    assert.equal(payload.simulation.params.k, 15);
    assert.equal(payload.simulation.delta.ndcgAtK, 0.1);
  });
});

test("admin simulation POST supports synthetic mode payload", async () => {
  await withServer(async ({ app, port }) => {
    let captured = null;
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
        buildRecommendationSimulationFn: async (input) => {
          captured = input;
          return {
            mode: "synthetic",
            generatedAt: new Date().toISOString(),
            params: input.params,
            baseline: { requests: 10, ndcgAtK: 0.2, mrrAtK: 0.1, weightedGainAtK: 1.2 },
            candidate: { requests: 10, ndcgAtK: 0.3, mrrAtK: 0.2, weightedGainAtK: 1.8 },
            delta: { requests: 10, ndcgAtK: 0.1, mrrAtK: 0.1, weightedGainAtK: 0.6 },
            coverage: { sessionsEvaluated: 10 },
            slices: [],
          };
        },
        getActiveConfigFn: async () => ({
          config: {
            version: "hybrid_v1",
            regularWeights: {
              followAff: 1.8,
              authorAff: 1.2,
              styleMatch: 1.0,
              colorMatch: 0.6,
              brandMatch: 0.6,
              engagementVelocity: 0.9,
              freshness: 0.8,
            },
            marketWeights: {
              followAff: 1.6,
              authorAff: 1.0,
              categoryMatch: 1.0,
              brandMatch: 0.8,
              sizeMatch: 0.9,
              priceBandMatch: 0.8,
              conditionMatch: 0.7,
              engagementVelocity: 0.8,
              freshness: 0.7,
            },
            freshnessHalfLifeDays: { regular: 7, market: 14 },
            blend: {
              defaultMarketShare: 0.4,
              minMarketShare: 0.2,
              maxMarketShare: 0.8,
              minActionsForLearnedShare: 10,
            },
            diversityCaps: [
              { maxRankExclusive: 20, maxPerAuthor: 2 },
              { maxRankExclusive: 30, maxPerAuthor: 3 },
            ],
            pools: {
              defaultLimitPerType: 250,
              regularRecencyDays: 180,
              marketRecencyDays: 365,
              engagementWindowDays: 30,
              preferenceWindowDays: 90,
            },
            actionSignalWeights: {
              user_follow: 3,
              post_patch_save: 3,
              post_like: 2,
              comment_create: 2,
              comment_like: 1,
              user_unfollow: -3,
              post_unlike: -2,
              comment_unlike: -1,
              feed_click: 0.5,
              feed_dwell: 0.25,
            },
          },
        }),
        createSimulationRunFn: async () => ({ id: "run-synthetic" }),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "synthetic",
        seed: "demo-seed",
        sessions: 120,
        users: 20,
        type: "all",
        k: 15,
      }),
    });

    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.simulation.mode, "synthetic");
    assert.equal(payload.runId, "run-synthetic");
    assert.equal(captured.mode, "synthetic");
    assert.equal(captured.params.seed, "demo-seed");
  });
});

test("admin config apply endpoint enforces confirmation", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/config/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "nope" }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.match(payload.message, /confirm must be APPLY/i);
  });
});

test("admin config rollback endpoint enforces confirmation", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/config/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "nope" }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.match(payload.message, /confirm must be ROLLBACK/i);
  });
});

test("admin runs endpoint forwards track and date filters", async () => {
  await withServer(async ({ app, port }) => {
    let captured = null;
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
        listSimulationRunsFn: async (input) => {
          captured = input;
          return [];
        },
      })
    );

    const from = "2026-02-01T00:00:00.000Z";
    const to = "2026-02-20T00:00:00.000Z";
    const res = await fetch(
      `http://127.0.0.1:${port}/api/admin/recommendations/runs?mode=synthetic&track=balanced&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=5`
    );

    assert.equal(res.status, 200);
    assert.equal(captured.mode, "synthetic");
    assert.equal(captured.track, "balanced");
    assert.equal(captured.limit, 5);
    assert.equal(new Date(captured.from).toISOString(), from);
    assert.equal(new Date(captured.to).toISOString(), to);
  });
});

test("admin run detail endpoint returns run payload", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
        getSimulationRunByIdFn: async () => ({
          id: "run-123",
          mode: "synthetic",
          params: { tracks: ["realism", "balanced"] },
          resultSummary: {},
        }),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/runs/run-123`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.run.id, "run-123");
    assert.equal(payload.run.mode, "synthetic");
  });
});

test("admin schema health endpoint returns diagnostics payload", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/admin",
      buildAdminRouter({
        getModelsFn: createStubModels,
        authMiddlewareFn: (req, _res, next) => {
          req.user = { id: "admin-user" };
          next();
        },
        adminMiddlewareFn: (_req, _res, next) => next(),
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/recommendations/schema-health`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(payload.schemaHealth);
    assert.ok(Array.isArray(payload.schemaHealth.checks));
  });
});
