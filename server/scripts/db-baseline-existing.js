"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { QueryTypes } = require("sequelize");
const { connectToDatabase } = require("../src/config/db");

const BASELINE_MIGRATIONS = ["20260210-0001-create-core-schema.js"];
const APP_TABLES = ["users", "posts", "follows"];

function normalizeTableName(entry) {
  if (typeof entry === "string") {
    const parts = entry.split(".");
    return parts[parts.length - 1].replace(/"/g, "");
  }
  if (entry && typeof entry === "object") {
    if (typeof entry.tableName === "string") return entry.tableName;
    if (typeof entry.table_name === "string") return entry.table_name;
  }
  return String(entry || "");
}

async function main() {
  const sequelize = await connectToDatabase(process.env.DATABASE_URL);
  const queryInterface = sequelize.getQueryInterface();

  try {
    const migrationDir = path.resolve(__dirname, "../migrations");
    for (const migrationName of BASELINE_MIGRATIONS) {
      const migrationPath = path.join(migrationDir, migrationName);
      if (!fs.existsSync(migrationPath)) {
        throw new Error(
          `Missing migration file to baseline: ${migrationName}. Expected at ${migrationPath}`
        );
      }
    }

    const rawTables = await queryInterface.showAllTables();
    const tableSet = new Set(rawTables.map(normalizeTableName).map((name) => name.toLowerCase()));

    const hasAppTables = APP_TABLES.some((tableName) => tableSet.has(tableName));
    if (!hasAppTables) {
      console.log(
        "No existing Patchwork tables detected. Baseline skipped. Run migrations normally: npm run db:migrate"
      );
      return;
    }

    await sequelize.query(
      'CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) PRIMARY KEY);',
      { type: QueryTypes.RAW }
    );

    const applied = await sequelize.query('SELECT "name" FROM "SequelizeMeta";', {
      type: QueryTypes.SELECT,
    });
    const appliedSet = new Set(applied.map((row) => row.name));

    for (const migrationName of BASELINE_MIGRATIONS) {
      if (!appliedSet.has(migrationName)) {
        await sequelize.query(
          'INSERT INTO "SequelizeMeta" ("name") VALUES (:name) ON CONFLICT ("name") DO NOTHING;',
          {
            replacements: { name: migrationName },
            type: QueryTypes.INSERT,
          }
        );
        console.log(`Baselined migration: ${migrationName}`);
      } else {
        console.log(`Already baselined: ${migrationName}`);
      }
    }

    console.log("Database baseline complete.");
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error("db:baseline failed:", err.message || err);
  process.exit(1);
});
