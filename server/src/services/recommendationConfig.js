"use strict";

const { randomUUID } = require("crypto");
const { QueryTypes } = require("sequelize");
const {
  DEFAULT_ACTION_SIGNAL_WEIGHTS,
  DEFAULT_NOVELTY_ACTION_TYPES,
  DEFAULT_NOVELTY_CONFIG,
  DEFAULT_RECOMMENDATION_CONFIG,
} = require("./recommendationEngine");

const DEFAULT_SCOPE = "hybrid_v1";
const SOURCE_VALUES = new Set(["manual", "simulation"]);
const ACTIVE_CACHE_TTL_MS = 30_000;
const MAX_HISTORY_LIMIT = 100;

const REGULAR_WEIGHT_KEYS = Object.freeze([
  "followAff",
  "authorAff",
  "styleMatch",
  "colorMatch",
  "brandMatch",
  "engagementVelocity",
  "freshness",
]);

const MARKET_WEIGHT_KEYS = Object.freeze([
  "followAff",
  "authorAff",
  "categoryMatch",
  "brandMatch",
  "sizeMatch",
  "priceBandMatch",
  "conditionMatch",
  "engagementVelocity",
  "freshness",
]);

const ACTION_WEIGHT_KEYS = Object.freeze(Object.keys(DEFAULT_ACTION_SIGNAL_WEIGHTS));

const activeConfigCache = {
  key: null,
  expiresAt: 0,
  value: null,
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function asObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
  return value;
}

function assertFiniteNumber(value, fieldName, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  if (numeric < min || numeric > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}.`);
  }
  return numeric;
}

function assertFiniteInt(value, fieldName, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`${fieldName} must be an integer.`);
  }
  if (numeric < min || numeric > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}.`);
  }
  return numeric;
}

function normalizeWeightMap(raw, keys, fieldName) {
  const obj = asObject(raw, fieldName);
  const normalized = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new Error(`${fieldName}.${key} is required.`);
    }
    normalized[key] = assertFiniteNumber(obj[key], `${fieldName}.${key}`, -10, 10);
  }
  return normalized;
}

function normalizeDiversityCaps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("diversityCaps must be a non-empty array.");
  }

  const caps = raw.map((entry, index) => {
    const obj = asObject(entry, `diversityCaps[${index}]`);
    return {
      maxRankExclusive: assertFiniteInt(
        obj.maxRankExclusive,
        `diversityCaps[${index}].maxRankExclusive`,
        1,
        1000
      ),
      maxPerAuthor: assertFiniteInt(obj.maxPerAuthor, `diversityCaps[${index}].maxPerAuthor`, 1, 100),
    };
  });

  for (let index = 1; index < caps.length; index += 1) {
    if (caps[index].maxRankExclusive <= caps[index - 1].maxRankExclusive) {
      throw new Error("diversityCaps must have strictly increasing maxRankExclusive values.");
    }
  }

  return caps;
}

function normalizeOptionalBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNovelty(raw) {
  if (raw === undefined) {
    return { ...DEFAULT_NOVELTY_CONFIG, seenActionTypes: [...DEFAULT_NOVELTY_ACTION_TYPES] };
  }

  const obj = asObject(raw, "novelty");
  const actionTypes = Array.isArray(obj.seenActionTypes)
    ? [
        ...new Set(
          obj.seenActionTypes
            .filter((value) => typeof value === "string" && value.trim())
            .map((value) => value.trim().toLowerCase())
        ),
      ]
    : [...DEFAULT_NOVELTY_ACTION_TYPES];

  if (actionTypes.length === 0) {
    throw new Error("novelty.seenActionTypes must be a non-empty array of strings.");
  }

  return {
    excludeCurrentLikes: normalizeOptionalBoolean(
      obj.excludeCurrentLikes,
      DEFAULT_NOVELTY_CONFIG.excludeCurrentLikes
    ),
    excludeCurrentPatches: normalizeOptionalBoolean(
      obj.excludeCurrentPatches,
      DEFAULT_NOVELTY_CONFIG.excludeCurrentPatches
    ),
    seenCooldownDays: assertFiniteInt(
      obj.seenCooldownDays ?? DEFAULT_NOVELTY_CONFIG.seenCooldownDays,
      "novelty.seenCooldownDays",
      0,
      3650
    ),
    maxSeenPostIds: assertFiniteInt(
      obj.maxSeenPostIds ?? DEFAULT_NOVELTY_CONFIG.maxSeenPostIds,
      "novelty.maxSeenPostIds",
      0,
      10000
    ),
    seenActionTypes: actionTypes,
  };
}

