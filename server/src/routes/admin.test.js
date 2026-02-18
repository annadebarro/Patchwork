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
