const healthRouter = require("./health");
const authRouter = require("./auth");
const uploadsRouter = require("./uploads");
const postsRouter = require("./posts");
const likesRouter = require("./likes");
const commentsRouter = require("./comments");
const quiltsRouter = require("./quilts");
const usersRouter = require("./users");
const followsRouter = require("./follows");
const notificationsRouter = require("./notifications");

function registerRoutes(app) {
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/posts", likesRouter);
  app.use("/api/posts", commentsRouter);
  app.use("/api/quilts", quiltsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/follows", followsRouter);
  app.use("/api/notifications", notificationsRouter);
}

module.exports = { registerRoutes };
