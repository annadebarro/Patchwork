"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeConfig, normalizeConfig } = require("./recommendationConfig");
const { DEFAULT_RECOMMENDATION_CONFIG } = require("./recommendationEngine");

test("mergeConfig applies partial overrides while preserving required shape", () => {
  const merged = mergeConfig(DEFAULT_RECOMMENDATION_CONFIG, {
    regularWeights: { styleMatch: 1.7 },
    marketWeights: { categoryMatch: 1.4 },
    blend: { defaultMarketShare: 0.45 },
    novelty: { seenCooldownDays: 3 },
  });

  assert.equal(merged.regularWeights.styleMatch, 1.7);
  assert.equal(merged.marketWeights.categoryMatch, 1.4);
  assert.equal(merged.blend.defaultMarketShare, 0.45);
  assert.equal(merged.novelty.seenCooldownDays, 3);
  assert.equal(merged.novelty.excludeCurrentLikes, DEFAULT_RECOMMENDATION_CONFIG.novelty.excludeCurrentLikes);
  assert.equal(merged.marketWeights.followAff, DEFAULT_RECOMMENDATION_CONFIG.marketWeights.followAff);
});

test("normalizeConfig backfills novelty defaults for legacy configs", () => {
  const legacyConfig = {
    ...DEFAULT_RECOMMENDATION_CONFIG,
  };
  delete legacyConfig.novelty;

  const normalized = normalizeConfig(legacyConfig);

  assert.deepEqual(normalized.novelty, DEFAULT_RECOMMENDATION_CONFIG.novelty);
});

test("normalizeConfig rejects invalid blend boundaries", () => {
  assert.throws(
    () =>
      normalizeConfig({
        ...DEFAULT_RECOMMENDATION_CONFIG,
        blend: {
          ...DEFAULT_RECOMMENDATION_CONFIG.blend,
          minMarketShare: 0.9,
          maxMarketShare: 0.2,
        },
      }),
    /minMarketShare cannot be greater than blend\.maxMarketShare/i
  );
});

test("normalizeConfig rejects missing required weight keys", () => {
  assert.throws(
    () =>
      normalizeConfig({
        ...DEFAULT_RECOMMENDATION_CONFIG,
        regularWeights: {
          followAff: 1.8,
        },
      }),
    /regularWeights\.authorAff is required/i
  );
});
