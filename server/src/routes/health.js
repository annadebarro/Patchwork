const express = require("express");
const { getSequelize } = require("../config/db");

const router = express.Router();

router.get("/", async (_req, res) => {
  let database = "unknown";

  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    database = "connected";
  } catch (err) {
    database = "disconnected";
  }

  res.json({
    status: "ok",
    database,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
