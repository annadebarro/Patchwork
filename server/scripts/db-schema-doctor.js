"use strict";

require("dotenv").config();

const { connectToDatabase } = require("../src/config/db");
const { initModels, getModels } = require("../src/models");
const { inspectFeatureSchemaHealth } = require("../src/services/schemaDoctor");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL.");
  }

  const sequelize = await connectToDatabase(process.env.DATABASE_URL);
  initModels(sequelize);

  const result = await inspectFeatureSchemaHealth({ models: getModels() });
  console.log(result.humanSummary);

  if (!result.healthy) {
    process.exitCode = 1;
  }

  await sequelize.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("db-schema-doctor failed:", err.message || err);
    process.exit(1);
  });
}
