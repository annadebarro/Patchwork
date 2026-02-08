const healthRouter = require("./health");
const authRouter = require("./auth");
const uploadsRouter = require("./uploads");

function registerRoutes(app) {
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/uploads", uploadsRouter);
}

module.exports = { registerRoutes };
