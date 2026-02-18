"use strict";

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const { Client } = require("pg");
const {
  BACKUP_BASE_DIR,
  TABLE_INSERT_ORDER,
  TABLE_TRUNCATE_ORDER,
  isBackupFilename,
  sortBackupNamesNewestFirst,
  validateBackupPayload,
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

async function resolveBackupPath({ backupFile, backupDir = BACKUP_BASE_DIR }) {
  if (backupFile && typeof backupFile === "string" && backupFile.trim()) {
    const resolved = path.resolve(backupFile);
    await fs.access(resolved);
    return resolved;
  }

  const entries = await fs.readdir(backupDir);
  const latest = sortBackupNamesNewestFirst(entries.filter(isBackupFilename))[0];
  if (!latest) {
    throw new Error(`No backup file found in ${backupDir}`);
  }
  return path.join(backupDir, latest);
}

function rowsForInsert(tableName, rows) {
  if (tableName !== "comments") return rows;

  // Ensure parent comments are restored before replies.
  return [...rows].sort((a, b) => {
    const aIsReply = Boolean(a.parent_id);
    const bIsReply = Boolean(b.parent_id);
    if (aIsReply !== bIsReply) return aIsReply ? 1 : -1;
    const aCreated = new Date(a.created_at || 0).getTime();
    const bCreated = new Date(b.created_at || 0).getTime();
    return aCreated - bCreated;
  });
}

async function insertRows(client, tableName, rows, batchSize = 200) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map((column) => quoteIdentifier(column)).join(", ");

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const rowPlaceholders = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });

    const sql = `
      INSERT INTO ${quoteIdentifier(tableName)} (${quotedColumns})
      VALUES ${placeholders.join(", ")};
    `;
    await client.query(sql, values);
  }
}

async function restoreDatabaseFromJson({
  databaseUrl = process.env.DATABASE_URL,
  backupFile,
  backupDir = BACKUP_BASE_DIR,
} = {}) {
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL.");
  }

  const backupPath = await resolveBackupPath({ backupFile, backupDir });
  const rawContent = await fs.readFile(backupPath, "utf8");
  const payload = JSON.parse(rawContent);
  const validation = validateBackupPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const truncateSql = `
      TRUNCATE ${TABLE_TRUNCATE_ORDER.map((table) => quoteIdentifier(table)).join(", ")}
      RESTART IDENTITY CASCADE;
    `;
    await client.query(truncateSql);

    for (const tableName of TABLE_INSERT_ORDER) {
      const rows = rowsForInsert(tableName, payload.tables[tableName] || []);
      await insertRows(client, tableName, rows);
    }

    await client.query("COMMIT");

    return {
      backupPath,
      rowCounts: payload.rowCounts || {},
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const confirm = args.confirm;
  if (confirm !== "RESTORE") {
    throw new Error('Restore blocked. Re-run with --confirm=RESTORE to proceed.');
  }

  const backupFile = typeof args.file === "string" ? args.file : null;
  const backupDir = typeof args["backup-dir"] === "string" && args["backup-dir"].trim()
    ? path.resolve(args["backup-dir"])
    : BACKUP_BASE_DIR;
  const result = await restoreDatabaseFromJson({ backupFile, backupDir });

  console.log(`Restore complete from: ${result.backupPath}`);
  console.log(`Restored row counts: ${JSON.stringify(result.rowCounts, null, 2)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("db-restore-json failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  insertRows,
  parseArgs,
  resolveBackupPath,
  restoreDatabaseFromJson,
  rowsForInsert,
};
