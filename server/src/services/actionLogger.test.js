"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractSessionId, logUserActionSafe, normalizeSurface } = require("./actionLogger");

const VALID_UUID = "e27c0be0-cf14-4ef3-b4f8-4e84cb83a2b0";

test("normalizeSurface returns known values and falls back to unknown", () => {
  assert.equal(normalizeSurface("social_feed"), "social_feed");
  assert.equal(normalizeSurface("POST_DETAIL"), "post_detail");
  assert.equal(normalizeSurface("not_valid"), "unknown");
  assert.equal(normalizeSurface(""), "unknown");
  assert.equal(normalizeSurface(undefined), "unknown");
});

test("extractSessionId returns UUID or null", () => {
  assert.equal(extractSessionId({ headers: { "x-pw-session-id": VALID_UUID } }), VALID_UUID);
  assert.equal(extractSessionId({ headers: { "x-pw-session-id": "bad-id" } }), null);
  assert.equal(extractSessionId({ headers: {} }), null);
});

test("logUserActionSafe writes a normalized event payload", async () => {
  const writes = [];
  const modelsOverride = {
    UserAction: {
      async create(payload) {
        writes.push(payload);
        return payload;
      },
    },
  };

  const writeResult = await logUserActionSafe({
    req: {
      method: "POST",
      headers: {
        "x-pw-surface": "post_detail",
        "x-pw-session-id": VALID_UUID,
      },
    },
    userId: "11111111-1111-4111-8111-111111111111",
    actionType: "post_like",
    targetType: "post",
    targetId: "22222222-2222-4222-8222-222222222222",
    metadata: {
      route: "/api/posts/:postId/like",
      method: "POST",
      postOwnerId: "33333333-3333-4333-8333-333333333333",
    },
    occurredAt: new Date("2026-02-10T00:00:00.000Z"),
    modelsOverride,
  });

  assert.equal(writeResult, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].sourceSurface, "post_detail");
  assert.equal(writes[0].sessionId, VALID_UUID);
  assert.equal(writes[0].actionType, "post_like");
  assert.equal(writes[0].targetType, "post");
  assert.equal(writes[0].targetId, "22222222-2222-4222-8222-222222222222");
  assert.equal(writes[0].metadataJson.route, "/api/posts/:postId/like");
});

test("logUserActionSafe returns false when logging is disabled", async () => {
  const prior = process.env.ACTION_LOGGING_ENABLED;
  process.env.ACTION_LOGGING_ENABLED = "false";

  let createCalled = false;
  const modelsOverride = {
    UserAction: {
      async create() {
        createCalled = true;
      },
    },
  };

  try {
    const writeResult = await logUserActionSafe({
      req: { headers: {} },
      userId: "11111111-1111-4111-8111-111111111111",
      actionType: "user_follow",
      targetType: "user",
      targetId: "22222222-2222-4222-8222-222222222222",
      metadata: {},
      modelsOverride,
    });

    assert.equal(writeResult, false);
    assert.equal(createCalled, false);
  } finally {
    if (prior === undefined) {
      delete process.env.ACTION_LOGGING_ENABLED;
    } else {
      process.env.ACTION_LOGGING_ENABLED = prior;
    }
  }
});
