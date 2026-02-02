require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectToDatabase } = require("./config/db");
const { registerRoutes } = require("./routes");

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const DEBUG_REQUESTS = process.env.DEBUG_REQUESTS === "true";
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
if (!process.env.JWT_SECRET) {
  console.warn("Warning: using default JWT secret. Set JWT_SECRET in .env for security.");
}

const app = express();

const allowedOrigins = CLIENT_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== "production" && LOCALHOST_ORIGIN_RE.test(origin)) {
        return callback(null, true);
      }
      const err = new Error(`CORS blocked for origin: ${origin}`);
      err.status = 403;
      err.code = "CORS_BLOCKED";
      return callback(err);
    },
    credentials: true,
  })
);
app.use(express.json());

if (DEBUG_REQUESTS) {
  app.use((req, res, next) => {
    const origin = req.headers.origin || "n/a";
    const host = req.headers.host || "n/a";
    console.log(`[REQ] ${req.method} ${req.originalUrl} origin=${origin} host=${host}`);
    res.on("finish", () => {
      console.log(`[RES] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    });
    next();
  });
}

registerRoutes(app);

app.get("/", (req, res) => {
  res.json({ message: "Patchwork API is running" });
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const payload = {
    message: err.message || "Something went wrong.",
  };
  if (process.env.NODE_ENV !== "production") {
    payload.code = err.code || "INTERNAL_ERROR";
  }
  res.status(status).json(payload);
});

async function bootstrap() {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap();