function normalizeConfig(configInput) {
  const raw = asObject(configInput, "config");

  const regularWeights = normalizeWeightMap(raw.regularWeights, REGULAR_WEIGHT_KEYS, "regularWeights");
  const marketWeights = normalizeWeightMap(raw.marketWeights, MARKET_WEIGHT_KEYS, "marketWeights");

  const freshnessHalfLifeDays = asObject(raw.freshnessHalfLifeDays, "freshnessHalfLifeDays");
  const blend = asObject(raw.blend, "blend");
  const pools = asObject(raw.pools, "pools");

  const normalized = {
    version: typeof raw.version === "string" && raw.version.trim() ? raw.version.trim() : DEFAULT_SCOPE,
    regularWeights,
    marketWeights,
    freshnessHalfLifeDays: {
      regular: assertFiniteNumber(
        freshnessHalfLifeDays.regular,
        "freshnessHalfLifeDays.regular",
        0.5,
        120
      ),
      market: assertFiniteNumber(
        freshnessHalfLifeDays.market,
        "freshnessHalfLifeDays.market",
        0.5,
        120
      ),
    },
    blend: {
      defaultMarketShare: assertFiniteNumber(blend.defaultMarketShare, "blend.defaultMarketShare", 0, 1),
      minMarketShare: assertFiniteNumber(blend.minMarketShare, "blend.minMarketShare", 0, 1),
      maxMarketShare: assertFiniteNumber(blend.maxMarketShare, "blend.maxMarketShare", 0, 1),
      minActionsForLearnedShare: assertFiniteInt(
        blend.minActionsForLearnedShare,
        "blend.minActionsForLearnedShare",
        0,
        10000
      ),
    },
    diversityCaps: normalizeDiversityCaps(raw.diversityCaps),
    pools: {
      defaultLimitPerType: assertFiniteInt(pools.defaultLimitPerType, "pools.defaultLimitPerType", 1, 5000),
      regularRecencyDays: assertFiniteInt(pools.regularRecencyDays, "pools.regularRecencyDays", 1, 3650),
      marketRecencyDays: assertFiniteInt(pools.marketRecencyDays, "pools.marketRecencyDays", 1, 3650),
      engagementWindowDays: assertFiniteInt(
        pools.engagementWindowDays,
        "pools.engagementWindowDays",
        1,
        3650
      ),
      preferenceWindowDays: assertFiniteInt(
        pools.preferenceWindowDays,
        "pools.preferenceWindowDays",
        1,
        3650
      ),
    },
    novelty: normalizeNovelty(raw.novelty),
    actionSignalWeights: normalizeWeightMap(raw.actionSignalWeights, ACTION_WEIGHT_KEYS, "actionSignalWeights"),
  };

  if (normalized.blend.minMarketShare > normalized.blend.maxMarketShare) {
    throw new Error("blend.minMarketShare cannot be greater than blend.maxMarketShare.");
  }
  if (
    normalized.blend.defaultMarketShare < normalized.blend.minMarketShare ||
    normalized.blend.defaultMarketShare > normalized.blend.maxMarketShare
  ) {
    throw new Error("blend.defaultMarketShare must be within [minMarketShare, maxMarketShare].");
  }

  return normalized;
}

