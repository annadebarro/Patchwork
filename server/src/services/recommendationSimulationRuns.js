"use strict";

const { randomUUID } = require("crypto");
const { QueryTypes } = require("sequelize");

const MAX_RUN_HISTORY_LIMIT = 100;

function toSafeJson(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_RUN_HISTORY_LIMIT);
}

async function createSimulationRun({
  models,
  mode,
  params,
  resultSummary,
  candidateConfig = null,
  createdBy = null,
} = {}) {
  const sequelize = models.User.sequelize;
  const rows = await sequelize.query(
    `
      INSERT INTO recommendation_simulation_runs (
        id,
        mode,
        params_json,
        result_summary_json,
        candidate_config_json,
        created_by,
        created_at
      )
      VALUES (
        :id,
        :mode,
        CAST(:paramsJson AS JSONB),
        CAST(:resultSummaryJson AS JSONB),
        CAST(:candidateConfigJson AS JSONB),
        :createdBy,
        CURRENT_TIMESTAMP
      )
      RETURNING
        id,
        mode,
        params_json AS "paramsJson",
        result_summary_json AS "resultSummaryJson",
        candidate_config_json AS "candidateConfigJson",
        created_by AS "createdBy",
        created_at AS "createdAt";
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        id: randomUUID(),
        mode,
        paramsJson: JSON.stringify(toSafeJson(params) || {}),
        resultSummaryJson: JSON.stringify(toSafeJson(resultSummary) || {}),
        candidateConfigJson: JSON.stringify(toSafeJson(candidateConfig)),
        createdBy,
      },
    }
  );

  const row = rows[0];
  return {
    id: row.id,
    mode: row.mode,
    params: row.paramsJson || {},
    resultSummary: row.resultSummaryJson || {},
    candidateConfig: row.candidateConfigJson || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt || null,
  };
}

async function listSimulationRuns({ models, mode = null, limit = 20 } = {}) {
  const sequelize = models.User.sequelize;
  const rows = await sequelize.query(
    `
      SELECT
        id,
        mode,
        params_json AS "paramsJson",
        result_summary_json AS "resultSummaryJson",
        candidate_config_json AS "candidateConfigJson",
        created_by AS "createdBy",
        created_at AS "createdAt"
      FROM recommendation_simulation_runs
      WHERE (:mode::TEXT IS NULL OR mode = :mode)
      ORDER BY created_at DESC
      LIMIT :limit;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        mode: mode || null,
        limit: normalizeLimit(limit),
      },
    }
  );

  return rows.map((row) => ({
    id: row.id,
    mode: row.mode,
    params: row.paramsJson || {},
    resultSummary: row.resultSummaryJson || {},
    candidateConfig: row.candidateConfigJson || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt || null,
  }));
}

module.exports = {
  createSimulationRun,
  listSimulationRuns,
};
