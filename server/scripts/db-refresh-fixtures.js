"use strict";

require("dotenv").config();

const path = require("path");
const { backupDatabaseToJson } = require("./db-backup-json");
const { BACKUP_BASE_DIR } = require("./db-backup-helpers");
const { resetDatabaseSafe } = require("./db-reset-safe");
const { parseBooleanArg, seedFixtures } = require("./db-seed-fixtures");

const DEFAULT_SEED = 422;

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

async function refreshFixtures({
  backupDir = BACKUP_BASE_DIR,
  seed = DEFAULT_SEED,
  userCount,
  postCount,
  regularPostRatio,
  userDaysBack,
  postDaysBack,
  recentWindowDays,
  recentAuthorCap,
  append,
} = {}) {
  const backup = await backupDatabaseToJson({ outputDir: backupDir });
  await resetDatabaseSafe({ backupFirst: false });
  const seedResult = await seedFixtures({
    seed,
    userCount,
    postCount,
    regularPostRatio,
    userDaysBack,
    postDaysBack,
    recentWindowDays,
    recentAuthorCap,
    append,
  });

  return {
    backupPath: backup.backupPath,
    backupRowCounts: backup.rowCounts,
    seed,
    insertedCounts: seedResult.counts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.confirm !== "REFRESH") {
    throw new Error('Refresh blocked. Re-run with --confirm=REFRESH to proceed.');
  }

  const seedValue = Number.parseInt(args.seed, 10);
  const seed = Number.isFinite(seedValue) ? seedValue : DEFAULT_SEED;
  const userCountValue = Number.parseInt(args.users, 10);
  const postCountValue = Number.parseInt(args.posts, 10);
  const regularRatioValue = Number.parseFloat(args.regularRatio);
  const userDaysBackValue = Number.parseInt(args.userDaysBack, 10);
  const postDaysBackValue = Number.parseInt(args.postDaysBack, 10);
  const recentWindowDaysValue = Number.parseInt(args.recentWindowDays, 10);
  const recentAuthorCapValue = Number.parseInt(args.recentAuthorCap, 10);
  const append = parseBooleanArg(args.append, false);
  const backupDir = typeof args["backup-dir"] === "string" && args["backup-dir"].trim()
    ? path.resolve(args["backup-dir"])
    : BACKUP_BASE_DIR;

  const result = await refreshFixtures({
    backupDir,
    seed,
    userCount: Number.isFinite(userCountValue) ? userCountValue : undefined,
    postCount: Number.isFinite(postCountValue) ? postCountValue : undefined,
    regularPostRatio:
      Number.isFinite(regularRatioValue) && regularRatioValue >= 0 && regularRatioValue <= 1
        ? regularRatioValue
        : undefined,
    userDaysBack: Number.isFinite(userDaysBackValue) ? userDaysBackValue : undefined,
    postDaysBack: Number.isFinite(postDaysBackValue) ? postDaysBackValue : undefined,
    recentWindowDays: Number.isFinite(recentWindowDaysValue) ? recentWindowDaysValue : undefined,
    recentAuthorCap: Number.isFinite(recentAuthorCapValue) ? recentAuthorCapValue : undefined,
    append,
  });

  console.log(`Refresh complete. Backup: ${result.backupPath}`);
  console.log(`Seed: ${result.seed}`);
  console.log(`Inserted rows: ${JSON.stringify(result.insertedCounts, null, 2)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("db-refresh-fixtures failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  refreshFixtures,
};
