"use strict";

const fs = require("fs/promises");
const path = require("path");
const { QueryTypes } = require("sequelize");

const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");
const SEQUELIZE_META_TABLE = "SequelizeMeta";

function isMigrationFile(name) {
  return typeof name === "string" && name.endsWith(".js") && !name.startsWith(".");
}

async function tableExists(sequelize, tableName) {
  const rows = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = :tableName
    ) AS "exists";`,
    {
      replacements: { tableName },
      type: QueryTypes.SELECT,
    }
  );

  return Boolean(rows?.[0]?.exists);
}

async function getMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isMigrationFile(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function getAppliedMigrations(sequelize) {
  const hasMetaTable = await tableExists(sequelize, SEQUELIZE_META_TABLE);
  if (!hasMetaTable) return [];

  const rows = await sequelize.query(`SELECT "name" FROM "${SEQUELIZE_META_TABLE}";`, {
    type: QueryTypes.SELECT,
  });

  return rows
    .map((row) => row?.name)
    .filter((name) => typeof name === "string" && name.length > 0)
    .sort();
}

async function assertNoPendingMigrations(sequelize) {
  const migrationFiles = await getMigrationFiles();
  if (migrationFiles.length === 0) {
    throw new Error(
      "No migration files found. Add migrations in server/migrations before starting the API."
    );
  }

  const appliedMigrations = await getAppliedMigrations(sequelize);
  const appliedSet = new Set(appliedMigrations);
  const pending = migrationFiles.filter((name) => !appliedSet.has(name));

  if (pending.length > 0) {
    const pendingList = pending.map((name) => `  - ${name}`).join("\n");
    throw new Error(
      [
        "Database has pending migrations. Run migrations before starting the API.",
        "Command: npm run db:migrate --prefix server",
        "Pending migrations:",
        pendingList,
      ].join("\n")
    );
  }
}

module.exports = {
  assertNoPendingMigrations,
};