function mergeConfig(baseConfig, overrides = {}) {
  const base = cloneJson(baseConfig || DEFAULT_RECOMMENDATION_CONFIG);
  const patch = overrides && typeof overrides === "object" ? overrides : {};

  const merged = {
    ...base,
    ...patch,
    regularWeights: {
      ...(base.regularWeights || {}),
      ...((patch.regularWeights && typeof patch.regularWeights === "object" && !Array.isArray(patch.regularWeights))
        ? patch.regularWeights
        : {}),
    },
    marketWeights: {
      ...(base.marketWeights || {}),
      ...((patch.marketWeights && typeof patch.marketWeights === "object" && !Array.isArray(patch.marketWeights))
        ? patch.marketWeights
        : {}),
    },
    freshnessHalfLifeDays: {
      ...(base.freshnessHalfLifeDays || {}),
      ...((patch.freshnessHalfLifeDays &&
      typeof patch.freshnessHalfLifeDays === "object" &&
      !Array.isArray(patch.freshnessHalfLifeDays))
        ? patch.freshnessHalfLifeDays
        : {}),
    },
    blend: {
      ...(base.blend || {}),
      ...((patch.blend && typeof patch.blend === "object" && !Array.isArray(patch.blend))
        ? patch.blend
        : {}),
    },
    pools: {
      ...(base.pools || {}),
      ...((patch.pools && typeof patch.pools === "object" && !Array.isArray(patch.pools))
        ? patch.pools
        : {}),
    },
    novelty: {
      ...(base.novelty || {}),
      ...((patch.novelty && typeof patch.novelty === "object" && !Array.isArray(patch.novelty))
        ? patch.novelty
        : {}),
    },
    actionSignalWeights: {
      ...(base.actionSignalWeights || {}),
      ...((patch.actionSignalWeights &&
      typeof patch.actionSignalWeights === "object" &&
      !Array.isArray(patch.actionSignalWeights))
        ? patch.actionSignalWeights
        : {}),
    },
  };

  if (Array.isArray(patch.diversityCaps) && patch.diversityCaps.length > 0) {
    merged.diversityCaps = patch.diversityCaps;
  }

  return normalizeConfig(merged);
}

function invalidateActiveConfigCache(scope = DEFAULT_SCOPE) {
  if (activeConfigCache.key === scope) {
    activeConfigCache.key = null;
    activeConfigCache.value = null;
    activeConfigCache.expiresAt = 0;
  }
}

function normalizeHistoryLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

async function getActiveConfig({ models, scope = DEFAULT_SCOPE, useCache = true } = {}) {
  const cacheValid = useCache && activeConfigCache.key === scope && activeConfigCache.expiresAt > Date.now();
  if (cacheValid && activeConfigCache.value) {
    return cloneJson(activeConfigCache.value);
  }

  const sequelize = models.User.sequelize;
  const rows = await sequelize.query(
    `
      SELECT
        id,
        version,
        scope,
        config_json AS "configJson",
        is_active AS "isActive",
        created_by AS "createdBy",
        source,
        source_run_id AS "sourceRunId",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM recommendation_configs
      WHERE scope = :scope
        AND is_active = TRUE
      ORDER BY version DESC
      LIMIT 1;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { scope },
    }
  );

  const row = rows[0];
  const value = row
    ? {
        id: row.id,
        version: Number(row.version),
        scope: row.scope,
        source: row.source,
        sourceRunId: row.sourceRunId || null,
        notes: row.notes || null,
        createdBy: row.createdBy || null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
        config: normalizeConfig(row.configJson),
      }
    : {
        id: null,
        version: 0,
        scope,
        source: "default",
        sourceRunId: null,
        notes: null,
        createdBy: null,
        createdAt: null,
        updatedAt: null,
        config: cloneJson(DEFAULT_RECOMMENDATION_CONFIG),
      };

  activeConfigCache.key = scope;
  activeConfigCache.value = value;
  activeConfigCache.expiresAt = Date.now() + ACTIVE_CACHE_TTL_MS;

  return cloneJson(value);
}

async function listConfigHistory({ models, scope = DEFAULT_SCOPE, limit = 20 } = {}) {
  const sequelize = models.User.sequelize;
  const rows = await sequelize.query(
    `
      SELECT
        id,
        version,
        scope,
        is_active AS "isActive",
        config_json AS "configJson",
        created_by AS "createdBy",
        source,
        source_run_id AS "sourceRunId",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM recommendation_configs
      WHERE scope = :scope
      ORDER BY version DESC
      LIMIT :limit;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        scope,
        limit: normalizeHistoryLimit(limit),
      },
    }
  );

  return rows.map((row) => ({
    id: row.id,
    version: Number(row.version),
    scope: row.scope,
    isActive: Boolean(row.isActive),
    source: row.source,
    sourceRunId: row.sourceRunId || null,
    notes: row.notes || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    config: normalizeConfig(row.configJson),
  }));
}

