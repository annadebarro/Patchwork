require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectToDatabase } = require("./config/db");
const { initModels } = require("./models");
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

const isProduction = process.env.NODE_ENV === "production";
const corsOptions = isProduction
  ? {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (LOCALHOST_ORIGIN_RE.test(origin)) {
          return callback(null, true);
        }
        const err = new Error(`CORS blocked for origin: ${origin}`);
        err.status = 403;
        err.code = "CORS_BLOCKED";
        return callback(err);
      },
      credentials: true,
    }
  : {
      origin: true,
      credentials: true,
    };

app.use(cors(corsOptions));
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

let server;

async function bootstrap() {
  try {
    const sequelize = await connectToDatabase(process.env.DATABASE_URL);
    initModels(sequelize);
    await sequelize.sync({ alter: true });

    server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log("Server is ready to accept connections...");
    });

    // Keep event loop alive
    setInterval(() => {}, 1000 * 60 * 60);

  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap().catch(err => {
  console.error("Bootstrap error:", err);
  process.exit(1);
});
