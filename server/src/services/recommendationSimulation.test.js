"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildEvaluationGroups,
  buildRelevanceByPost,
  computeRankingMetrics,
  normalizeFeedType,
  parsePositiveInt,
  sortChronologicalCandidateIds,
} = require("./recommendationSimulation");

test("normalizeFeedType handles known values", () => {
  assert.equal(normalizeFeedType("all"), "all");
  assert.equal(normalizeFeedType("regular"), "regular");
  assert.equal(normalizeFeedType("market"), "market");
  assert.equal(normalizeFeedType("unknown"), "unknown");
});

test("parsePositiveInt clamps to bounds", () => {
  assert.equal(parsePositiveInt("7", 14, 1, 60), 7);
  assert.equal(parsePositiveInt("-10", 14, 1, 60), 1);
  assert.equal(parsePositiveInt("999", 14, 1, 60), 60);
  assert.equal(parsePositiveInt("abc", 14, 1, 60), 14);
});

test("buildEvaluationGroups groups impressions by user/session/request", () => {
  const events = [
    {
      id: "1",
      userId: "u1",
      actionType: "feed_impression",
      targetType: "post",
      targetId: "p1",
      metadataJson: { requestId: "r1", feedType: "all" },
      sourceSurface: "social_feed",
      sessionId: "session-1",
      occurredAt: "2026-02-18T00:00:00.000Z",
    },
    {
      id: "2",
      userId: "u1",
      actionType: "feed_impression",
      targetType: "post",
      targetId: "p2",
      metadataJson: { requestId: "r1", feedType: "all" },
      sourceSurface: "social_feed",
      sessionId: "session-1",
      occurredAt: "2026-02-18T00:00:01.000Z",
    },
  ];

  const grouped = buildEvaluationGroups({ events, requestedType: "all" });
  assert.equal(grouped.groups.length, 1);
  assert.equal(grouped.groups[0].impressionOrder.length, 2);
  assert.equal(grouped.groups[0].impressionOrder[0], "p1");
  assert.equal(grouped.groups[0].impressionOrder[1], "p2");
});

test("buildEvaluationGroups uses sessionInstanceId when sessionId is missing", () => {
  const events = [
    {
      id: "1",
      userId: "u1",
      actionType: "feed_impression",
      targetType: "post",
      targetId: "p1",
      metadataJson: { requestId: "r1", feedType: "all", sessionInstanceId: "instance-1" },
      sourceSurface: "social_feed",
      sessionId: null,
      occurredAt: "2026-02-18T00:00:00.000Z",
    },
    {
      id: "2",
      userId: "u1",
      actionType: "feed_click",
      targetType: "post",
      targetId: "p1",
      metadataJson: { requestId: "r1", sessionInstanceId: "instance-1" },
      sourceSurface: "social_feed",
      sessionId: null,
      occurredAt: "2026-02-18T01:00:00.000Z",
    },
    {
      id: "3",
      userId: "u1",
      actionType: "feed_impression",
      targetType: "post",
      targetId: "p2",
      metadataJson: { requestId: "r1", feedType: "all", sessionInstanceId: "instance-1" },
      sourceSurface: "social_feed",
      sessionId: null,
      occurredAt: "2026-02-18T01:00:01.000Z",
    },
  ];

  const grouped = buildEvaluationGroups({ events, requestedType: "all" });
  assert.equal(grouped.groups.length, 1);
  assert.equal(grouped.groups[0].impressionOrder.length, 2);
});

test("buildRelevanceByPost attributes click, dwell, and strong actions", () => {
  const group = {
    requestId: "req-1",
    startAt: "2026-02-18T00:00:00.000Z",
  };

  const sessionEvents = [
    {
      actionType: "feed_click",
      targetType: "post",
      targetId: "p1",
      metadataJson: { requestId: "req-1" },
      occurredAt: "2026-02-18T00:00:02.000Z",
    },
    {
      actionType: "feed_dwell",
      targetType: "post",
      targetId: "p1",
      metadataJson: { requestId: "req-1", dwellMs: 3000 },
      occurredAt: "2026-02-18T00:00:03.000Z",
    },
    {
      actionType: "post_like",
      targetType: "post",
      targetId: "p1",
      metadataJson: {},
      occurredAt: "2026-02-18T00:00:04.000Z",
    },
  ];

  const relevance = buildRelevanceByPost({
    group,
    sessionEvents,
    candidateIdSet: new Set(["p1"]),
  });

  assert.ok((relevance.get("p1") || 0) > 3);
});

test("computeRankingMetrics returns non-zero metrics when relevant item is ranked", () => {
  const rankingIds = ["p1", "p2", "p3"];
  const relevance = new Map([
    ["p2", 3],
    ["p3", 1],
  ]);

  const metrics = computeRankingMetrics(rankingIds, relevance, 3);
  assert.ok(metrics.ndcgAtK > 0);
  assert.ok(metrics.mrrAtK > 0);
  assert.ok(metrics.weightedGainAtK > 0);
});

test("sortChronologicalCandidateIds sorts by newest createdAt first", () => {
  const ordered = sortChronologicalCandidateIds([
    { id: "p1", createdAt: "2026-02-17T00:00:00.000Z" },
    { id: "p2", createdAt: "2026-02-18T00:00:00.000Z" },
    { id: "p3", createdAt: "2026-02-18T00:00:00.000Z" },
  ]);

  assert.deepEqual(ordered, ["p2", "p3", "p1"]);
});
