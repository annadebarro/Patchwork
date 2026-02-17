"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rowsForInsert } = require("./db-restore-json");

test("rowsForInsert sorts comment rows with parents before replies", () => {
  const parentId = "parent-1";
  const rows = [
    {
      id: "reply-1",
      parent_id: parentId,
      created_at: "2026-02-16T10:02:00.000Z",
    },
    {
      id: parentId,
      parent_id: null,
      created_at: "2026-02-16T10:01:00.000Z",
    },
  ];

  const sorted = rowsForInsert("comments", rows);
  assert.equal(sorted[0].id, parentId);
  assert.equal(sorted[1].id, "reply-1");
});

test("rowsForInsert leaves non-comment tables unchanged", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  const output = rowsForInsert("users", rows);
  assert.equal(output, rows);
});
