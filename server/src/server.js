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
app.use(express.json({ limit: "5mb" }));

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

const DEFAULT_SIZE_PREFERENCES_JSON =
  '{"tops":[],"bottoms":[],"dresses":[],"outerwear":[],"shoes":[]}';

async function ensureUserPreferenceColumns(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  const queryOptions = {};

  try {
    await queryInterface.describeTable("users");
  } catch {
    // Fresh database with no users table yet. sync() will create everything.
    return;
  }

  // Ensure enum type exists before adding onboarding_status.
  await sequelize.query(
    `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'enum_users_onboarding_status'
        ) THEN
          CREATE TYPE "enum_users_onboarding_status" AS ENUM ('pending', 'completed', 'skipped');
        END IF;
      END
    $$;`,
    queryOptions
  );

  await sequelize.query(
    `ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "size_preferences" JSONB DEFAULT '${DEFAULT_SIZE_PREFERENCES_JSON}'::jsonb;`,
    queryOptions
  );
  await sequelize.query(
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;',
    queryOptions
  );
  await sequelize.query(
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "favorite_brands" TEXT[] DEFAULT ARRAY[]::TEXT[];',
    queryOptions
  );
  await sequelize.query(
    `ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "onboarding_status" "enum_users_onboarding_status" DEFAULT 'pending';`,
    queryOptions
  );
  await sequelize.query(
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_prompt_seen" BOOLEAN DEFAULT false;',
    queryOptions
  );

  // Backfill legacy rows before enforcing NOT NULL.
  await sequelize.query(
    `UPDATE "users"
      SET "size_preferences" = '${DEFAULT_SIZE_PREFERENCES_JSON}'::jsonb
      WHERE "size_preferences" IS NULL;`,
    queryOptions
  );
  await sequelize.query(
    'UPDATE "users" SET "favorite_brands" = ARRAY[]::TEXT[] WHERE "favorite_brands" IS NULL;',
    queryOptions
  );
  await sequelize.query(
    `UPDATE "users"
      SET "onboarding_status" = 'pending'
      WHERE "onboarding_status" IS NULL;`,
    queryOptions
  );
  await sequelize.query(
    'UPDATE "users" SET "onboarding_prompt_seen" = false WHERE "onboarding_prompt_seen" IS NULL;',
    queryOptions
  );

  // Enforce defaults + not-null for future writes.
  await sequelize.query(
    `ALTER TABLE "users"
      ALTER COLUMN "size_preferences" SET DEFAULT '${DEFAULT_SIZE_PREFERENCES_JSON}'::jsonb,
      ALTER COLUMN "size_preferences" SET NOT NULL;`,
    queryOptions
  );
  await sequelize.query(
    `ALTER TABLE "users"
      ALTER COLUMN "favorite_brands" SET DEFAULT ARRAY[]::TEXT[],
      ALTER COLUMN "favorite_brands" SET NOT NULL;`,
    queryOptions
  );
  await sequelize.query(
    `ALTER TABLE "users"
      ALTER COLUMN "onboarding_status" SET DEFAULT 'pending',
      ALTER COLUMN "onboarding_status" SET NOT NULL;`,
    queryOptions
  );
  await sequelize.query(
    `ALTER TABLE "users"
      ALTER COLUMN "onboarding_prompt_seen" SET DEFAULT false,
      ALTER COLUMN "onboarding_prompt_seen" SET NOT NULL;`,
    queryOptions
  );
}

async function bootstrap() {
  try {
    const sequelize = await connectToDatabase(process.env.DATABASE_URL);
    initModels(sequelize);
    await ensureUserPreferenceColumns(sequelize);
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
