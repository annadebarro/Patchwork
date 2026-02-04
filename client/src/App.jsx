import { useEffect, useState } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function App() {
  const navigate = useNavigate();
  const [authView, setAuthView] = useState("login");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setCheckingAuth(false);
      return;
    }

    async function fetchMe() {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          localStorage.removeItem("token");
        }
      } catch {
        localStorage.removeItem("token");
      } finally {
        setCheckingAuth(false);
      }
    }

    fetchMe();
  }, []);

  async function parseResponse(res) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        return await res.json();
      } catch (err) {
        console.error("Failed to parse JSON response", err);
        return null;
      }
    }

    try {
      const text = await res.text();
      return text ? { message: text } : null;
    } catch (err) {
      console.error("Failed to read response body", err);
      return null;
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const url = `${API_BASE_URL}/auth/register`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await parseResponse(res);
      if (!res.ok) {
        const message = data?.message || `Request failed (${res.status})`;
        setError(message);
        console.error("Signup failed", { url, status: res.status, statusText: res.statusText, data });
      } else {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        navigate("/home/social", { replace: true });
      }
    } catch (err) {
      console.error("Signup network error", err);
      setError("Network error. Please check the console for details.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const url = `${API_BASE_URL}/auth/login`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await parseResponse(res);
      if (!res.ok) {
        const message = data?.message || `Request failed (${res.status})`;
        setError(message);
        console.error("Login failed", { url, status: res.status, statusText: res.statusText, data });
      } else {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        navigate("/home/social", { replace: true });
      }
    } catch (err) {
      console.error("Login network error", err);
      setError("Network error. Please check the console for details.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
    setAuthView("login");
    navigate("/", { replace: true });
  }

  function handleSwitchView(nextView) {
    setError("");
    setAuthView(nextView);
  }

  if (checkingAuth) {
    return (
      <main className="shell shell--auth">
        <div className="card">
          <h1 className="logo">Patchwork</h1>
          <p className="loading">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`shell ${user ? "shell--home" : "shell--auth"}`}>
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              <Navigate to="/home/social" replace />
            ) : (
              <AuthCard
                authView={authView}
                error={error}
                loading={loading}
                onLogin={handleLogin}
                onSignup={handleSignup}
                onSwitchView={handleSwitchView}
              />
            )
          }
        />
        <Route
          element={
            <RequireAuth user={user}>
              <AuthedLayout user={user} onLogout={handleLogout} />
            </RequireAuth>
          }
        >
          <Route path="/home" element={<HomeLayout user={user} />}>
            <Route index element={<Navigate to="social" replace />} />
            <Route path="social" element={<SocialHome />} />
            <Route path="marketplace" element={<MarketplaceHome />} />
          </Route>
          <Route path="/userpage/:username" element={<UserPage />} />
          <Route path="/profile" element={<UserPage user={user} isOwnProfile />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? "/home/social" : "/"} replace />} />
      </Routes>
    </main>
  );
}

function RequireAuth({ user, children }) {
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AuthCard({ authView, error, loading, onLogin, onSignup, onSwitchView }) {
  return (
    <div className="card">
      <h1 className="logo">Patchwork</h1>

      <div className="tabs">
        <button
          className={authView === "login" ? "active" : ""}
          onClick={() => onSwitchView("login")}
          type="button"
        >
          Log in
        </button>
        <button
          className={authView === "signup" ? "active" : ""}
          onClick={() => onSwitchView("signup")}
          type="button"
        >
          Create account
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {authView === "signup" ? (
        <form className="form" onSubmit={onSignup}>
          <label>
            Name
            <input name="name" type="text" placeholder="Your name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" placeholder="you@example.com" required />
          </label>
          <label>
            Username
            <input name="username" type="text" placeholder="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="At least 8 characters" required minLength={8} />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
      ) : (
        <form className="form" onSubmit={onLogin}>
          <label>
            Email or username
            <input name="emailOrUsername" type="text" placeholder="you@example.com or username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="••••••••" required />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>
      )}
    </div>
  );
}

function AuthedLayout({ user, onLogout }) {
  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="side-title">Patchwork</div>
        <nav className="side-links" aria-label="Primary">
          <NavLink to="/home/social" className={({ isActive }) => (isActive ? "active" : "")}>Home</NavLink>
          <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
            My profile
          </NavLink>
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div>
            <div className="app-user">{user?.name || "Signed in"}</div>
            <div className="app-handle">@{user?.username || "user"}</div>
          </div>
          <button className="logout" onClick={onLogout} type="button">
            Log out
          </button>
        </header>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function HomeLayout({ user }) {
  return (
    <section className="home-layout">
      <header className="home-header">
        <div>
          <p className="home-kicker">Home</p>
          <h1 className="home-title">Your feeds</h1>
          <p className="home-subtitle">
            {user?.name ? `Welcome back, ${user.name}.` : "Welcome back."}
          </p>
        </div>
      </header>

      <nav className="home-switch" aria-label="Home sections">
        <NavLink to="social" className={({ isActive }) => (isActive ? "active" : "")}>Social</NavLink>
        <NavLink to="marketplace" className={({ isActive }) => (isActive ? "active" : "")}>
          Marketplace
        </NavLink>
      </nav>

      <div className="home-content">
        <Outlet />
      </div>
    </section>
  );
}

function SocialHome() {
  return (
    <section className="home-panel">
      <h2>Social posts</h2>
      <p className="home-description">This feed will show community posts and updates.</p>
      <div className="placeholder" aria-label="Social posts feed placeholder">
        <p>No social posts yet.</p>
      </div>
    </section>
  );
}

function MarketplaceHome() {
  return (
    <section className="home-panel">
      <h2>Marketplace posts</h2>
      <p className="home-description">This feed will surface listings, offers, and requests.</p>
      <div className="placeholder" aria-label="Marketplace posts feed placeholder">
        <p>No marketplace posts yet.</p>
      </div>
    </section>
  );
}

function UserPage({ user, isOwnProfile = false }) {
  const { username } = useParams();
  const displayName = isOwnProfile ? user?.name || "Your name" : "User name";
  const displayUsername = isOwnProfile ? user?.username || "your-username" : username || "username";

  return (
    <section className="user-page">
      <header className="user-header">
        <div>
          <h1 className="user-name">{displayName}</h1>
          <p className="user-handle">@{displayUsername}</p>
        </div>
        {isOwnProfile && (
          <button className="edit-profile" type="button">
            Change account info
          </button>
        )}
      </header>

      <div className="user-stats">
        <div className="stat">
          <span className="stat-value">0</span>
          <span className="stat-label">Followers</span>
        </div>
        <div className="stat">
          <span className="stat-value">0</span>
          <span className="stat-label">Following</span>
        </div>
        <div className="stat">
          <span className="stat-value">0</span>
          <span className="stat-label">Posts</span>
        </div>
      </div>

      <section className="user-posts" aria-label="Assigned posts">
        <h2 className="user-posts-title">Assigned posts</h2>
        <div className="placeholder">
          <p>No posts assigned yet.</p>
        </div>
      </section>
    </section>
  );
}

export default App;
