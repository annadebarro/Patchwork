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

const LOCAL_STORAGE_KEYS = Object.freeze({
  mode: "admin-sim-mode",
  replayParams: "admin-sim-replay-params",
  syntheticParams: "admin-sim-synthetic-params",
  overrides: "admin-sim-overrides",
  selectedTrack: "admin-sim-selected-track",
  runFilters: "admin-sim-run-filters",
});

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
  tracks: ["realism", "balanced"],
  balancedPolicy: {
    recencyShares: {
      d0to7: 0.4,
      d8to30: 0.35,
      d31plus: 0.25,
    },
    authorCapPct: 0.1,
    minUniqueAuthorsAbsolute: 12,
    minUniqueAuthorsRatio: 0.35,
  },
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

const DEFAULT_RUN_FILTERS = Object.freeze({
  mode: "all",
  track: "all",
  from: "",
  to: "",
});

function safeReadJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeReadString(key, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return typeof value === "string" && value.trim() ? value : fallback;
}

function safeWriteLocalStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    if (typeof value === "string") {
      window.localStorage.setItem(key, value);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence errors.
  }
}

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

function buildRunsPath(filters = {}) {
  const params = new URLSearchParams();
  params.set("limit", "40");

  if (filters.mode && filters.mode !== "all") {
    params.set("mode", filters.mode);
  }
  if (filters.track && filters.track !== "all") {
    params.set("track", filters.track);
  }
  if (filters.from) {
    params.set("from", filters.from);
  }
  if (filters.to) {
    params.set("to", filters.to);
  }

  return `/admin/recommendations/runs?${params.toString()}`;
}

function parseTrackPreset(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return "both";
  const normalized = [...new Set(tracks.map((entry) => String(entry || "").trim().toLowerCase()))];
  if (normalized.length === 2 && normalized.includes("realism") && normalized.includes("balanced")) {
    return "both";
  }
  if (normalized.includes("realism") && normalized.length === 1) return "realism";
  if (normalized.includes("balanced") && normalized.length === 1) return "balanced";
  return "both";
}

