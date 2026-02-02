const healthRouter = require("./health");
const authRouter = require("./auth");

function registerRoutes(app) {
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
}

module.exports = { registerRoutes };
