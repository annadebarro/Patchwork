require("dotenv").config();

function buildConfigFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL for sequelize-cli.");
  }

  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\/+/, "");
  const sslmode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
  const sslQuery = (parsed.searchParams.get("ssl") || "").toLowerCase();
  const channelBinding = (parsed.searchParams.get("channel_binding") || "").toLowerCase();

  const config = {
    username: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || ""),
    database: decodeURIComponent(database),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    dialect: "postgres",
    logging: false,
  };

  const sslEnabled = sslQuery === "true" || (sslmode && sslmode !== "disable");
  if (sslEnabled) {
    config.ssl = true;
    config.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    };
  }

  if (channelBinding === "require") {
    config.dialectOptions = {
      ...(config.dialectOptions || {}),
      enableChannelBinding: true,
    };
  }

  return config;
}

const baseConfig = buildConfigFromDatabaseUrl(process.env.DATABASE_URL);

module.exports = {
  development: { ...baseConfig },
  test: { ...baseConfig },
  production: { ...baseConfig },
};