function tracksForPreset(preset) {
  if (preset === "realism") return ["realism"];
  if (preset === "balanced") return ["balanced"];
  return ["realism", "balanced"];
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AdminSimulationPage() {
  const [overview, setOverview] = useState(null);
  const [schemaHealth, setSchemaHealth] = useState(null);
  const [activeConfig, setActiveConfig] = useState(null);
  const [configHistory, setConfigHistory] = useState([]);
  const [runs, setRuns] = useState([]);
  const [simulation, setSimulation] = useState(null);
  const [lastRunId, setLastRunId] = useState(null);

  const [mode, setMode] = useState(() => safeReadString(LOCAL_STORAGE_KEYS.mode, "synthetic"));
  const [replayParams, setReplayParams] = useState(() => ({
    ...DEFAULT_REPLAY,
    ...safeReadJson(LOCAL_STORAGE_KEYS.replayParams, DEFAULT_REPLAY),
  }));
  const [syntheticParams, setSyntheticParams] = useState(() => ({
    ...DEFAULT_SYNTHETIC,
    ...safeReadJson(LOCAL_STORAGE_KEYS.syntheticParams, DEFAULT_SYNTHETIC),
  }));
  const [overrideState, setOverrideState] = useState(() => ({
    ...DEFAULT_OVERRIDE_STATE,
    ...safeReadJson(LOCAL_STORAGE_KEYS.overrides, DEFAULT_OVERRIDE_STATE),
  }));

  const [selectedTrack, setSelectedTrack] = useState(
    () => safeReadString(LOCAL_STORAGE_KEYS.selectedTrack, "realism")
  );
  const [runFilters, setRunFilters] = useState(() => ({
    ...DEFAULT_RUN_FILTERS,
    ...safeReadJson(LOCAL_STORAGE_KEYS.runFilters, DEFAULT_RUN_FILTERS),
  }));

  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [compareRunA, setCompareRunA] = useState("");
  const [compareRunB, setCompareRunB] = useState("");

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

  useEffect(() => {
    safeWriteLocalStorage(LOCAL_STORAGE_KEYS.mode, mode);
  }, [mode]);
  useEffect(() => {
    safeWriteLocalStorage(LOCAL_STORAGE_KEYS.replayParams, replayParams);
  }, [replayParams]);
  useEffect(() => {
    safeWriteLocalStorage(LOCAL_STORAGE_KEYS.syntheticParams, syntheticParams);
  }, [syntheticParams]);
  useEffect(() => {
    safeWriteLocalStorage(LOCAL_STORAGE_KEYS.overrides, overrideState);
  }, [overrideState]);
  useEffect(() => {
    safeWriteLocalStorage(LOCAL_STORAGE_KEYS.selectedTrack, selectedTrack);
  }, [selectedTrack]);
  useEffect(() => {
    safeWriteLocalStorage(LOCAL_STORAGE_KEYS.runFilters, runFilters);
  }, [runFilters]);

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setError("");

    try {
      const [overviewData, activeData, historyData, runsData, schemaData] = await Promise.all([
        fetchAuthed("/admin/recommendations/overview"),
        fetchAuthed("/admin/recommendations/config/active"),
        fetchAuthed("/admin/recommendations/config/history?limit=25"),
        fetchAuthed(buildRunsPath(runFilters)),
        fetchAuthed("/admin/recommendations/schema-health"),
      ]);

      setOverview(overviewData?.overview || null);
      setActiveConfig(activeData?.activeConfig || null);
      setConfigHistory(Array.isArray(historyData?.history) ? historyData.history : []);
      setRuns(Array.isArray(runsData?.runs) ? runsData.runs : []);
      setSchemaHealth(schemaData?.schemaHealth || null);
    } catch (err) {
      setError(err.message || "Failed to load admin analytics.");
    } finally {
      setLoadingDashboard(false);
    }
  }, [runFilters]);

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
    setSimulationError("");
    try {
      const runsData = await fetchAuthed(buildRunsPath(runFilters));
      setRuns(Array.isArray(runsData?.runs) ? runsData.runs : []);
    } catch (err) {
      setSimulationError(err.message || "Failed to refresh run history.");
    } finally {
      setSyncingRuns(false);
    }
  }, [runFilters]);

  const fetchRunDetail = useCallback(async (runId) => {
    if (!runId) return;
    setSelectedRunId(runId);
    setLoadingRunDetail(true);
    setSimulationError("");

    try {
      const data = await fetchAuthed(`/admin/recommendations/runs/${runId}`);
      setSelectedRun(data?.run || null);
    } catch (err) {
      setSimulationError(err.message || "Failed to load run detail.");
      setSelectedRun(null);
    } finally {
      setLoadingRunDetail(false);
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

  const availableTracks = useMemo(() => {
    const tracks = simulation?.tracks && typeof simulation.tracks === "object"
      ? Object.keys(simulation.tracks)
      : [];
    return tracks.filter((track) => track === "realism" || track === "balanced");
  }, [simulation]);

  useEffect(() => {
    if (!availableTracks.length) return;
    if (!availableTracks.includes(selectedTrack)) {
      setSelectedTrack(availableTracks[0]);
    }
  }, [availableTracks, selectedTrack]);

  const effectiveTrack = useMemo(() => {
    if (!availableTracks.length) return null;
    if (availableTracks.includes(selectedTrack)) return selectedTrack;
    return availableTracks[0];
  }, [availableTracks, selectedTrack]);

  const simulationView = useMemo(() => {
    if (!simulation) return null;
    if (effectiveTrack && simulation.tracks?.[effectiveTrack]) {
      return simulation.tracks[effectiveTrack];
    }
    return simulation;
  }, [simulation, effectiveTrack]);

  const activeBias = useMemo(() => {
    if (!simulation) return null;
    if (effectiveTrack && simulation.biasDiagnostics?.[effectiveTrack]) {
      return simulation.biasDiagnostics[effectiveTrack];
    }
    return simulationView?.biasDiagnostics || null;
  }, [simulation, simulationView, effectiveTrack]);

  const comparisonChartData = useMemo(() => {
    if (!simulationView) return [];
    return [
      {
        metric: "nDCG@k",
        baseline: Number(simulationView?.baseline?.ndcgAtK || 0),
        candidate: Number(simulationView?.candidate?.ndcgAtK || 0),
      },
      {
        metric: "MRR@k",
        baseline: Number(simulationView?.baseline?.mrrAtK || 0),
        candidate: Number(simulationView?.candidate?.mrrAtK || 0),
      },
      {
        metric: "Gain@k",
        baseline: Number(simulationView?.baseline?.weightedGainAtK || 0),
        candidate: Number(simulationView?.candidate?.weightedGainAtK || 0),
      },
    ];
  }, [simulationView]);

  const deltaChartData = useMemo(() => {
    if (!simulationView) return [];
    return [
      { metric: "nDCG", delta: Number(simulationView?.delta?.ndcgAtK || 0) },
      { metric: "MRR", delta: Number(simulationView?.delta?.mrrAtK || 0) },
      { metric: "Gain", delta: Number(simulationView?.delta?.weightedGainAtK || 0) },
    ];
  }, [simulationView]);

  const sliceChartData = useMemo(() => {
    if (!Array.isArray(simulationView?.slices)) return [];
    return simulationView.slices.slice(0, 10).map((slice) => ({
      sliceShort: abbreviateSliceLabel(slice),
      sliceFull: buildSliceLabel(slice),
      deltaNdcg: Number(slice?.delta?.ndcgAtK || 0),
      requests: Number(slice?.candidate?.requests || 0),
    }));
  }, [simulationView]);

  const coverageChartData = useMemo(() => {
    if (!simulationView?.coverage) return [];
    const coverage = simulationView.coverage;
    return Object.keys(coverage)
      .filter((key) => Number.isFinite(Number(coverage[key])))
      .slice(0, 8)
      .map((key) => ({
        label: key.replace(/([A-Z])/g, " $1"),
        value: Number(coverage[key]),
      }));
  }, [simulationView]);

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
          run.mode === "synthetic" ? null : Number(run?.resultSummary?.delta?.ndcgAtK || 0),
        syntheticDeltaNdcg:
          run.mode === "synthetic" ? Number(run?.resultSummary?.delta?.ndcgAtK || 0) : null,
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
    if (!Array.isArray(simulationView?.sampleJourneys)) return [];
    return simulationView.sampleJourneys.slice(0, 3);
  }, [simulationView]);

  const activeConfigLabel = useMemo(() => {
    if (!activeConfig) return "not loaded";
    return `v${activeConfig.version || 0} • ${activeConfig.scope || "hybrid_v1"} • ${activeConfig.source || "manual"}`;
  }, [activeConfig]);

  const requestCount = Number(
    simulationView?.candidate?.requests ??
    simulationView?.coverage?.groupsEvaluated ??
    simulationView?.coverage?.sessionsEvaluated ??
    0
  );

  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);

  const runComparison = useMemo(() => {
    if (!compareRunA || !compareRunB) return null;
    if (compareRunA === compareRunB) return null;

    const left = runById.get(compareRunA);
    const right = runById.get(compareRunB);
    if (!left || !right) return null;

    const leftDelta = Number(left?.resultSummary?.delta?.ndcgAtK || 0);
    const rightDelta = Number(right?.resultSummary?.delta?.ndcgAtK || 0);

    return {
      left,
      right,
      deltaNdcgDiff: Number((leftDelta - rightDelta).toFixed(4)),
    };
  }, [compareRunA, compareRunB, runById]);

  const schemaIssues = useMemo(() => {
    const checks = Array.isArray(schemaHealth?.checks) ? schemaHealth.checks : [];
    return checks.filter((check) => check.status !== "ok");
  }, [schemaHealth]);

  return (
    <div className="admin-analytics-page">
      <div className="admin-analytics-shell">
        <header className="admin-hero">
          <div>
            <p className="admin-eyebrow">Patchwork Recommender Lab</p>
            <h1>Recommendation Analytics</h1>
            <p>
              Run deterministic simulation tracks, compare realism vs balanced bias behavior,
              inspect schema health, and promote config versions safely.
            </p>
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
            <section className="admin-panel controls-grid controls-grid--sticky">
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
                    <label>
                      Persona Mix
                      <select
                        value={syntheticParams.personaMix}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            personaMix: event.target.value,
                          }))
                        }
                      >
                        <option value="balanced">balanced</option>
                        <option value="regular_heavy">regular_heavy</option>
                        <option value="market_heavy">market_heavy</option>
                      </select>
                    </label>
                    <label>
                      Track Set
                      <select
                        value={parseTrackPreset(syntheticParams.tracks)}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            tracks: tracksForPreset(event.target.value),
                          }))
                        }
                      >
                        <option value="both">realism + balanced</option>
                        <option value="realism">realism only</option>
                        <option value="balanced">balanced only</option>
                      </select>
                    </label>
                    <label>
                      Balanced Author Cap %
                      <input
                        type="number"
                        step="0.01"
                        value={syntheticParams.balancedPolicy?.authorCapPct ?? 0.1}
                        onChange={(event) =>
                          setSyntheticParams((prev) => ({
                            ...prev,
                            balancedPolicy: {
                              ...(prev.balancedPolicy || {}),
                              authorCapPct: parseFloatInRange(
                                event.target.value,
                                prev.balancedPolicy?.authorCapPct ?? 0.1,
                                0.01,
                                0.8
                              ),
                            },
                          }))
                        }
                      />
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
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => simulation && downloadJson(`simulation-${Date.now()}.json`, simulation)}
                    disabled={!simulation}
                  >
                    Export JSON
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
                          marketCategoryMatch: parseFloatInRange(event.target.value, prev.marketCategoryMatch, -10, 10),
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
                          marketPriceBandMatch: parseFloatInRange(event.target.value, prev.marketPriceBandMatch, -10, 10),
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
                          blendDefaultMarketShare: parseFloatInRange(event.target.value, prev.blendDefaultMarketShare, 0, 1),
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
                          blendMinMarketShare: parseFloatInRange(event.target.value, prev.blendMinMarketShare, 0, 1),
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
                          blendMaxMarketShare: parseFloatInRange(event.target.value, prev.blendMaxMarketShare, 0, 1),
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

            {availableTracks.length ? (
              <section className="admin-panel track-toggle-panel">
                <h2>Track View</h2>
                <div className="segmented-control">
                  {availableTracks.map((track) => (
                    <button
                      key={track}
                      type="button"
                      className={selectedTrack === track ? "active" : ""}
                      onClick={() => setSelectedTrack(track)}
                    >
                      {track}
                    </button>
                  ))}
                </div>
                {simulation?.trackComparison ? (
                  <p className="chart-empty">
                    balanced-vs-realism dNDCG lift delta {toSignedMetric(simulation.trackComparison?.liftDelta?.ndcgAtK || 0)}
                  </p>
                ) : null}
              </section>
            ) : null}

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
                  <p className={`delta-item ${metricClass(simulationView?.delta?.ndcgAtK)}`}>
                    dNDCG@k {toSignedMetric(simulationView?.delta?.ndcgAtK)}
                  </p>
                  <p className={`delta-item ${metricClass(simulationView?.delta?.mrrAtK)}`}>
                    dMRR@k {toSignedMetric(simulationView?.delta?.mrrAtK)}
                  </p>
                  <p className={`delta-item ${metricClass(simulationView?.delta?.weightedGainAtK)}`}>
                    dGain@k {toSignedMetric(simulationView?.delta?.weightedGainAtK)}
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
                <h2>Bias Diagnostics ({effectiveTrack || "primary"})</h2>
                {activeBias ? (
                  <div className="history-list">
                    <div className="history-row">
                      <div>
                        <strong>Top Author Share</strong>
                        <p>{toMetric(activeBias.topAuthorSharePct || 0, 2)}%</p>
                      </div>
                      <div>
                        <strong>Unique Authors</strong>
                        <p>{activeBias.uniqueAuthors || 0}</p>
                      </div>
                    </div>
                    <div className="history-row">
                      <div>
                        <strong>Concentration Index</strong>
                        <p>{toMetric(activeBias.concentrationIndex || 0, 4)}</p>
                      </div>
                      <div>
                        <strong>Candidate Items</strong>
                        <p>{activeBias.candidateItems || 0}</p>
                      </div>
                    </div>
                    <div className="history-row">
                      <div>
                        <strong>Recency Mix 0-7d / 8-30d / 31+d</strong>
                        <p>
                          {toMetric(activeBias?.recencyMixPct?.d0to7 || 0, 1)}% / {toMetric(activeBias?.recencyMixPct?.d8to30 || 0, 1)}% /
                          {" "}{toMetric(activeBias?.recencyMixPct?.d31plus || 0, 1)}%
                        </p>
                      </div>
                      <div>
                        <strong>Type Mix reg / mkt</strong>
                        <p>
                          {toMetric(activeBias?.typeMixPct?.regular || 0, 1)}% / {toMetric(activeBias?.typeMixPct?.market || 0, 1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="chart-empty">Bias diagnostics appear after synthetic runs.</p>
                )}
              </article>

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
                  <p className="chart-empty">Sample journeys are shown for simulation runs.</p>
                )}
              </article>

              <article className="admin-panel">
                <h2>Run Explorer</h2>
                <div className="control-fields">
                  <label>
                    Mode Filter
                    <select
                      value={runFilters.mode}
                      onChange={(event) => setRunFilters((prev) => ({ ...prev, mode: event.target.value }))}
                    >
                      <option value="all">all</option>
                      <option value="synthetic">synthetic</option>
                      <option value="replay">replay</option>
                    </select>
                  </label>
                  <label>
                    Track Filter
                    <select
                      value={runFilters.track}
                      onChange={(event) => setRunFilters((prev) => ({ ...prev, track: event.target.value }))}
                    >
                      <option value="all">all</option>
                      <option value="realism">realism</option>
                      <option value="balanced">balanced</option>
                    </select>
                  </label>
                  <label>
                    From (ISO)
                    <input
                      type="text"
                      value={runFilters.from}
                      placeholder="2026-02-01T00:00:00.000Z"
                      onChange={(event) => setRunFilters((prev) => ({ ...prev, from: event.target.value.trim() }))}
                    />
                  </label>
                  <label>
                    To (ISO)
                    <input
                      type="text"
                      value={runFilters.to}
                      placeholder="2026-02-28T23:59:59.999Z"
                      onChange={(event) => setRunFilters((prev) => ({ ...prev, to: event.target.value.trim() }))}
                    />
                  </label>
                </div>
                <div className="control-actions">
                  <button type="button" className="btn-secondary" onClick={refreshRunsOnly} disabled={syncingRuns}>
                    {syncingRuns ? "Refreshing..." : "Apply Run Filters"}
                  </button>
                </div>

                <div className="history-list">
                  {runs.slice(0, 8).map((run) => (
                    <div className="history-row" key={run.id}>
                      <div>
                        <strong>{run.mode}</strong>
                        <p>{toLocalDateTime(run.createdAt)}</p>
                      </div>
                      <div>
                        <p>dNDCG {toSignedMetric(run?.resultSummary?.delta?.ndcgAtK || 0)}</p>
                        <button type="button" className="btn-secondary" onClick={() => fetchRunDetail(run.id)}>
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {loadingRunDetail ? <p className="chart-empty">Loading run detail...</p> : null}
                {selectedRunId && !loadingRunDetail && selectedRun ? (
                  <div className="journey-card">
                    <header>
                      <strong>Run Detail</strong>
                      <span>{selectedRun.id}</span>
                    </header>
                    <p>mode {selectedRun.mode}</p>
                    <p>created {toLocalDateTime(selectedRun.createdAt)}</p>
                    <p>dNDCG {toSignedMetric(selectedRun?.resultSummary?.delta?.ndcgAtK || 0)}</p>
                    <p>tracks {Array.isArray(selectedRun?.params?.tracks) ? selectedRun.params.tracks.join(", ") : "n/a"}</p>
                  </div>
                ) : null}
              </article>

              <article className="admin-panel">
                <h2>Run Comparison</h2>
                <div className="control-fields">
                  <label>
                    Run A
                    <select value={compareRunA} onChange={(event) => setCompareRunA(event.target.value)}>
                      <option value="">Select run</option>
                      {runs.map((run) => (
                        <option key={run.id} value={run.id}>
                          {run.id.slice(0, 8)} • {run.mode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Run B
                    <select value={compareRunB} onChange={(event) => setCompareRunB(event.target.value)}>
                      <option value="">Select run</option>
                      {runs.map((run) => (
                        <option key={run.id} value={run.id}>
                          {run.id.slice(0, 8)} • {run.mode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {runComparison ? (
                  <div className="journey-card">
                    <p>A: {runComparison.left.id}</p>
                    <p>B: {runComparison.right.id}</p>
                    <p>dNDCG(A-B): {toSignedMetric(runComparison.deltaNdcgDiff)}</p>
                  </div>
                ) : (
                  <p className="chart-empty">Select two different runs to compare.</p>
                )}
              </article>

              <article className="admin-panel">
                <h2>Schema Health</h2>
                {schemaHealth ? (
                  <>
                    <p className={schemaHealth.healthy ? "chart-empty" : "admin-error-inline"}>
                      {schemaHealth.humanSummary}
                    </p>
                    {schemaIssues.length ? (
                      <div className="history-list">
                        {schemaIssues.map((item) => (
                          <div className="history-row" key={item.table}>
                            <div>
                              <strong>{item.table}</strong>
                              <p>{item.purpose}</p>
                            </div>
                            <div>
                              <p>{item.status}</p>
                              <p>
                                missing cols {Array.isArray(item.missingColumns) ? item.missingColumns.length : 0}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="chart-empty">All tracked schema checks are healthy.</p>
                    )}
                  </>
                ) : (
                  <p className="chart-empty">Schema diagnostics unavailable.</p>
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
