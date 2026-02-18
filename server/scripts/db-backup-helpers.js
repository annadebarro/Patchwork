"use strict";

const path = require("path");

const BACKUP_VERSION = "patchwork-db-backup-v1";
const BACKUP_KEEP_LATEST_DEFAULT = 5;
const BACKUP_BASE_DIR = path.resolve(__dirname, "../backups/db");

const TABLE_INSERT_ORDER = Object.freeze([
  "users",
  "conversations",
  "posts",
  "follows",
  "conversation_participants",
  "messages",
  "user_actions",
  "likes",
  "comments",
  "quilts",
  "patches",
  "comment_likes",
  "notifications",
]);

const TABLE_TRUNCATE_ORDER = Object.freeze([
  "comment_likes",
  "notifications",
  "patches",
  "quilts",
  "comments",
  "likes",
  "user_actions",
  "messages",
  "conversation_participants",
  "conversations",
  "follows",
  "posts",
  "users",
]);

function toTimestampPart(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function toBackupFilename(date = new Date()) {
  return `backup-${toTimestampPart(date)}.json`;
}

function isBackupFilename(name) {
  return /^backup-\d{8}-\d{6}\.json$/.test(name);
}

function sortBackupNamesNewestFirst(names) {
  return [...names].sort((a, b) => b.localeCompare(a));
}

function listPrunableBackupNames(allNames, keepLatest = BACKUP_KEEP_LATEST_DEFAULT) {
  const normalizedKeepLatest =
    Number.isInteger(keepLatest) && keepLatest >= 0 ? keepLatest : BACKUP_KEEP_LATEST_DEFAULT;
  const candidates = sortBackupNamesNewestFirst(allNames.filter(isBackupFilename));
  return candidates.slice(normalizedKeepLatest);
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, error: "Backup payload must be an object." };
  }

  if (payload.version !== BACKUP_VERSION) {
    return { valid: false, error: `Unsupported backup version: ${payload.version || "unknown"}.` };
  }

  if (typeof payload.createdAt !== "string" || !payload.createdAt.trim()) {
    return { valid: false, error: "Backup payload is missing createdAt." };
  }

  if (!payload.tables || typeof payload.tables !== "object" || Array.isArray(payload.tables)) {
    return { valid: false, error: "Backup payload is missing tables object." };
  }

  for (const tableName of TABLE_INSERT_ORDER) {
    if (!Array.isArray(payload.tables[tableName])) {
      return { valid: false, error: `Backup payload is missing table data for "${tableName}".` };
    }
  }

  return { valid: true };
}

module.exports = {
  BACKUP_BASE_DIR,
  BACKUP_KEEP_LATEST_DEFAULT,
  BACKUP_VERSION,
  TABLE_INSERT_ORDER,
  TABLE_TRUNCATE_ORDER,
  isBackupFilename,
  listPrunableBackupNames,
  sortBackupNamesNewestFirst,
  toBackupFilename,
  validateBackupPayload,
};
