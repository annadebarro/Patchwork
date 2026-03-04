"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { buildMarketplaceRouter } = require("./marketplace");

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

test("marketplace recommended returns requestId", async () => {
  await withServer(async ({ app, port }) => {
    app.use(
      "/api/marketplace",
      buildMarketplaceRouter({
        getModelsFn: () => ({
          Like: {
            findAll: async () => [],
          },
        }),
        optionalAuthMiddlewareFn: (req, _res, next) => {
          req.user = { id: "user-1" };
          next();
        },
        fetchHybridFn: async () => ({
          algorithm: "hybrid_v1",
          personalized: true,
          posts: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              type: "market",
              caption: "Vintage jacket",
              imageUrl: null,
              imageUrls: [],
              priceCents: 4200,
              category: "outerwear",
              condition: "used",
              isSold: false,
              createdAt: new Date().toISOString(),
              author: {
                id: "seller-1",
                username: "seller",
                name: "Seller",
                profilePicture: null,
              },
            },
          ],
          hasMore: false,
          nextOffset: null,
        }),
        fetchChronologicalFn: async () => {
          throw new Error("fallback should not run");
        },
      })
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/marketplace/recommended?limit=1`);
    assert.equal(res.status, 200);

    const payload = await res.json();
    assert.equal(typeof payload.requestId, "string");
    assert.ok(payload.requestId.length > 0);
    assert.equal(payload.algorithm, "hybrid_v1");
    assert.equal(payload.items.length, 1);
  });
});
