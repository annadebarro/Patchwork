"use strict";

const { randomUUID } = require("crypto");
const { QueryTypes } = require("sequelize");

const MAX_RUN_HISTORY_LIMIT = 100;
const DEFAULT_RUN_HISTORY_LIMIT = 20;

function toSafeJson(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RUN_HISTORY_LIMIT;
  return Math.min(parsed, MAX_RUN_HISTORY_LIMIT);
}

function parseDateBoundary(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function mapRunRow(row) {
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

function matchesTrackFilter(run, track) {
  if (!track) return true;
  if (!run || typeof run !== "object") return false;
  if (run.resultSummary?.tracks && typeof run.resultSummary.tracks === "object") {
    return Object.prototype.hasOwnProperty.call(run.resultSummary.tracks, track);
  }
  const tracks = run.params?.tracks;
  if (Array.isArray(tracks)) return tracks.includes(track);
  return false;
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

  return mapRunRow(rows[0]);
}

async function listSimulationRuns({
  models,
  mode = null,
  track = null,
  from = null,
  to = null,
  limit = DEFAULT_RUN_HISTORY_LIMIT,
} = {}) {
  const sequelize = models.User.sequelize;
  const normalizedLimit = normalizeLimit(limit);
  const fromDate = parseDateBoundary(from);
  const toDate = parseDateBoundary(to);
  const fetchLimit = Math.min(MAX_RUN_HISTORY_LIMIT, Math.max(normalizedLimit * 3, normalizedLimit));
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
        AND (:fromDate::TIMESTAMPTZ IS NULL OR created_at >= :fromDate)
        AND (:toDate::TIMESTAMPTZ IS NULL OR created_at <= :toDate)
      ORDER BY created_at DESC
      LIMIT :limit;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        mode: mode || null,
        fromDate,
        toDate,
        limit: fetchLimit,
      },
    }
  );

  const normalizedTrack = typeof track === "string" ? track.trim().toLowerCase() : "";
  const filtered = rows
    .map(mapRunRow)
    .filter((run) => matchesTrackFilter(run, normalizedTrack || null))
    .slice(0, normalizedLimit);

  return filtered;
}

async function getSimulationRunById({ models, id } = {}) {
  if (!id || typeof id !== "string") return null;
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
      WHERE id = :id
      LIMIT 1;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { id },
    }
  );
  if (!rows[0]) return null;
  return mapRunRow(rows[0]);
}

module.exports = {
  createSimulationRun,
  getSimulationRunById,
  listSimulationRuns,
};
