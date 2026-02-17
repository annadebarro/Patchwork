import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";

function formatPct(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US");
}

function AdminSimulationPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchOverview() {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch("/admin/recommendations/overview", {
          auth: true,
          method: "GET",
          surface: REQUEST_SURFACES.UNKNOWN,
        });
        const data = await parseApiResponse(res);
        if (!res.ok) {
          if (isMounted) {
            setError(data?.message || "Failed to load recommendation simulation overview.");
          }
          return;
        }

        if (isMounted) {
          setOverview(data?.overview || null);
        }
      } catch {
        if (isMounted) {
          setError("Network error while loading admin overview.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchOverview();
    return () => {
      isMounted = false;
    };
  }, []);

  const actionRows = useMemo(() => {
    const rows = Array.isArray(overview?.actions7d) ? overview.actions7d : [];
    return rows.slice(0, 12);
  }, [overview]);

  return (
    <div className="feed-content">
      <section className="settings-page">
        <header className="settings-header">
          <button
            className="back-button"
            type="button"
            onClick={() => navigate("/home")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to feed
          </button>
          <h1 className="settings-title">Recommendation Simulation Admin</h1>
        </header>

        {loading && <div className="feed-empty">Loading admin overview...</div>}
        {!loading && error && <div className="error">{error}</div>}

        {!loading && !error && overview && (
          <>
            <div className="post-detail-metadata-grid">
              <div className="post-detail-metadata-item">
                <span className="post-detail-metadata-label">Users</span>
                <span>{overview.counts?.users ?? 0}</span>
              </div>
              <div className="post-detail-metadata-item">
                <span className="post-detail-metadata-label">Posts</span>
                <span>{overview.counts?.posts ?? 0}</span>
              </div>
              <div className="post-detail-metadata-item">
                <span className="post-detail-metadata-label">Regular Posts</span>
                <span>{overview.counts?.postsByType?.regular ?? 0}</span>
              </div>
              <div className="post-detail-metadata-item">
                <span className="post-detail-metadata-label">Market Posts</span>
                <span>{overview.counts?.postsByType?.market ?? 0}</span>
              </div>
            </div>

            <div className="settings-section">
              <h2 className="settings-section-title">Telemetry Coverage</h2>
              <p className="field-note">
                Session ID coverage: {formatPct(overview.telemetryCoverage?.sessionIdCoveragePct)} | Request ID
                coverage: {formatPct(overview.telemetryCoverage?.requestIdCoveragePct)}
              </p>
              <p className="field-note">
                Feed events analyzed: {overview.telemetryCoverage?.totalFeedEvents ?? 0}
              </p>
              {overview.generatedAt && (
                <p className="field-note">Generated: {formatDate(overview.generatedAt)}</p>
              )}
            </div>

            <div className="settings-section">
              <h2 className="settings-section-title">7-Day Action Summary</h2>
              {actionRows.length ? (
                <div className="post-tag-list">
                  {actionRows.map((row) => (
                    <span key={row.actionType} className="post-tag-chip">
                      {row.actionType}: {row.count}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="post-tag-empty">No recent actions yet.</p>
              )}
            </div>

            <div className="settings-section">
              <h2 className="settings-section-title">Top Tags</h2>
              <h3 className="settings-subtitle">Style</h3>
              {overview.topTags?.style?.length ? (
                <div className="post-tag-list">
                  {overview.topTags.style.map((row) => (
                    <span key={`style-${row.value}`} className="post-tag-chip">
                      {row.value}: {row.count}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="post-tag-empty">No style tags found.</p>
              )}

              <h3 className="settings-subtitle">Color</h3>
              {overview.topTags?.color?.length ? (
                <div className="post-tag-list">
                  {overview.topTags.color.map((row) => (
                    <span key={`color-${row.value}`} className="post-tag-chip">
                      {row.value}: {row.count}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="post-tag-empty">No color tags found.</p>
              )}
            </div>

            <div className="settings-section">
              <h2 className="settings-section-title">Simulation Controls</h2>
              <p className="field-note">
                Scaffold only in this phase. Runtime simulation actions will be enabled after algorithm integration.
              </p>
              <div className="post-edit-actions">
                <button type="button" className="save-button save-button--sm" disabled>
                  Run Simulation (Upcoming)
                </button>
                <button type="button" className="cancel-button cancel-button--sm" disabled>
                  Compare Scenario (Upcoming)
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default AdminSimulationPage;
