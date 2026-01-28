const healthRouter = require("./health");

function registerRoutes(app) {
  app.use("/api/health", healthRouter);
}

module.exports = { registerRoutes };
