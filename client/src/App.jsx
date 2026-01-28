import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function App() {
  const [apiStatus, setApiStatus] = useState({
    loading: true,
    error: null,
    data: null,
  });

  const statusChips = useMemo(() => {
    const base = {
      label: "Checking...",
      tone: "idle",
    };

    if (apiStatus.loading) return base;
    if (apiStatus.error)
      return { label: "API unreachable", tone: "error" };

    const isDbConnected = apiStatus.data?.database === "connected";
    return {
      label: isDbConnected ? "API + MongoDB online" : "API online, DB not ready",
      tone: isDbConnected ? "ok" : "warn",
    };
  }, [apiStatus]);

  useEffect(() => {
    let isMounted = true;

    async function fetchHealth() {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const payload = await res.json();
        if (isMounted) setApiStatus({ loading: false, error: null, data: payload });
      } catch (err) {
        if (isMounted) setApiStatus({ loading: false, error: err, data: null });
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="page">
      <header className="hero">
        <div className="eyebrow">Patchwork • React + MongoDB kickoff</div>
        <h1>
          Build the Patchwork experience <span className="highlight">fast</span>
        </h1>
        <p className="lede">
          Frontend is ready with Vite + React, backend is wired to Express and MongoDB.
          Start adding auth, feeds, and marketplace flows without worrying about the scaffolding.
        </p>
        <div className="hero-actions">
          <div className={`chip chip-${statusChips.tone}`}>{statusChips.label}</div>
          <div className="cta-block">
            <p className="cta-title">Local dev</p>
            <div className="cta-steps">
              <span className="pill">npm run dev --prefix server</span>
              <span className="pill">npm run dev --prefix client</span>
            </div>
          </div>
        </div>
      </header>

      <section className="grid">
        <div className="card">
          <h2>API health</h2>
          <p>
            {apiStatus.loading && "Checking server…"}
            {apiStatus.error && "Cannot reach API. Is the server running on port 5000?"}
            {apiStatus.data && (
              <>
                <strong>Response:</strong> {apiStatus.data.status} • {apiStatus.data.timestamp}
              </>
            )}
          </p>
        </div>
        <div className="card">
          <h2>Database</h2>
          <p>
            {apiStatus.loading && "Connecting to MongoDB…"}
            {apiStatus.error && "Waiting for MongoDB connection."}
            {apiStatus.data && `Current state: ${apiStatus.data.database}`}
          </p>
        </div>
        <div className="card card-accent">
          <h2>Next steps</h2>
          <ul>
            <li>Define schemas for users, posts, boards, and sessions.</li>
            <li>Implement auth endpoints and JWT verification middleware.</li>
            <li>Start sketching feed + marketplace UI flows in React.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export default App;
