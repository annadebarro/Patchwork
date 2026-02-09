const healthRouter = require("./health");
const authRouter = require("./auth");
const uploadsRouter = require("./uploads");
const postsRouter = require("./posts");

function registerRoutes(app) {
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/posts", postsRouter);
}

module.exports = { registerRoutes };
