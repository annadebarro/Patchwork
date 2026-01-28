const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const connectionStates = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

router.get("/", (_req, res) => {
  const dbState = connectionStates[mongoose.connection.readyState] || "unknown";

  res.json({
    status: "ok",
    database: dbState,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
