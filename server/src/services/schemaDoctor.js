"use strict";

const { QueryTypes } = require("sequelize");

const FEATURE_SCHEMA_CHECKS = Object.freeze([
  {
    table: "user_actions",
    required: true,
    purpose: "recommendation telemetry and simulation replay",
    requiredColumns: [
      "user_id",
      "action_type",
      "target_type",
      "target_id",
      "metadata_json",
      "source_surface",
      "occurred_at",
    ],
    recommendedIndexes: [
      "user_actions_user_id_occurred_at_idx",
      "user_actions_action_type_occurred_at_idx",
      "user_actions_target_type_target_id_idx",
      "user_actions_source_surface_occurred_at_idx",
    ],
  },
  {
    table: "conversation_participants",
    required: true,
    purpose: "direct messages and message seller flow",
    requiredColumns: ["conversation_id", "user_id", "left_at"],
    recommendedIndexes: ["conversation_participants_conversation_id_user_id", "conversation_participants_user_id"],
  },
  {
    table: "conversations",
    required: true,
    purpose: "message seller metadata and deal state",
    requiredColumns: ["id", "linked_post_id", "deal_status"],
    recommendedIndexes: [],
  },
  {
    table: "recommendation_simulation_runs",
    required: false,
    purpose: "admin simulation run history",
    requiredColumns: [
      "id",
      "mode",
      "params_json",
      "result_summary_json",
      "candidate_config_json",
      "created_at",
    ],
    recommendedIndexes: [
      "recommendation_simulation_runs_created_at_idx",
      "recommendation_simulation_runs_mode_created_at_idx",
    ],
  },
]);

async function tableExists(sequelize, tableName) {
  const rows = await sequelize.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = :tableName
      ) AS "exists";
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { tableName },
    }
  );
  return Boolean(rows?.[0]?.exists);
}

async function getTableColumns(sequelize, tableName) {
  const rows = await sequelize.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = :tableName;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { tableName },
    }
  );
  return new Set(rows.map((row) => row.column_name));
}

async function getTableIndexes(sequelize, tableName) {
  const rows = await sequelize.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = :tableName;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { tableName },
    }
  );
  return new Set(rows.map((row) => row.indexname));
}

function summarizeCheck({ check, exists, columnSet, indexSet }) {
  const missingColumns = exists
    ? check.requiredColumns.filter((column) => !columnSet.has(column))
    : [...check.requiredColumns];

  const missingIndexes = exists
    ? check.recommendedIndexes.filter((indexName) => !indexSet.has(indexName))
    : [...check.recommendedIndexes];

  const criticalFailure = check.required && (!exists || missingColumns.length > 0);
  const warning = !criticalFailure && missingIndexes.length > 0;

  return {
    table: check.table,
    required: check.required,
    purpose: check.purpose,
    exists,
    missingColumns,
    missingIndexes,
    status: criticalFailure ? "fail" : warning ? "warn" : "ok",
  };
}

function getHumanSummary(result) {
  const lines = [];
  lines.push(
    `Schema doctor: ${result.healthy ? "healthy" : "issues found"} ` +
      `(critical=${result.summary.criticalFailures}, warnings=${result.summary.warnings})`
  );

  for (const item of result.checks) {
    if (item.status === "ok") continue;
    lines.push(`- [${item.status.toUpperCase()}] ${item.table} (${item.purpose})`);
    if (!item.exists) {
      lines.push("  missing table");
      continue;
    }
    if (item.missingColumns.length > 0) {
      lines.push(`  missing columns: ${item.missingColumns.join(", ")}`);
    }
    if (item.missingIndexes.length > 0) {
      lines.push(`  missing indexes: ${item.missingIndexes.join(", ")}`);
    }
  }
  return lines.join("\n");
}

async function inspectFeatureSchemaHealth({ models, checks = FEATURE_SCHEMA_CHECKS } = {}) {
  if (!models?.User?.sequelize) {
    throw new Error("inspectFeatureSchemaHealth requires models.User.sequelize.");
  }
  const sequelize = models.User.sequelize;

  const checkResults = await Promise.all(
    checks.map(async (check) => {
      const exists = await tableExists(sequelize, check.table);
      if (!exists) {
        return summarizeCheck({
          check,
          exists,
          columnSet: new Set(),
          indexSet: new Set(),
        });
      }

      const [columnSet, indexSet] = await Promise.all([
        getTableColumns(sequelize, check.table),
        getTableIndexes(sequelize, check.table),
      ]);

      return summarizeCheck({
        check,
        exists,
        columnSet,
        indexSet,
      });
    })
  );

  const criticalFailures = checkResults.filter((entry) => entry.status === "fail").length;
  const warnings = checkResults.filter((entry) => entry.status === "warn").length;

  const result = {
    generatedAt: new Date().toISOString(),
    healthy: criticalFailures === 0,
    summary: {
      checks: checkResults.length,
      criticalFailures,
      warnings,
    },
    checks: checkResults,
  };
  result.humanSummary = getHumanSummary(result);
  return result;
}

async function assertFeatureSchemaHealth({ models } = {}) {
  const result = await inspectFeatureSchemaHealth({ models });
  if (result.healthy) {
    return result;
  }

  throw new Error(
    [
      "Feature schema check failed.",
      "Run migrations: npm run db:migrate --prefix server",
      "Then validate: npm run db:schema:doctor --prefix server",
      result.humanSummary,
    ].join("\n")
  );
}

module.exports = {
  FEATURE_SCHEMA_CHECKS,
  assertFeatureSchemaHealth,
  inspectFeatureSchemaHealth,
};