async function applyConfig({
  models,
  scope = DEFAULT_SCOPE,
  config,
  createdBy = null,
  source = "manual",
  sourceRunId = null,
  notes = null,
} = {}) {
  if (!SOURCE_VALUES.has(source)) {
    throw new Error("Invalid config source.");
  }

  const normalizedConfig = normalizeConfig(config);
  const sequelize = models.User.sequelize;

  const inserted = await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `
        UPDATE recommendation_configs
        SET is_active = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE scope = :scope
          AND is_active = TRUE;
      `,
      {
        type: QueryTypes.UPDATE,
        replacements: { scope },
        transaction,
      }
    );

    const rows = await sequelize.query(
      `
        INSERT INTO recommendation_configs (
          id,
          scope,
          config_json,
          is_active,
          created_by,
          source,
          source_run_id,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          :id,
          :scope,
          CAST(:configJson AS JSONB),
          TRUE,
          :createdBy,
          :source,
          :sourceRunId,
          :notes,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING
          id,
          version,
          scope,
          config_json AS "configJson",
          is_active AS "isActive",
          created_by AS "createdBy",
          source,
          source_run_id AS "sourceRunId",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt";
      `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          id: randomUUID(),
          scope,
          configJson: JSON.stringify(normalizedConfig),
          createdBy,
          source,
          sourceRunId,
          notes,
        },
        transaction,
      }
    );

    return rows[0];
  });

  invalidateActiveConfigCache(scope);

  return {
    id: inserted.id,
    version: Number(inserted.version),
    scope: inserted.scope,
    isActive: Boolean(inserted.isActive),
    source: inserted.source,
    sourceRunId: inserted.sourceRunId || null,
    notes: inserted.notes || null,
    createdBy: inserted.createdBy || null,
    createdAt: inserted.createdAt || null,
    updatedAt: inserted.updatedAt || null,
    config: normalizeConfig(inserted.configJson),
  };
}

async function rollbackConfig({ models, scope = DEFAULT_SCOPE, createdBy = null, notes = null } = {}) {
  const history = await listConfigHistory({ models, scope, limit: 2 });
  if (history.length < 2) {
    throw new Error("No previous configuration is available for rollback.");
  }

  const previous = history.find((entry) => !entry.isActive) || history[1];
  return applyConfig({
    models,
    scope,
    config: previous.config,
    createdBy,
    source: "manual",
    sourceRunId: null,
    notes: notes || `Rollback to version ${previous.version}`,
  });
}

module.exports = {
  DEFAULT_SCOPE,
  applyConfig,
  getActiveConfig,
  invalidateActiveConfigCache,
  listConfigHistory,
  mergeConfig,
  normalizeConfig,
  rollbackConfig,
};
