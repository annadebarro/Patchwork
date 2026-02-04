const { Sequelize } = require("sequelize");

let sequelize;

async function connectToDatabase(uri) {
  if (!uri) {
    throw new Error("Missing Postgres connection string (DATABASE_URL)");
  }

  sequelize = new Sequelize(uri, {
    dialect: "postgres",
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log("Postgres connected");
  } catch (err) {
    console.error("Postgres connection error:", err);
    throw err;
  }

  return sequelize;
}

function getSequelize() {
  if (!sequelize) {
    throw new Error("Sequelize has not been initialized");
  }
  return sequelize;
}

module.exports = { connectToDatabase, getSequelize };
