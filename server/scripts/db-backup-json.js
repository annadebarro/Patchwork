"use strict";

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const { Client } = require("pg");
const {
  BACKUP_BASE_DIR,
  BACKUP_KEEP_LATEST_DEFAULT,
  BACKUP_VERSION,
  TABLE_INSERT_ORDER,
  listPrunableBackupNames,
  toBackupFilename,
} = require("./db-backup-helpers");

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

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

async function getTableColumns(client, tableName) {
  const query = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position ASC;
  `;
  const result = await client.query(query, [tableName]);
  return result.rows.map((row) => row.column_name);
}

function buildSelectSql(tableName, columns) {
  let orderBy = "";
  if (columns.includes("created_at") && columns.includes("id")) {
    orderBy = " ORDER BY created_at ASC, id ASC";
  } else if (columns.includes("id")) {
    orderBy = " ORDER BY id ASC";
  }
  return `SELECT * FROM ${quoteIdentifier(tableName)}${orderBy};`;
}

async function pruneOldBackups(outputDir, keepLatest) {
  const entries = await fs.readdir(outputDir);
  const stale = listPrunableBackupNames(entries, keepLatest);
  await Promise.all(
    stale.map((name) => fs.unlink(path.join(outputDir, name)))
  );
  return stale;
}

async function backupDatabaseToJson({
  databaseUrl = process.env.DATABASE_URL,
  outputDir = BACKUP_BASE_DIR,
  keepLatest = BACKUP_KEEP_LATEST_DEFAULT,
  now = new Date(),
} = {}) {
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await fs.mkdir(outputDir, { recursive: true });

    const tables = {};
    const rowCounts = {};
    for (const tableName of TABLE_INSERT_ORDER) {
      const columns = await getTableColumns(client, tableName);
      const selectSql = buildSelectSql(tableName, columns);
      const rows = await client.query(selectSql);
      tables[tableName] = rows.rows;
      rowCounts[tableName] = rows.rowCount;
    }

    const payload = {
      version: BACKUP_VERSION,
      createdAt: now.toISOString(),
      tableOrder: TABLE_INSERT_ORDER,
      rowCounts,
      tables,
    };

    const filename = toBackupFilename(now);
    const backupPath = path.join(outputDir, filename);
    await fs.writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    const removedBackups = await pruneOldBackups(outputDir, keepLatest);

    return {
      backupPath,
      filename,
      rowCounts,
      removedBackups,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const keepLatestRaw = Number(args["keep-latest"]);
  const keepLatest = Number.isInteger(keepLatestRaw) && keepLatestRaw >= 0
    ? keepLatestRaw
    : BACKUP_KEEP_LATEST_DEFAULT;
  const outputDir = typeof args["output-dir"] === "string" && args["output-dir"].trim()
    ? path.resolve(args["output-dir"])
    : BACKUP_BASE_DIR;

  const result = await backupDatabaseToJson({
    outputDir,
    keepLatest,
  });

  console.log(`Backup created: ${result.backupPath}`);
  console.log(`Rows by table: ${JSON.stringify(result.rowCounts, null, 2)}`);
  if (result.removedBackups.length > 0) {
    console.log(`Pruned old backups: ${result.removedBackups.join(", ")}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("db-backup-json failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  backupDatabaseToJson,
  buildSelectSql,
  parseArgs,
  pruneOldBackups,
};
