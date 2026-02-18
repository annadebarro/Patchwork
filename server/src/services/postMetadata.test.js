"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  POST_TYPES,
  UNKNOWN,
  getPostMetadataOptions,
  normalizeAndValidatePostMetadata,
} = require("./postMetadata");

test("regular posts reject market-only fields", () => {
  const result = normalizeAndValidatePostMetadata(
    {
      category: "tops",
      styleTags: ["casual"],
    },
    {
      mode: "create",
      postType: POST_TYPES.REGULAR,
    }
  );

  assert.equal(result.error, "category cannot be set for regular posts.");
});

test("regular posts accept brand and tags and normalize market fields to unknown", () => {
  const result = normalizeAndValidatePostMetadata(
    {
      brand: " Nike ",
      styleTags: ["Streetwear", "Streetwear"],
      colorTags: ["Blue"],
    },
    {
      mode: "create",
      postType: POST_TYPES.REGULAR,
    }
  );

  assert.ok(!result.error);
  assert.equal(result.value.brand, "Nike");
  assert.deepEqual(result.value.styleTags, ["streetwear"]);
  assert.deepEqual(result.value.colorTags, ["blue"]);
  assert.equal(result.value.category, UNKNOWN);
  assert.equal(result.value.condition, UNKNOWN);
  assert.equal(result.value.sizeLabel, UNKNOWN);
});

test("market posts require category, condition, and sizeLabel", () => {
  const missingCategory = normalizeAndValidatePostMetadata(
    {
      condition: "used",
      sizeLabel: "m",
    },
    {
      mode: "create",
      postType: POST_TYPES.MARKET,
    }
  );
  assert.equal(missingCategory.error, "category is required for market posts.");
});

test("market posts validate subcategory against category", () => {
  const invalidSubcategory = normalizeAndValidatePostMetadata(
    {
      category: "tops",
      subcategory: "boots",
      condition: "used",
      sizeLabel: "m",
    },
    {
      mode: "create",
      postType: POST_TYPES.MARKET,
    }
  );

  assert.equal(invalidSubcategory.error, 'subcategory is invalid for category "tops".');
});

test("metadata options return type-specific profile shape", () => {
  const regular = getPostMetadataOptions({ postType: POST_TYPES.REGULAR });
  const market = getPostMetadataOptions({ postType: POST_TYPES.MARKET });
  const combined = getPostMetadataOptions();

  assert.equal(regular.postType, POST_TYPES.REGULAR);
  assert.equal(Boolean(regular.fields.category), false);
  assert.equal(Boolean(regular.fields.styleTags), true);

  assert.equal(market.postType, POST_TYPES.MARKET);
  assert.equal(Boolean(market.fields.category), true);
  assert.equal(Array.isArray(market.categories), true);

  assert.equal(Array.isArray(combined.postTypes), true);
  assert.equal(Boolean(combined.profiles.regular), true);
  assert.equal(Boolean(combined.profiles.market), true);
});
