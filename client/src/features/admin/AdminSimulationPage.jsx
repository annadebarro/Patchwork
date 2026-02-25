import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";
import "./AdminSimulationPage.css";

const DEFAULT_REPLAY = Object.freeze({
  days: 14,
  type: "all",
  k: 20,
});

const DEFAULT_SYNTHETIC = Object.freeze({
  seed: "patchwork-sim-v1",
  sessions: 1000,
  users: 100,
  type: "all",
  k: 20,
  includeColdStart: true,
  adaptationMode: "light",
  personaMix: "balanced",
});

const DEFAULT_OVERRIDE_STATE = Object.freeze({
  regularStyleMatch: 1.0,
  regularBrandMatch: 0.6,
  marketCategoryMatch: 1.0,
  marketSizeMatch: 0.9,
  marketPriceBandMatch: 0.8,
  blendDefaultMarketShare: 0.4,
  blendMinMarketShare: 0.2,
  blendMaxMarketShare: 0.8,
});

function toLocalDateTime(value) {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "n/a";
  return parsed.toLocaleString("en-US");
}

function toMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return "0.0000";
  return Number(value).toFixed(digits);
}

function toSignedMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return "0.0000";
  const num = Number(value);
  return `${num >= 0 ? "+" : ""}${num.toFixed(digits)}`;
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseFloatInRange(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function metricClass(value) {
  if (!Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function buildSliceLabel(slice) {
  const feedType = typeof slice?.feedType === "string" && slice.feedType.trim()
    ? slice.feedType.trim()
    : "unknown";
  const cohort = typeof slice?.cohort === "string" && slice.cohort.trim()
    ? slice.cohort.trim()
    : "unknown";
  const sourceSurface = typeof slice?.sourceSurface === "string" && slice.sourceSurface.trim()
    ? slice.sourceSurface.trim()
    : null;
  const personaType = typeof slice?.personaType === "string" && slice.personaType.trim()
    ? slice.personaType.trim()
    : null;

  const label = `${feedType}/${cohort}`;
  const suffix = [];

  if (personaType) {
    suffix.push(personaType);
  } else if (sourceSurface && sourceSurface !== "unknown") {
    suffix.push(sourceSurface);
  }

  return suffix.length ? `${label} • ${suffix.join(" • ")}` : label;
}

function abbreviateSliceLabel(slice) {
  const feedType = String(slice?.feedType || "").trim().toLowerCase();
  const cohort = String(slice?.cohort || "").trim().toLowerCase();
  const personaType = String(slice?.personaType || "").trim().toLowerCase();
  const sourceSurface = String(slice?.sourceSurface || "").trim().toLowerCase();

  const feedShort = feedType === "market" ? "mkt" : feedType === "regular" ? "reg" : feedType || "unk";
  const cohortShort = cohort === "returning" ? "ret" : cohort === "new" ? "new" : cohort || "unk";

  const personaShort = personaType
    ? personaType
        .replace(/_focused$/i, "")
        .replace(/regular/i, "reg")
        .replace(/market/i, "mkt")
        .replace(/cold_start/i, "cold")
        .replace(/mixed/i, "mix")
    : "";

  const surfaceShort = sourceSurface
    ? sourceSurface
        .replace(/social_feed/i, "feed")
        .replace(/post_detail/i, "detail")
        .replace(/search_results/i, "search")
        .replace(/profile/i, "profile")
    : "";

  const suffix = personaShort || (surfaceShort && surfaceShort !== "unknown" ? surfaceShort : "");
  return suffix ? `${feedShort}/${cohortShort}•${suffix}` : `${feedShort}/${cohortShort}`;
}

const TOOLTIP_PROPS = Object.freeze({
  contentStyle: {
    background: "rgba(7, 12, 24, 0.95)",
    border: "1px solid rgba(140, 169, 255, 0.35)",
    borderRadius: 12,
    boxShadow: "0 20px 55px rgba(0, 0, 0, 0.35)",
  },
  labelStyle: {
    color: "var(--secondary)",
    fontWeight: 700,
  },
  itemStyle: {
    color: "var(--secondary)",
  },
});

function SliceTooltip({ active, payload }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload;
  const label = row?.sliceFull || row?.sliceShort || "";
  const value = Number(row?.deltaNdcg || 0);

  return (
    <div style={TOOLTIP_PROPS.contentStyle}>
      <div style={{ ...TOOLTIP_PROPS.labelStyle, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ ...TOOLTIP_PROPS.itemStyle, opacity: 0.9 }}>dNDCG</span>
        <span style={{ color: payload[0]?.color || "var(--secondary)", fontWeight: 700 }}>
          {Number.isFinite(value) ? value.toFixed(4) : "0.0000"}
        </span>
      </div>
      {Number.isFinite(Number(row?.requests)) ? (
        <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
          requests {Number(row.requests)}
        </div>
      ) : null}
    </div>
  );
}

async function fetchAuthed(path, options = {}) {
  const res = await apiFetch(path, {
    auth: true,
    surface: REQUEST_SURFACES.UNKNOWN,
    ...options,
  });
  const data = await parseApiResponse(res);
  if (!res.ok) {
    throw new Error(data?.message || "Request failed.");
  }
  return data;
}

function buildOverridePayload(overrides) {
  return {
    regularWeights: {
      styleMatch: overrides.regularStyleMatch,
      brandMatch: overrides.regularBrandMatch,
    },
    marketWeights: {
      categoryMatch: overrides.marketCategoryMatch,
      sizeMatch: overrides.marketSizeMatch,
      priceBandMatch: overrides.marketPriceBandMatch,
    },
    blend: {
      defaultMarketShare: overrides.blendDefaultMarketShare,
      minMarketShare: overrides.blendMinMarketShare,
      maxMarketShare: overrides.blendMaxMarketShare,
    },
  };
}

function parseOverrideState(activeConfig) {
  const config = activeConfig?.config || {};
  return {
    regularStyleMatch: Number(config?.regularWeights?.styleMatch ?? DEFAULT_OVERRIDE_STATE.regularStyleMatch),
    regularBrandMatch: Number(config?.regularWeights?.brandMatch ?? DEFAULT_OVERRIDE_STATE.regularBrandMatch),
    marketCategoryMatch: Number(config?.marketWeights?.categoryMatch ?? DEFAULT_OVERRIDE_STATE.marketCategoryMatch),
    marketSizeMatch: Number(config?.marketWeights?.sizeMatch ?? DEFAULT_OVERRIDE_STATE.marketSizeMatch),
    marketPriceBandMatch: Number(
      config?.marketWeights?.priceBandMatch ?? DEFAULT_OVERRIDE_STATE.marketPriceBandMatch
    ),
    blendDefaultMarketShare: Number(
      config?.blend?.defaultMarketShare ?? DEFAULT_OVERRIDE_STATE.blendDefaultMarketShare
    ),
    blendMinMarketShare: Number(config?.blend?.minMarketShare ?? DEFAULT_OVERRIDE_STATE.blendMinMarketShare),
    blendMaxMarketShare: Number(config?.blend?.maxMarketShare ?? DEFAULT_OVERRIDE_STATE.blendMaxMarketShare),
  };
}

function AdminSimulationPage() {
  const [overview, setOverview] = useState(null);
  const [activeConfig, setActiveConfig] = useState(null);
  const [configHistory, setConfigHistory] = useState([]);
  const [runs, setRuns] = useState([]);
  const [simulation, setSimulation] = useState(null);
  const [lastRunId, setLastRunId] = useState(null);

  const [mode, setMode] = useState("synthetic");
  const [replayParams, setReplayParams] = useState({ ...DEFAULT_REPLAY });
  const [syntheticParams, setSyntheticParams] = useState({ ...DEFAULT_SYNTHETIC });
  const [overrideState, setOverrideState] = useState({ ...DEFAULT_OVERRIDE_STATE });

  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [runningSimulation, setRunningSimulation] = useState(false);
  const [applyingConfig, setApplyingConfig] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [syncingRuns, setSyncingRuns] = useState(false);

  const [error, setError] = useState("");
  const [simulationError, setSimulationError] = useState("");
  const [configError, setConfigError] = useState("");

  const [confirmAction, setConfirmAction] = useState(null);
  const [overrideInitialized, setOverrideInitialized] = useState(false);

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setError("");

    try {
      const [overviewData, activeData, historyData, runsData] = await Promise.all([
        fetchAuthed("/admin/recommendations/overview"),
        fetchAuthed("/admin/recommendations/config/active"),
        fetchAuthed("/admin/recommendations/config/history?limit=25"),
        fetchAuthed("/admin/recommendations/runs?limit=40"),
      ]);

      setOverview(overviewData?.overview || null);
      setActiveConfig(activeData?.activeConfig || null);
      setConfigHistory(Array.isArray(historyData?.history) ? historyData.history : []);
      setRuns(Array.isArray(runsData?.runs) ? runsData.runs : []);
    } catch (err) {
      setError(err.message || "Failed to load admin analytics.");
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    if (overrideInitialized || !activeConfig) return;
    setOverrideState(parseOverrideState(activeConfig));
    setOverrideInitialized(true);
  }, [activeConfig, overrideInitialized]);

  const refreshRunsOnly = useCallback(async () => {
    setSyncingRuns(true);
    try {
      const runsData = await fetchAuthed("/admin/recommendations/runs?limit=40");
      setRuns(Array.isArray(runsData?.runs) ? runsData.runs : []);
    } catch (err) {
      setSimulationError(err.message || "Failed to refresh run history.");
    } finally {
      setSyncingRuns(false);
    }
  }, []);

  const runSimulation = useCallback(async () => {
    setRunningSimulation(true);
    setSimulationError("");
    setConfigError("");

    try {
      const payload = {
        mode,
        candidateConfigOverrides: buildOverridePayload(overrideState),
        ...(mode === "replay" ? replayParams : syntheticParams),
      };

      const result = await fetchAuthed("/admin/recommendations/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setSimulation(result?.simulation || null);
      setLastRunId(result?.runId || null);
      await refreshRunsOnly();
    } catch (err) {
      setSimulationError(err.message || "Failed to run simulation.");
    } finally {
      setRunningSimulation(false);
    }
  }, [mode, overrideState, replayParams, syntheticParams, refreshRunsOnly]);

  const applyConfigFromOverrides = useCallback(async () => {
    setApplyingConfig(true);
    setConfigError("");
    try {
      const payload = {
        confirm: "APPLY",
        sourceRunId: lastRunId,
        notes: `Applied from admin analytics (${mode})`,
        candidateConfigOverrides: buildOverridePayload(overrideState),
      };
      const result = await fetchAuthed("/admin/recommendations/config/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (result?.config) {
        setActiveConfig(result.config);
      }
      await refreshDashboard();
    } catch (err) {
      setConfigError(err.message || "Failed to apply configuration.");
    } finally {
      setApplyingConfig(false);
    }
  }, [lastRunId, mode, overrideState, refreshDashboard]);

  const rollbackConfigToPrevious = useCallback(async () => {
    setRollingBack(true);
    setConfigError("");
    try {
      const result = await fetchAuthed("/admin/recommendations/config/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: "ROLLBACK",
          notes: "Rollback triggered from admin analytics dashboard",
        }),
      });

      if (result?.config) {
        setActiveConfig(result.config);
        setOverrideState(parseOverrideState(result.config));
      }
      await refreshDashboard();
    } catch (err) {
      setConfigError(err.message || "Failed to rollback configuration.");
    } finally {
      setRollingBack(false);
    }
  }, [refreshDashboard]);

  const comparisonChartData = useMemo(() => {
    if (!simulation) return [];
    return [
      {
        metric: "nDCG@k",
        baseline: Number(simulation?.baseline?.ndcgAtK || 0),
        candidate: Number(simulation?.candidate?.ndcgAtK || 0),
      },
      {
        metric: "MRR@k",
        baseline: Number(simulation?.baseline?.mrrAtK || 0),
        candidate: Number(simulation?.candidate?.mrrAtK || 0),
      },
      {
        metric: "Gain@k",
        baseline: Number(simulation?.baseline?.weightedGainAtK || 0),
        candidate: Number(simulation?.candidate?.weightedGainAtK || 0),
      },
    ];
  }, [simulation]);

  const deltaChartData = useMemo(() => {
    if (!simulation) return [];
    return [
      { metric: "nDCG", delta: Number(simulation?.delta?.ndcgAtK || 0) },
      { metric: "MRR", delta: Number(simulation?.delta?.mrrAtK || 0) },
      { metric: "Gain", delta: Number(simulation?.delta?.weightedGainAtK || 0) },
    ];
  }, [simulation]);

  const sliceChartData = useMemo(() => {
    if (!Array.isArray(simulation?.slices)) return [];
    return simulation.slices.slice(0, 10).map((slice) => ({
      sliceShort: abbreviateSliceLabel(slice),
      sliceFull: buildSliceLabel(slice),
      deltaNdcg: Number(slice?.delta?.ndcgAtK || 0),
      requests: Number(slice?.candidate?.requests || 0),
    }));
  }, [simulation]);

  const coverageChartData = useMemo(() => {
    if (!simulation?.coverage) return [];
    const coverage = simulation.coverage;
    return Object.keys(coverage)
      .filter((key) => Number.isFinite(Number(coverage[key])))
      .slice(0, 8)
      .map((key) => ({
        label: key.replace(/([A-Z])/g, " $1"),
        value: Number(coverage[key]),
      }));
  }, [simulation]);

  const runTrendData = useMemo(() => {
    if (!Array.isArray(runs)) return [];
    return [...runs]
      .slice(0, 30)
      .reverse()
      .map((run, index) => ({
        index: index + 1,
        mode: run.mode === "synthetic" ? "synthetic" : "replay",
        createdAt: toLocalDateTime(run.createdAt),
        replayDeltaNdcg:
          (run.mode === "synthetic" ? null : Number(run?.resultSummary?.delta?.ndcgAtK || 0)),
        syntheticDeltaNdcg:
          (run.mode === "synthetic" ? Number(run?.resultSummary?.delta?.ndcgAtK || 0) : null),
        replayRequests:
          (run.mode === "synthetic" ? null : Number(run?.resultSummary?.candidate?.requests || 0)),
        syntheticRequests:
          (run.mode === "synthetic" ? Number(run?.resultSummary?.candidate?.requests || 0) : null),
      }));
  }, [runs]);

  const runModeCounts = useMemo(() => {
    return runs.reduce(
      (acc, run) => {
        if (run?.mode === "synthetic") {
          acc.synthetic += 1;
        } else {
          acc.replay += 1;
        }
        return acc;
      },
      { synthetic: 0, replay: 0 }
    );
  }, [runs]);

  const sampleJourneys = useMemo(() => {
    if (!Array.isArray(simulation?.sampleJourneys)) return [];
    return simulation.sampleJourneys.slice(0, 3);
  }, [simulation]);

  const activeConfigLabel = useMemo(() => {
    if (!activeConfig) return "not loaded";
    return `v${activeConfig.version || 0} • ${activeConfig.scope || "hybrid_v1"} • ${activeConfig.source || "manual"}`;
  }, [activeConfig]);

  const requestCount = Number(
    simulation?.candidate?.requests ??
      simulation?.coverage?.groupsEvaluated ??
      simulation?.coverage?.sessionsEvaluated ??
      0
  );

  return (
    <div className="admin-analytics-page">
      <div className="admin-analytics-shell">
        <header className="admin-hero">
          <div>
            <p className="admin-eyebrow">Patchwork Recommender Lab</p>
            <h1>Recommendation Analytics</h1>
            <p>Run deterministic synthetic persona simulations or replay evaluation, compare ranking quality, and promote config versions safely.</p>
          </div>
          <div className="admin-hero-meta">
            <div>
              <span>Active Config</span>
              <strong>{activeConfigLabel}</strong>
            </div>
            <div>
              <span>Latest Overview</span>
              <strong>{toLocalDateTime(overview?.generatedAt)}</strong>
            </div>
          </div>
        </header>

        {loadingDashboard ? <div className="admin-panel">Loading analytics dashboard...</div> : null}
        {error ? <div className="admin-error">{error}</div> : null}

        {!loadingDashboard && !error ? (
          <>
            <section className="admin-panel controls-grid">
              <div className="control-card">
                <h2>Simulation Mode</h2>
                <div className="segmented-control">
                  <button
                    type="button"
                    className={mode === "synthetic" ? "active" : ""}
                    onClick={() => setMode("synthetic")}
                  >
                    Synthetic
                  </button>
                  <button
                    type="button"
                    className={mode === "replay" ? "active" : ""}
                    onClick={() => setMode("replay")}
                  >
                    Replay
                  </button>
                </div>

                {mode === "replay" ? (
                  <div className="control-fields">
                    <label>
                      Days
                      <input
                        type="number"
                        value={replayParams.days}
                        onChange={(event) =>
                          setReplayParams((prev) => ({
                            ...prev,
                            days: parseInteger(event.target.value, prev.days, 1, 60),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Feed Type
                      <select
                        value={replayParams.type}
                        onChange={(event) =>
                          setReplayParams((prev) => ({
                            ...prev,
                            type: event.target.value,
                          }))
                        }
                      >
                        <option value="all">all</option>
                        <option value="regular">regular</option>
                        <option value="market">market</option>
                      </select>
                    </label>
                    <label>
                      K
                      <input
                        type="number"
                        value={replayParams.k}
                        onChange={(event) =>
                          setReplayParams((prev) => ({
                            ...prev,
                            k: parseInteger(event.target.value, prev.k, 1, 50),
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <div className="control-fields">
                    <label>
                      Seed
                      <input
                        type="text"
                        value={syntheticParams.seed}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            seed: event.target.value || "patchwork-sim-v1",
                          }))
                        }
                      />
                    </label>
                    <label>
                      Sessions
                      <input
                        type="number"
                        value={syntheticParams.sessions}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            sessions: parseInteger(event.target.value, prev.sessions, 1, 5000),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Users
                      <input
                        type="number"
                        value={syntheticParams.users}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            users: parseInteger(event.target.value, prev.users, 1, 1000),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Feed Type
                      <select
                        value={syntheticParams.type}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            type: event.target.value,
                          }))
                        }
                      >
                        <option value="all">all</option>
                        <option value="regular">regular</option>
                        <option value="market">market</option>
                      </select>
                    </label>
                    <label>
                      K
                      <input
                        type="number"
                        value={syntheticParams.k}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            k: parseInteger(event.target.value, prev.k, 1, 100),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Include Cold Start
                      <select
                        value={syntheticParams.includeColdStart ? "yes" : "no"}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            includeColdStart: event.target.value === "yes",
                          }))
                        }
                      >
                        <option value="yes">yes</option>
                        <option value="no">no</option>
                      </select>
                    </label>
                  </div>
                )}

                <div className="control-actions">
                  <button type="button" className="btn-primary" onClick={runSimulation} disabled={runningSimulation}>
                    {runningSimulation ? "Running..." : "Run Simulation"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={refreshRunsOnly} disabled={syncingRuns}>
                    {syncingRuns ? "Refreshing..." : "Refresh Runs"}
                  </button>
                </div>
                {simulationError ? <p className="admin-error-inline">{simulationError}</p> : null}
              </div>

              <div className="control-card">
                <h2>Candidate Overrides</h2>
                <div className="control-fields">
                  <label>
                    Regular Style Weight
                    <input
                      type="number"
                      step="0.1"
                      value={overrideState.regularStyleMatch}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          regularStyleMatch: parseFloatInRange(event.target.value, prev.regularStyleMatch, -10, 10),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Regular Brand Weight
                    <input
                      type="number"
                      step="0.1"
                      value={overrideState.regularBrandMatch}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          regularBrandMatch: parseFloatInRange(event.target.value, prev.regularBrandMatch, -10, 10),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Market Category Weight
                    <input
                      type="number"
                      step="0.1"
                      value={overrideState.marketCategoryMatch}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          marketCategoryMatch: parseFloatInRange(
                            event.target.value,
                            prev.marketCategoryMatch,
                            -10,
                            10
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Market Size Weight
                    <input
                      type="number"
                      step="0.1"
                      value={overrideState.marketSizeMatch}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          marketSizeMatch: parseFloatInRange(event.target.value, prev.marketSizeMatch, -10, 10),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Market Price-Band Weight
                    <input
                      type="number"
                      step="0.1"
                      value={overrideState.marketPriceBandMatch}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          marketPriceBandMatch: parseFloatInRange(
                            event.target.value,
                            prev.marketPriceBandMatch,
                            -10,
                            10
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Default Market Share
                    <input
                      type="number"
                      step="0.05"
                      value={overrideState.blendDefaultMarketShare}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          blendDefaultMarketShare: parseFloatInRange(
                            event.target.value,
                            prev.blendDefaultMarketShare,
                            0,
                            1
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Min Market Share
                    <input
                      type="number"
                      step="0.05"
                      value={overrideState.blendMinMarketShare}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          blendMinMarketShare: parseFloatInRange(
                            event.target.value,
                            prev.blendMinMarketShare,
                            0,
                            1
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Max Market Share
                    <input
                      type="number"
                      step="0.05"
                      value={overrideState.blendMaxMarketShare}
                      onChange={(event) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          blendMaxMarketShare: parseFloatInRange(
                            event.target.value,
                            prev.blendMaxMarketShare,
                            0,
                            1
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="control-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setConfirmAction("apply")}
                    disabled={applyingConfig}
                  >
                    {applyingConfig ? "Applying..." : "Apply Config"}
                  </button>
                  <button
                    type="button"
                    className="btn-warning"
                    onClick={() => setConfirmAction("rollback")}
                    disabled={rollingBack}
                  >
                    {rollingBack ? "Rolling Back..." : "Rollback"}
                  </button>
                </div>
                {configError ? <p className="admin-error-inline">{configError}</p> : null}
              </div>
            </section>

            <section className="kpi-strip">
              <article className="kpi-card">
                <span>Users</span>
                <strong>{overview?.counts?.users ?? 0}</strong>
              </article>
              <article className="kpi-card">
                <span>Posts</span>
                <strong>{overview?.counts?.posts ?? 0}</strong>
              </article>
              <article className="kpi-card">
                <span>Session Coverage</span>
                <strong>{toMetric(overview?.telemetryCoverage?.sessionIdCoveragePct ?? 0, 2)}%</strong>
              </article>
              <article className="kpi-card">
                <span>Request Coverage</span>
                <strong>{toMetric(overview?.telemetryCoverage?.requestIdCoveragePct ?? 0, 2)}%</strong>
              </article>
              <article className="kpi-card">
                <span>Requests Evaluated</span>
                <strong>{requestCount}</strong>
              </article>
            </section>

            <section className="chart-grid">
              <article className="admin-panel chart-card">
                <h2>Baseline vs Candidate</h2>
                {comparisonChartData.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={comparisonChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                      <XAxis dataKey="metric" stroke="#9db0d9" />
                      <YAxis stroke="#9db0d9" />
                      <Tooltip {...TOOLTIP_PROPS} />
                      <Legend />
                      <Bar dataKey="baseline" name="baseline" fill="#607194" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="candidate" name="candidate" fill="#31d0aa" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="chart-empty">Run a simulation to populate KPI comparisons.</p>
                )}
              </article>

              <article className="admin-panel chart-card">
                <h2>Delta Metrics</h2>
                <div className="delta-summary">
                  <p className={`delta-item ${metricClass(simulation?.delta?.ndcgAtK)}`}>
                    dNDCG@k {toSignedMetric(simulation?.delta?.ndcgAtK)}
                  </p>
                  <p className={`delta-item ${metricClass(simulation?.delta?.mrrAtK)}`}>
                    dMRR@k {toSignedMetric(simulation?.delta?.mrrAtK)}
                  </p>
                  <p className={`delta-item ${metricClass(simulation?.delta?.weightedGainAtK)}`}>
                    dGain@k {toSignedMetric(simulation?.delta?.weightedGainAtK)}
                  </p>
                </div>
                {deltaChartData.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={deltaChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                      <XAxis dataKey="metric" stroke="#9db0d9" />
                      <YAxis stroke="#9db0d9" />
                      <Tooltip {...TOOLTIP_PROPS} />
                      <Bar dataKey="delta" fill="#f2b84b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="chart-empty">No delta metrics yet.</p>
                )}
              </article>

              <article className="admin-panel chart-card">
                <h2>Slice Breakdown</h2>
                {sliceChartData.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={sliceChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                      <XAxis
                        dataKey="sliceShort"
                        stroke="#9db0d9"
                        tick={{ fill: "#9db0d9", fontSize: 11 }}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={58}
                      />
                      <YAxis stroke="#9db0d9" />
                      <Tooltip content={<SliceTooltip />} />
                      <Bar dataKey="deltaNdcg" name="dNDCG" fill="#5ca2ff" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="chart-empty">No slice data available.</p>
                )}
              </article>

              <article className="admin-panel chart-card">
                <h2>Coverage Diagnostics</h2>
                {coverageChartData.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={coverageChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                      <XAxis dataKey="label" stroke="#9db0d9" interval={0} angle={-18} textAnchor="end" height={72} />
                      <YAxis stroke="#9db0d9" />
                      <Tooltip {...TOOLTIP_PROPS} />
                      <Bar dataKey="value" fill="#d272f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="chart-empty">Coverage appears after a simulation run.</p>
                )}
              </article>

              <article className="admin-panel chart-card chart-card--wide">
                <h2>Recent Run Trends (Synthetic vs Replay)</h2>
                <p className="chart-empty">
                  Synthetic runs: {runModeCounts.synthetic} | Replay runs: {runModeCounts.replay}
                </p>
                {runTrendData.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={runTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                      <XAxis dataKey="index" stroke="#9db0d9" />
                      <YAxis stroke="#9db0d9" />
                      <Tooltip {...TOOLTIP_PROPS} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="syntheticDeltaNdcg"
                        name="synthetic dNDCG"
                        stroke="#31d0aa"
                        strokeWidth={2}
                        connectNulls={false}
                        dot={{ r: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="replayDeltaNdcg"
                        name="replay dNDCG"
                        stroke="#5da2ff"
                        strokeWidth={2}
                        connectNulls={false}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="chart-empty">No run history yet.</p>
                )}
              </article>
            </section>

            <section className="data-grid">
              <article className="admin-panel">
                <h2>Sample Journeys</h2>
                {sampleJourneys.length ? (
                  sampleJourneys.map((journey) => (
                    <div className="journey-card" key={`${journey.userId}-${journey.sessionIndex}`}>
                      <header>
                        <strong>{journey.personaType}</strong>
                        <span>session #{journey.sessionIndex}</span>
                      </header>
                      <p>
                        baseline clicks {journey?.baselineEvents?.clicks || 0} / candidate clicks {journey?.candidateEvents?.clicks || 0}
                      </p>
                      <p>
                        baseline likes {journey?.baselineEvents?.likes || 0} / candidate likes {journey?.candidateEvents?.likes || 0}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="chart-empty">Sample journeys are shown for synthetic simulations.</p>
                )}
              </article>

              <article className="admin-panel">
                <h2>Config History</h2>
                {configHistory.length ? (
                  <div className="history-list">
                    {configHistory.slice(0, 8).map((entry) => (
                      <div className="history-row" key={entry.id}>
                        <div>
                          <strong>v{entry.version}</strong>
                          <p>{entry.source}</p>
                        </div>
                        <div>
                          <p>{entry.isActive ? "active" : "inactive"}</p>
                          <p>{toLocalDateTime(entry.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="chart-empty">No config history found.</p>
                )}
              </article>
            </section>
          </>
        ) : null}
      </div>

      {confirmAction ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <h3>{confirmAction === "apply" ? "Apply Configuration" : "Rollback Configuration"}</h3>
            <p>
              {confirmAction === "apply"
                ? "Apply the current override values as the active production recommendation config?"
                : "Rollback to the previous active recommendation config version?"}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmAction === "apply" ? "btn-primary" : "btn-warning"}
                onClick={async () => {
                  if (confirmAction === "apply") {
                    await applyConfigFromOverrides();
                  } else {
                    await rollbackConfigToPrevious();
                  }
                  setConfirmAction(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AdminSimulationPage;
