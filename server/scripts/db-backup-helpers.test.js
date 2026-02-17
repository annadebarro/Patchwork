"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BACKUP_VERSION,
  TABLE_INSERT_ORDER,
  listPrunableBackupNames,
  toBackupFilename,
  validateBackupPayload,
} = require("./db-backup-helpers");

test("toBackupFilename returns timestamped filename", () => {
  const filename = toBackupFilename(new Date("2026-02-16T15:04:05.000Z"));
  assert.equal(filename, "backup-20260216-150405.json");
});

test("listPrunableBackupNames returns names older than retention", () => {
  const files = [
    "backup-20260216-100000.json",
    "backup-20260216-110000.json",
    "backup-20260216-120000.json",
    "backup-20260216-130000.json",
    "backup-20260216-140000.json",
    "backup-20260216-150000.json",
    "notes.txt",
  ];

  const stale = listPrunableBackupNames(files, 3);
  assert.deepEqual(stale, [
    "backup-20260216-120000.json",
    "backup-20260216-110000.json",
    "backup-20260216-100000.json",
  ]);
});

test("validateBackupPayload accepts valid payload and rejects invalid payload", () => {
  const tables = TABLE_INSERT_ORDER.reduce((acc, tableName) => {
    acc[tableName] = [];
    return acc;
  }, {});

  const validPayload = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  };
  const validResult = validateBackupPayload(validPayload);
  assert.equal(validResult.valid, true);

  const invalidResult = validateBackupPayload({
    version: "wrong-version",
    createdAt: "",
    tables: {},
  });
  assert.equal(invalidResult.valid, false);
  assert.match(invalidResult.error, /Unsupported backup version/);
});
