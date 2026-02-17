"use strict";

require("dotenv").config();

const path = require("path");
const { Client } = require("pg");
const { backupDatabaseToJson } = require("./db-backup-json");
const { BACKUP_BASE_DIR, TABLE_TRUNCATE_ORDER } = require("./db-backup-helpers");

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const raw = token.slice(2);
    const eqIndex = raw.indexOf("=");
    if (eqIndex === -1) {
      args[raw] = true;
    } else {
      args[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
    }
  }
  return args;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

async function truncateAppTables(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    const truncateSql = `
      TRUNCATE ${TABLE_TRUNCATE_ORDER.map((table) => quoteIdentifier(table)).join(", ")}
      RESTART IDENTITY CASCADE;
    `;
    await client.query(truncateSql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

async function resetDatabaseSafe({
  databaseUrl = process.env.DATABASE_URL,
  backupFirst = true,
  backupDir = BACKUP_BASE_DIR,
} = {}) {
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL.");
  }

  let backup = null;
  if (backupFirst) {
    backup = await backupDatabaseToJson({
      databaseUrl,
      outputDir: backupDir,
    });
  }

  await truncateAppTables(databaseUrl);

  return {
    backupPath: backup?.backupPath || null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.confirm !== "RESET") {
    throw new Error('Reset blocked. Re-run with --confirm=RESET to proceed.');
  }

  const skipBackup = Boolean(args["skip-backup"]);
  const backupDir = typeof args["backup-dir"] === "string" && args["backup-dir"].trim()
    ? path.resolve(args["backup-dir"])
    : BACKUP_BASE_DIR;

  const result = await resetDatabaseSafe({
    backupFirst: !skipBackup,
    backupDir,
  });

  if (result.backupPath) {
    console.log(`Pre-reset backup created: ${result.backupPath}`);
  }
  console.log("Database reset complete.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("db-reset-safe failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  resetDatabaseSafe,
  truncateAppTables,
};
