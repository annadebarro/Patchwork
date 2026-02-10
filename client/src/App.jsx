import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const MAX_SIZE_ENTRIES_PER_CATEGORY = 10;
const SIZE_CATEGORIES = [
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "dresses", label: "Dresses" },
  { key: "outerwear", label: "Outerwear" },
  { key: "shoes", label: "Shoes" },
];
const SEEDED_BRANDS = [
  "Nike",
  "Adidas",
  "Levi's",
  "Zara",
  "H&M",
  "Uniqlo",
  "Madewell",
  "Aritzia",
  "Lululemon",
  "Patagonia",
  "The North Face",
  "Carhartt",
  "New Balance",
  "Converse",
  "Doc Martens",
  "Reformation",
  "Everlane",
  "Urban Outfitters",
];

// Reference images for login collage
const collageImages = ["/ref2.jpg", "/ref1.jpg", "/ref4.jpg", "/ref3.jpg"];

// Sample feed posts
const samplePosts = [
  { id: 1, image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=500&fit=crop", forSale: true },
  { id: 2, image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=400&fit=crop", forSale: false },
  { id: 3, image: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400&h=600&fit=crop", forSale: true },
  { id: 4, image: "https://images.unsplash.com/photo-1475178626620-a4d074967452?w=400&h=450&fit=crop", forSale: false },
  { id: 5, image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=500&fit=crop", forSale: true },
  { id: 6, image: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&h=400&fit=crop", forSale: false },
  { id: 7, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=550&fit=crop", forSale: true },
  { id: 8, image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop", forSale: false },
];

function createEmptySizePreferences() {
  return {
    tops: [],
    bottoms: [],
    dresses: [],
    outerwear: [],
    shoes: [],
  };
}

function normalizeSizePreferences(rawSizePreferences) {
  const normalized = createEmptySizePreferences();
  if (!rawSizePreferences || typeof rawSizePreferences !== "object" || Array.isArray(rawSizePreferences)) {
    return normalized;
  }

  for (const category of SIZE_CATEGORIES) {
    const rawEntries = rawSizePreferences[category.key];
    if (!Array.isArray(rawEntries)) continue;

    normalized[category.key] = rawEntries
      .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => {
        const label = typeof entry.label === "string" ? entry.label.trim() : "";
        if (!label) return null;

        return {
          label,
          measurementName:
            typeof entry.measurementName === "string" ? entry.measurementName : "",
          measurementValue:
            entry.measurementValue !== undefined && entry.measurementValue !== null
              ? String(entry.measurementValue)
              : "",
          measurementUnit: entry.measurementUnit === "cm" ? "cm" : "in",
        };
      })
      .filter(Boolean);
  }

  return normalized;
}

function normalizeFavoriteBrands(rawBrands) {
  if (!Array.isArray(rawBrands)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const brand of rawBrands) {
    if (typeof brand !== "string") continue;
    const trimmed = brand.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }

  return cleaned;
}

function toSizePreferencesApiPayload(sizePreferences) {
  const payload = createEmptySizePreferences();

  for (const category of SIZE_CATEGORIES) {
    const rawEntries = Array.isArray(sizePreferences?.[category.key])
      ? sizePreferences[category.key]
      : [];

    payload[category.key] = rawEntries.slice(0, MAX_SIZE_ENTRIES_PER_CATEGORY)
      .map((entry) => {
        const label = typeof entry?.label === "string" ? entry.label.trim() : "";
        if (!label) return null;

        const normalizedEntry = { label };

        const measurementName =
          typeof entry.measurementName === "string" ? entry.measurementName.trim() : "";
        if (measurementName) normalizedEntry.measurementName = measurementName;

        const measurementValueRaw = entry.measurementValue;
        if (
          measurementValueRaw !== undefined &&
          measurementValueRaw !== null &&
          String(measurementValueRaw).trim() !== ""
        ) {
          const measurementValue = Number(measurementValueRaw);
          if (Number.isFinite(measurementValue) && measurementValue > 0) {
            normalizedEntry.measurementValue = measurementValue;
            normalizedEntry.measurementUnit = entry.measurementUnit === "cm" ? "cm" : "in";
          }
        }

        return normalizedEntry;
      })
      .filter(Boolean);
  }

  return payload;
}

async function parseApiResponse(res) {
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

function formatPrice(priceCents) {
  if (!Number.isFinite(priceCents)) return "";
  return `$${(priceCents / 100).toFixed(2)}`;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authView, setAuthView] = useState("login");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [postRefreshKey, setPostRefreshKey] = useState(0);

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

        const data = await parseApiResponse(res);
        if (res.ok && data?.user) {
          setUser(data.user);
          setShowOnboardingPrompt(Boolean(data.user.shouldShowOnboardingPrompt));
          setPromptError("");
        } else {
          localStorage.removeItem("token");
          setShowOnboardingPrompt(false);
        }
      } catch {
        localStorage.removeItem("token");
        setShowOnboardingPrompt(false);
      } finally {
        setCheckingAuth(false);
      }
    }

    fetchMe();
  }, []);

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

      const data = await parseApiResponse(res);
      if (!res.ok) {
        const message = data?.message || `Request failed (${res.status})`;
        setError(message);
        console.error("Signup failed", { url, status: res.status, statusText: res.statusText, data });
      } else {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        setShowOnboardingPrompt(false);
        setPromptError("");
        navigate("/onboarding/preferences", { replace: true });
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

      const data = await parseApiResponse(res);
      if (!res.ok) {
        const message = data?.message || `Request failed (${res.status})`;
        setError(message);
        console.error("Login failed", { url, status: res.status, statusText: res.statusText, data });
      } else {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        setShowOnboardingPrompt(Boolean(data.user?.shouldShowOnboardingPrompt));
        setPromptError("");
        navigate("/home", { replace: true });
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
    setShowOnboardingPrompt(false);
    setPromptError("");
    navigate("/", { replace: true });
  }

  function handleSwitchView(nextView) {
    setError("");
    setAuthView(nextView);
  }

  function handlePromptSetupNow() {
    setPromptError("");
    setShowOnboardingPrompt(false);
    navigate("/onboarding/preferences");
  }

  async function handlePromptSkip() {
    if (promptSaving) return;

    setPromptSaving(true);
    setPromptError("");

    const token = localStorage.getItem("token");
    if (!token) {
      setPromptSaving(false);
      setPromptError("You are no longer logged in.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "skip" }),
      });

      const data = await parseApiResponse(res);
      if (!res.ok) {
        const message = data?.message || `Request failed (${res.status})`;
        setPromptError(message);
      } else {
        setUser(data.user);
        setShowOnboardingPrompt(false);
      }
    } catch (err) {
      console.error("Skip onboarding prompt failed", err);
      setPromptError("Network error. Please try again.");
    } finally {
      setPromptSaving(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="loading-container">
        <div className="loading-card">
          <h1 className="logo">Patchwork</h1>
          <p className="loading">Loading...</p>
        </div>
      </div>
    );
  }

  const shouldRenderPrompt =
    Boolean(user) &&
    showOnboardingPrompt &&
    !location.pathname.startsWith("/onboarding");

  return (
    <main className={`shell ${user ? "shell--home" : "shell--auth"}`}>
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              <Navigate to="/home" replace />
            ) : (
              <AuthPage
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
          path="/onboarding/preferences"
          element={
            <RequireAuth user={user}>
              <OnboardingPreferencesPage
                user={user}
                onUpdateUser={setUser}
                onDismissPrompt={() => setShowOnboardingPrompt(false)}
              />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth user={user}>
              <AuthedLayout
                user={user}
                onLogout={handleLogout}
                onOpenCreatePost={() => setCreatePostOpen(true)}
              />
            </RequireAuth>
          }
        >
          <Route path="/home" element={<HomeLayout refreshKey={postRefreshKey} />} />
          <Route path="/post/:postId" element={<PostDetailPage currentUser={user} />} />
          <Route path="/messages" element={<MessagesPage currentUser={user} />} />
          <Route path="/userpage/:username" element={<UserPage currentUser={user} />} />
          <Route
            path="/profile"
            element={<UserPage user={user} isOwnProfile refreshKey={postRefreshKey} />}
          />
          <Route path="/settings" element={<AccountSettings user={user} onUpdateUser={setUser} />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? "/home" : "/"} replace />} />
      </Routes>

      {shouldRenderPrompt && (
        <OnboardingPrompt
          onSetupNow={handlePromptSetupNow}
          onSkip={handlePromptSkip}
          loading={promptSaving}
          error={promptError}
        />
      )}

      <CreatePostModal
        isOpen={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        onCreated={() => {
          setPostRefreshKey((prev) => prev + 1);
          setCreatePostOpen(false);
        }}
      />
    </main>
  );
}

function RequireAuth({ user, children }) {
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AuthPage({ authView, error, loading, onLogin, onSignup, onSwitchView }) {
  return (
    <div className="auth-container">
      <div className="auth-logo auth-logo--corner">
        <img className="auth-logo-icon" src="/logo1.jpg" alt="Patchwork logo" />
      </div>
      <div className="auth-left">
        <div className="photo-collage photo-collage--cycle">
          {collageImages.map((src, index) => (
            <figure key={src} className={`photo-card photo-card--${index + 1}`}>
              <img src={src} alt={`Fashion ${index + 1}`} />
            </figure>
          ))}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-panel">
          <h2 className="auth-title">
            {authView === "login" ? "Log into Patchwork" : "Create an account"}
          </h2>

          {error && <div className="error">{error}</div>}

          {authView === "signup" ? (
            <form className="form" onSubmit={onSignup}>
              <label>
                <input name="name" type="text" placeholder="name" required />
              </label>
              <label>
                <input name="email" type="email" placeholder="email" required />
              </label>
              <label>
                <input name="username" type="text" placeholder="username" required />
              </label>
              <label>
                <input name="password" type="password" placeholder="password" required minLength={8} />
              </label>
              <button type="submit" className="auth-primary" disabled={loading}>
                {loading ? "creating..." : "create account"}
              </button>
              <button
                type="button"
                className="switch-auth auth-secondary"
                onClick={() => onSwitchView("login")}
              >
                log in
              </button>
            </form>
          ) : (
            <form className="form" onSubmit={onLogin}>
              <label>
                <input
                  name="emailOrUsername"
                  type="text"
                  placeholder="username"
                  required
                />
              </label>
              <label>
                <input name="password" type="password" placeholder="password" required />
              </label>
              <button type="submit" className="auth-primary auth-primary--circle" disabled={loading}>
                {loading ? "..." : "log in"}
              </button>
              <button
                type="button"
                className="switch-auth auth-secondary"
                onClick={() => onSwitchView("signup")}
              >
                create an account
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingPrompt({ onSetupNow, onSkip, loading, error }) {
  return (
    <div className="onboarding-prompt-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding-prompt-card">
        <h2 className="onboarding-prompt-title">Complete your profile setup</h2>
        <p className="onboarding-prompt-text">
          Add your bio, fit preferences, and favorite brands now, or skip and do it later in
          settings.
        </p>

        {error && <div className="settings-message error">{error}</div>}

        <div className="onboarding-prompt-actions">
          <button type="button" className="save-button" onClick={onSetupNow} disabled={loading}>
            Set up now
          </button>
          <button type="button" className="cancel-button" onClick={onSkip} disabled={loading}>
            {loading ? "Skipping..." : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PatchLogo({ className }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Denim background */}
      <rect x="2" y="2" width="36" height="36" rx="4" fill="#4a6fa5" />
      {/* Darker denim section (right side) */}
      <path d="M24 2h12a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H24V2z" fill="#2c4a6e" />
      {/* Sun/circle */}
      <circle cx="14" cy="14" r="7" fill="#d4a03c" />
      {/* Moon crescent */}
      <circle cx="28" cy="26" r="6" fill="#a8c0d4" />
      <circle cx="30" cy="24" r="5" fill="#2c4a6e" />
      {/* Stitching border */}
      <rect x="4" y="4" width="32" height="32" rx="2" stroke="#8b4513" strokeWidth="2" strokeDasharray="3 2" fill="none" />
      {/* Zigzag stitch at bottom */}
      <path d="M6 34 l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2" stroke="#c4a35a" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function AuthedLayout({ user, onLogout, onOpenCreatePost }) {
  const navigate = useNavigate();
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
        setUnreadCount(data?.unreadCount || 0);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, 30000);
    return () => clearInterval(pollRef.current);
  }, [fetchNotifications]);

  async function openNotifPanel() {
    setNotifPanelOpen(true);
    if (unreadCount > 0) {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/notifications/read`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          setUnreadCount(0);
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        } catch {
          // silent
        }
      }
    }
  }

  function formatNotifMessage(notif) {
    const actor = notif.actor?.username || "Someone";
    switch (notif.type) {
      case "like":
        return `@${actor} liked your post`;
      case "comment":
        return `@${actor} commented on your post`;
      case "follow":
        return `@${actor} started following you`;
      case "patch":
        return `@${actor} saved your post to a quilt`;
      case "mention":
        return `@${actor} mentioned you in a comment`;
      case "comment_like":
        return `@${actor} liked your comment`;
      case "message":
        return `@${actor} sent you a message`;
      default:
        return `@${actor} interacted with you`;
    }
  }

  function formatTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  return (
    <div className="app-layout">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-profile">
          <PatchLogo className="patch-logo" />
        </div>
        <nav className="sidebar-nav">
          <NavLink
            to="/home"
            className={({ isActive }) => `sidebar-icon ${isActive ? "active" : ""}`}
            title="Home"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) => `sidebar-icon ${isActive ? "active" : ""}`}
            title="My profile"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </NavLink>
          <NavLink to="/messages" className={({ isActive }) => `sidebar-icon sidebar-icon--messages ${isActive ? "active" : ""}`} title="Messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </NavLink>
          <button
            className={`sidebar-icon sidebar-icon--notif ${notifPanelOpen ? "active" : ""}`}
            title="Notifications"
            type="button"
            onClick={() => notifPanelOpen ? setNotifPanelOpen(false) : openNotifPanel()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
            )}
          </button>
          <button
            className="sidebar-icon"
            title="Create Post"
            type="button"
            onClick={onOpenCreatePost}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </nav>
        <button className="sidebar-logout" onClick={onLogout} type="button">
          Log out
        </button>
      </aside>

      {/* Notification Panel */}
      {notifPanelOpen && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <h3>Notifications</h3>
            <button
              type="button"
              className="notif-panel-close"
              onClick={() => setNotifPanelOpen(false)}
            >
              &times;
            </button>
          </div>
          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <p className="notif-empty">No notifications yet.</p>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  className={`notif-item ${!notif.read ? "notif-item--unread" : ""}`}
                  onClick={() => {
                    setNotifPanelOpen(false);
                    if (notif.type === "follow") {
                      navigate(`/userpage/${notif.actor?.username}`);
                    } else if (notif.postId) {
                      navigate(`/post/${notif.postId}`);
                    }
                  }}
                >
                  <div className="notif-item-avatar">
                    <ProfilePatch
                      name={notif.actor?.name}
                      imageUrl={notif.actor?.profilePicture}
                    />
                  </div>
                  <div className="notif-item-content">
                    <p className="notif-item-text">{formatNotifMessage(notif)}</p>
                    <span className="notif-item-time">{formatTimeAgo(notif.createdAt)}</span>
                  </div>
                  {notif.post?.imageUrl && (
                    <img
                      className="notif-item-thumb"
                      src={notif.post.imageUrl}
                      alt=""
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        {/* Top Bar */}
        <header className="top-bar">
          <div className="search-bar">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Search" />
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  );
}

function HomeLayout({ refreshKey }) {
  const [filters, setFilters] = useState({ social: true, marketplace: true });

  function toggleFilter(key) {
    setFilters((prev) => {
      const other = key === "social" ? "marketplace" : "social";
      if (prev[key] && !prev[other]) return prev;
      return { ...prev, [key]: !prev[key] };
    });
  }

  const type = filters.social && filters.marketplace
    ? null
    : filters.social
      ? "regular"
      : "market";

  return (
    <>
      <nav className="feed-tabs">
        <button
          type="button"
          className={`feed-tab ${filters.social ? "active" : ""}`}
          onClick={() => toggleFilter("social")}
        >
          Social
        </button>
        <button
          type="button"
          className={`feed-tab ${filters.marketplace ? "active" : ""}`}
          onClick={() => toggleFilter("marketplace")}
        >
          Marketplace
        </button>
      </nav>
      <div className="feed-content">
        <PostsGrid type={type} refreshKey={refreshKey} />
      </div>
    </>
  );
}

function PostsGrid({ type, refreshKey }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchPosts() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        const res = await fetch(`${API_BASE_URL}/posts?${params.toString()}`);
        const data = await parseApiResponse(res);
        if (!res.ok) {
          const message = data?.message || `Failed to load posts (${res.status})`;
          if (isMounted) setError(message);
        } else if (isMounted) {
          setPosts(Array.isArray(data?.posts) ? data.posts : []);
        }
      } catch (err) {
        if (isMounted) setError("Network error while loading posts.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPosts();

    return () => {
      isMounted = false;
    };
  }, [type, refreshKey]);

  if (loading) {
    return <div className="feed-empty">Loading posts...</div>;
  }

  if (error) {
    return <div className="feed-empty">{error}</div>;
  }

  if (!posts.length) {
    return <div className="feed-empty">No posts yet.</div>;
  }

  return (
    <div className="masonry-grid">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function PostCard({ post, imageOnly }) {
  const navigate = useNavigate();
  const isMarket = post.type === "market";
  const priceLabel = isMarket && post.priceCents !== null ? formatPrice(post.priceCents) : "";
  const caption = typeof post.caption === "string" ? post.caption : "";
  const authorUsername = post.author?.username;
  const isSold = Boolean(post.isSold);

  if (imageOnly) {
    return (
      <div
        className="post-card post-card--image-only"
        onClick={() => navigate(`/post/${post.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(`/post/${post.id}`);
        }}
      >
        <img src={post.imageUrl} alt="Post" />
      </div>
    );
  }

  return (
    <div
      className={`post-card post-card--clickable${isSold ? " post-card--sold" : ""}`}
      onClick={() => navigate(`/post/${post.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/post/${post.id}`);
      }}
    >
      <img src={post.imageUrl} alt={caption || "Post"} />
      {isSold && <div className="sold-badge">SOLD</div>}
      {isMarket && !isSold && (
        <div className="sale-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
      )}
      <div className="post-meta">
        {authorUsername && (
          <p className="post-author">@{authorUsername}</p>
        )}
        {caption && <p className="post-caption">{caption}</p>}
        {priceLabel && <p className="post-price">{priceLabel}</p>}
      </div>
    </div>
  );
}

function CreatePostModal({ isOpen, onClose, onCreated }) {
  const [type, setType] = useState("regular");
  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setType("regular");
      setCaption("");
      setPrice("");
      setImageFile(null);
      setPreviewUrl("");
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setPreviewUrl("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!imageFile) {
      setError("Please select an image to upload.");
      return;
    }

    if (type === "market") {
      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        setError("Please enter a valid dollar amount.");
        return;
      }
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please log in again.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("folder", "posts");

      const uploadRes = await fetch(`${API_BASE_URL}/uploads`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await parseApiResponse(uploadRes);
      if (!uploadRes.ok) {
        const message = uploadData?.error || uploadData?.message || `Upload failed (${uploadRes.status})`;
        setError(message);
        return;
      }

      const imageUrl = uploadData?.publicUrl;
      if (!imageUrl) {
        setError("Upload succeeded but no public URL was returned.");
        return;
      }

      const payload = {
        type,
        caption: caption.trim(),
        imageUrl,
      };

      if (type === "market") {
        payload.priceCents = Math.round(Number(price) * 100);
      }

      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await parseApiResponse(res);
      if (!res.ok) {
        const message = data?.message || `Create failed (${res.status})`;
        setError(message);
        return;
      }

      if (typeof onCreated === "function") {
        onCreated(data?.post);
      }
    } catch (err) {
      setError("Network error while creating the post.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="create-post-overlay" role="dialog" aria-modal="true">
      <div className="create-post-modal">
        <div className="create-post-header">
          <h2>Create a post</h2>
          <button type="button" className="create-post-close" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <form className="create-post-form" onSubmit={handleSubmit}>
          <label>
            Post type
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="regular">Regular</option>
              <option value="market">Marketplace</option>
            </select>
          </label>

          <label>
            Caption
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Write something about your post"
              rows={3}
            />
          </label>

          {type === "market" && (
            <label>
              Price (USD)
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0"
              />
            </label>
          )}

          <label>
            Image
            <input type="file" accept="image/*" onChange={handleFileChange} />
          </label>

          {previewUrl && (
            <div className="create-post-preview">
              <img src={previewUrl} alt="Preview" />
            </div>
          )}

          <button type="submit" className="save-button" disabled={submitting}>
            {submitting ? "Uploading..." : "Share post"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ProfilePatch({ name, imageUrl }) {
  const initial = name?.charAt(0).toUpperCase() || "?";
  return (
    <div className="profile-patch">
      <div className="profile-patch-inner">
        {imageUrl ? (
          <img src={imageUrl} alt={name || "Profile"} className="profile-patch-img" />
        ) : (
          <span className="profile-patch-initial">{initial}</span>
        )}
      </div>
    </div>
  );
}

function UserPage({ user, isOwnProfile = false, refreshKey = 0, currentUser }) {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profileUser, setProfileUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState("");
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followListType, setFollowListType] = useState(null);
  const [activeTab, setActiveTab] = useState("everything");
  const [quilts, setQuilts] = useState([]);
  const [selectedQuiltId, setSelectedQuiltId] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setPostsLoading(true);
      setPostsError("");

      try {
        if (isOwnProfile) {
          const token = localStorage.getItem("token");
          const [postsRes, profileRes] = await Promise.all([
            fetch(`${API_BASE_URL}/posts/mine`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            user?.username
              ? fetch(`${API_BASE_URL}/users/${encodeURIComponent(user.username)}`, {
                  headers: { Authorization: `Bearer ${token}` },
                })
              : null,
          ]);

          const postsData = await parseApiResponse(postsRes);
          if (!postsRes.ok) {
            if (isMounted) setPostsError(postsData?.message || `Failed to load posts (${postsRes.status})`);
          } else if (isMounted) {
            setPosts(Array.isArray(postsData?.posts) ? postsData.posts : []);
          }

          if (profileRes) {
            const profileData = await parseApiResponse(profileRes);
            if (profileRes.ok && isMounted) {
              setFollowerCount(profileData.user?.followerCount || 0);
              setFollowingCount(profileData.user?.followingCount || 0);
              setQuilts(Array.isArray(profileData?.quilts) ? profileData.quilts : []);
            }
          }
        } else if (username) {
          const token = localStorage.getItem("token");
          const headers = {};
          if (token) headers.Authorization = `Bearer ${token}`;

          const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(username)}`, { headers });
          const data = await parseApiResponse(res);
          if (!res.ok) {
            if (isMounted) setPostsError(data?.message || "User not found.");
          } else if (isMounted) {
            setProfileUser(data.user);
            setPosts(Array.isArray(data?.posts) ? data.posts : []);
            setFollowerCount(data.user?.followerCount || 0);
            setFollowingCount(data.user?.followingCount || 0);
            setIsFollowing(Boolean(data.isFollowing));
            setQuilts(Array.isArray(data?.quilts) ? data.quilts : []);
          }
        }
      } catch (err) {
        if (isMounted) setPostsError("Network error while loading profile.");
      } finally {
        if (isMounted) setPostsLoading(false);
      }
    }

    fetchData();
    return () => { isMounted = false; };
  }, [isOwnProfile, username, refreshKey, user?.username]);

  async function toggleFollow() {
    if (followBusy || !profileUser) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setFollowBusy(true);
    const method = isFollowing ? "DELETE" : "POST";
    try {
      const res = await fetch(`${API_BASE_URL}/follows/${profileUser.id}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setIsFollowing(data.following);
        setFollowerCount(data.followerCount);
      }
    } catch (err) {
      console.error("Follow toggle failed:", err);
    } finally {
      setFollowBusy(false);
    }
  }

  const displayUser = isOwnProfile ? user : profileUser;
  const displayName = displayUser?.name || (isOwnProfile ? "Your name" : username || "User");
  const displayUsername = displayUser?.username || username || "username";
  const displayBio = displayUser?.bio || "";
  const showFollowButton = !isOwnProfile && profileUser && currentUser && currentUser.id !== profileUser.id;

  return (
    <div className="feed-content">
      <section className="user-page">
        {!isOwnProfile && (
          <button
            className="back-button"
            type="button"
            onClick={() => navigate(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}
        <header className="user-header">
          <ProfilePatch name={displayName} imageUrl={displayUser?.profilePicture} />
          <div className="user-header-info">
            <h1 className="user-name">{displayName}</h1>
            <p className="user-handle">@{displayUsername}</p>
          </div>
          {isOwnProfile && (
            <button
              className="edit-profile"
              type="button"
              onClick={() => navigate("/settings")}
            >
              Edit profile
            </button>
          )}
          {showFollowButton && (
            <button
              className={`follow-button ${isFollowing ? "follow-button--following" : ""}`}
              type="button"
              onClick={toggleFollow}
              disabled={followBusy}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </header>

        <div className="user-stats">
          <button className="stat" type="button" onClick={() => setFollowListType("followers")}>
            <span className="stat-value">{followerCount}</span>
            <span className="stat-label">Followers</span>
          </button>
          <button className="stat" type="button" onClick={() => setFollowListType("following")}>
            <span className="stat-value">{followingCount}</span>
            <span className="stat-label">Following</span>
          </button>
        </div>

        <div className="user-bio">
          {displayBio ? (
            <p className="user-bio-text">{displayBio}</p>
          ) : (
            <p className="user-bio-empty">No bio yet</p>
          )}
        </div>

        <nav className="profile-tabs">
          {[
            { key: "everything", title: "Everything", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            )},
            { key: "marketplace", title: "Marketplace", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            )},
            { key: "quilts", title: "Quilts", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="1" />
                <path d="M4 8h-1.5M4 12h-1.5M4 16h-1.5M20 8h1.5M20 12h1.5M20 16h1.5M8 4v-1.5M12 4v-1.5M16 4v-1.5M8 20v1.5M12 20v1.5M16 20v1.5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )},
            { key: "ratings", title: "Ratings", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )},
          ].map((tab, i) => (
            <button
              key={tab.key}
              type="button"
              title={tab.title}
              className={`profile-tab${activeTab === tab.key ? " active" : ""}`}
              style={{ transform: `rotate(${i % 2 === 0 ? -1 : 1.5}deg)` }}
              onClick={() => { setActiveTab(tab.key); setSelectedQuiltId(null); }}
            >
              {tab.icon}
            </button>
          ))}
        </nav>

        <section className="user-posts" aria-label="User posts">
          {postsLoading ? (
            <div className="placeholder">
              <p>Loading posts...</p>
            </div>
          ) : postsError ? (
            <div className="placeholder">
              <p>{postsError}</p>
            </div>
          ) : activeTab === "everything" ? (
            posts.length ? (
              <div className="masonry-grid">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} imageOnly />
                ))}
              </div>
            ) : (
              <div className="placeholder"><p>No posts yet.</p></div>
            )
          ) : activeTab === "marketplace" ? (
            (() => {
              const marketPosts = posts.filter((p) => p.type === "market");
              return marketPosts.length ? (
                <div className="masonry-grid">
                  {marketPosts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <div className="placeholder"><p>No marketplace posts yet.</p></div>
              );
            })()
          ) : activeTab === "quilts" ? (
            selectedQuiltId ? (
              <QuiltDetailView
                quiltId={selectedQuiltId}
                isOwner={isOwnProfile}
                onBack={() => setSelectedQuiltId(null)}
              />
            ) : (
              <QuiltListView quilts={quilts} onSelectQuilt={setSelectedQuiltId} isOwnProfile={isOwnProfile} />
            )
          ) : activeTab === "ratings" ? (
            <div className="placeholder"><p>Ratings coming soon...</p></div>
          ) : null}
        </section>
      </section>

      {followListType && (
        <FollowListModal
          userId={(isOwnProfile ? user : profileUser)?.id}
          type={followListType}
          currentUserId={(isOwnProfile ? user : currentUser)?.id}
          onClose={() => setFollowListType(null)}
          onCountChange={(delta) => {
            if (followListType === "followers") {
              setFollowerCount((c) => c + delta);
            } else {
              setFollowingCount((c) => c + delta);
            }
          }}
        />
      )}
    </div>
  );
}

function GrannySquareGrid({ images, mini, isOwner, onRemove, removingId, onClickPatch }) {
  const navigate = useNavigate();
  const items = mini
    ? (images || []).slice(0, 9).map((url, i) => ({ postId: i, imageUrl: url }))
    : images || [];

  if (!items.length) {
    return <div className="placeholder"><p>No patches yet.</p></div>;
  }

  const cols = mini ? Math.min(items.length, 3) : undefined;

  return (
    <div
      className={`granny-grid ${mini ? "granny-grid--mini" : "granny-grid--full"}`}
      style={mini ? { "--granny-cols": cols } : undefined}
    >
      <div className="granny-grid-inner">
        {items.map((item) => (
          <div
            key={mini ? item.postId : item.postId}
            className="granny-square"
          >
            <div
              className="granny-square-inner"
              onClick={() => {
                if (mini) return;
                if (onClickPatch) onClickPatch(item.postId);
                else navigate(`/post/${item.postId}`);
              }}
              style={mini ? undefined : { cursor: "pointer" }}
            >
              <img src={item.imageUrl} alt="" />
              {!mini && isOwner && (
                <button
                  type="button"
                  className="granny-square-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRemove) onRemove(item.postId);
                  }}
                  disabled={removingId === item.postId}
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuiltListView({ quilts, onSelectQuilt, isOwnProfile }) {
  const displayQuilts = isOwnProfile ? quilts : quilts.filter((q) => q.isPublic);

  if (!displayQuilts.length) {
    return <div className="placeholder"><p>No quilts yet.</p></div>;
  }

  return (
    <div className="quilt-list">
      {displayQuilts.map((quilt) => (
        <button
          key={quilt.id}
          type="button"
          className="quilt-list-card"
          onClick={() => onSelectQuilt(quilt.id)}
        >
          <div className="quilt-list-preview">
            <GrannySquareGrid images={quilt.previewImages} mini />
          </div>
          <div className="quilt-list-info">
            <h3 className="quilt-list-name">
              {quilt.isPublic ? (
                <svg className="quilt-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              ) : (
                <svg className="quilt-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
              {quilt.name}
            </h3>
            <span className="quilt-list-count">
              {quilt.patchCount} {quilt.patchCount === 1 ? "patch" : "patches"}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function QuiltDetailView({ quiltId, isOwner, onBack }) {
  const navigate = useNavigate();
  const [quilt, setQuilt] = useState(null);
  const [patches, setPatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchQuilt() {
      setLoading(true);
      const token = localStorage.getItem("token");
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      try {
        const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}`, { headers });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setQuilt(data.quilt);
          setPatches(
            (data.quilt?.patches || []).map((p) => ({
              postId: p.post?.id || p.postId,
              imageUrl: p.post?.imageUrl,
            })).filter((p) => p.imageUrl)
          );
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchQuilt();
    return () => { isMounted = false; };
  }, [quiltId]);

  async function removePatch(postId) {
    const token = localStorage.getItem("token");
    if (!token) return;
    setRemovingId(postId);
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}/patches/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPatches((prev) => prev.filter((p) => p.postId !== postId));
      }
    } catch {
      // silent
    } finally {
      setRemovingId(null);
    }
  }

  async function saveEdit(fields) {
    const token = localStorage.getItem("token");
    if (!token) return;
    setEditSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fields),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setQuilt(data.quilt);
        setEditingName(false);
        setEditingDesc(false);
      }
    } catch {
      // silent
    } finally {
      setEditSaving(false);
    }
  }

  async function togglePrivacy() {
    if (!quilt) return;
    await saveEdit({ isPublic: !quilt.isPublic });
  }

  async function deleteQuilt() {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        onBack();
      }
    } catch {
      // silent
    }
  }

  if (loading) {
    return <div className="placeholder"><p>Loading quilt...</p></div>;
  }

  return (
    <div className="quilt-detail">
      <button type="button" className="back-button" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        All quilts
      </button>
      {quilt && (
        <>
          <div className="quilt-detail-header">
            {editingName ? (
              <div className="quilt-edit-inline">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  className="quilt-edit-input"
                />
                <button
                  type="button"
                  className="save-button save-button--sm"
                  onClick={() => saveEdit({ name: editName })}
                  disabled={editSaving || !editName.trim()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="cancel-button cancel-button--sm"
                  onClick={() => setEditingName(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2 className="quilt-detail-name">
                {quilt.name}
                {isOwner && (
                  <button
                    type="button"
                    className="quilt-edit-btn"
                    onClick={() => { setEditName(quilt.name); setEditingName(true); }}
                    title="Edit name"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </h2>
            )}

            {isOwner && (
              <div className="quilt-detail-controls">
                <button
                  type="button"
                  className={`quilt-privacy-toggle ${quilt.isPublic ? "quilt-privacy-toggle--public" : ""}`}
                  onClick={togglePrivacy}
                  disabled={editSaving}
                >
                  {quilt.isPublic ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      Public
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Private
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {editingDesc ? (
            <div className="quilt-edit-inline">
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="quilt-edit-input"
                rows={2}
              />
              <button
                type="button"
                className="save-button save-button--sm"
                onClick={() => saveEdit({ description: editDesc })}
                disabled={editSaving}
              >
                Save
              </button>
              <button
                type="button"
                className="cancel-button cancel-button--sm"
                onClick={() => setEditingDesc(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            quilt.description ? (
              <p className="quilt-detail-desc" onClick={() => { if (isOwner) { setEditDesc(quilt.description); setEditingDesc(true); } }}>
                {quilt.description}
                {isOwner && <span className="quilt-edit-hint"> (click to edit)</span>}
              </p>
            ) : isOwner ? (
              <p className="quilt-detail-desc quilt-detail-desc--empty" onClick={() => { setEditDesc(""); setEditingDesc(true); }}>
                Add a description...
              </p>
            ) : null
          )}

          {isOwner && (
            <div className="quilt-danger-zone">
              {deleteConfirm ? (
                <div className="quilt-delete-confirm">
                  <span>Delete this quilt?</span>
                  <button type="button" className="cancel-button cancel-button--sm" onClick={deleteQuilt}>
                    Yes, delete
                  </button>
                  <button type="button" className="save-button save-button--sm" onClick={() => setDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="quilt-delete-btn"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete quilt
                </button>
              )}
            </div>
          )}
        </>
      )}
      <GrannySquareGrid
        images={patches}
        isOwner={isOwner}
        onRemove={removePatch}
        removingId={removingId}
        onClickPatch={(postId) => navigate(`/post/${postId}`)}
      />
    </div>
  );
}

function FollowListModal({ userId, type, currentUserId, onClose, onCountChange }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    async function fetchList() {
      setLoading(true);
      const token = localStorage.getItem("token");
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      try {
        const res = await fetch(`${API_BASE_URL}/follows/${userId}/${type}`, { headers });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setUsers(Array.isArray(data?.users) ? data.users : []);
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchList();
    return () => { isMounted = false; };
  }, [userId, type]);

  async function toggleFollow(targetUserId, currentlyFollowing) {
    const token = localStorage.getItem("token");
    if (!token) return;

    const method = currentlyFollowing ? "DELETE" : "POST";
    try {
      const res = await fetch(`${API_BASE_URL}/follows/${targetUserId}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUserId ? { ...u, isFollowing: !currentlyFollowing } : u
          )
        );
        if (onCountChange) {
          onCountChange(currentlyFollowing ? -1 : 1);
        }
      }
    } catch (err) {
      console.error("Follow toggle failed:", err);
    }
  }

  const title = type === "followers" ? "Followers" : "Following";

  return (
    <div className="create-post-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="follow-list-modal" onClick={(e) => e.stopPropagation()}>
        <div className="create-post-header">
          <h2>{title}</h2>
          <button type="button" className="create-post-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="follow-list-body">
          {loading ? (
            <p className="comment-empty">Loading...</p>
          ) : users.length === 0 ? (
            <p className="comment-empty">No {type} yet.</p>
          ) : (
            users.map((u) => (
              <div key={u.id} className="follow-list-item">
                <button
                  type="button"
                  className="follow-list-item-link"
                  onClick={() => {
                    onClose();
                    navigate(`/userpage/${u.username}`);
                  }}
                >
                  <ProfilePatch name={u.name} imageUrl={u.profilePicture} />
                  <div className="follow-list-item-info">
                    <span className="follow-list-item-name">{u.name}</span>
                    <span className="follow-list-item-handle">@{u.username}</span>
                  </div>
                </button>
                {currentUserId && currentUserId !== u.id && (
                  <button
                    type="button"
                    className={`follow-button follow-button--sm ${u.isFollowing ? "follow-button--following" : ""}`}
                    onClick={() => toggleFollow(u.id, u.isFollowing)}
                  >
                    {u.isFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SizePreferencesEditor({ sizePreferences, setSizePreferences }) {
  function updateEntry(categoryKey, index, field, value) {
    setSizePreferences((prev) => {
      const existing = Array.isArray(prev[categoryKey]) ? prev[categoryKey] : [];
      const nextEntries = [...existing];
      nextEntries[index] = {
        ...nextEntries[index],
        [field]: value,
      };

      return {
        ...prev,
        [categoryKey]: nextEntries,
      };
    });
  }

  function addEntry(categoryKey) {
    setSizePreferences((prev) => {
      const existing = Array.isArray(prev[categoryKey]) ? prev[categoryKey] : [];
      if (existing.length >= MAX_SIZE_ENTRIES_PER_CATEGORY) return prev;

      return {
        ...prev,
        [categoryKey]: [
          ...existing,
          {
            label: "",
            measurementName: "",
            measurementValue: "",
            measurementUnit: "in",
          },
        ],
      };
    });
  }

  function removeEntry(categoryKey, index) {
    setSizePreferences((prev) => {
      const existing = Array.isArray(prev[categoryKey]) ? prev[categoryKey] : [];
      return {
        ...prev,
        [categoryKey]: existing.filter((_, entryIndex) => entryIndex !== index),
      };
    });
  }

  return (
    <div className="size-preferences-grid">
      {SIZE_CATEGORIES.map((category) => {
        const entries = Array.isArray(sizePreferences[category.key])
          ? sizePreferences[category.key]
          : [];

        return (
          <div key={category.key} className="size-category-card">
            <div className="size-category-header">
              <h3>{category.label}</h3>
              <button
                type="button"
                className="size-add"
                onClick={() => addEntry(category.key)}
                disabled={entries.length >= MAX_SIZE_ENTRIES_PER_CATEGORY}
              >
                Add size
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="size-category-empty">No sizes added yet.</p>
            ) : (
              entries.map((entry, index) => (
                <div key={`${category.key}-${index}`} className="size-entry-row">
                  <label className="settings-label">
                    <span>Size label</span>
                    <input
                      type="text"
                      value={entry.label}
                      onChange={(event) =>
                        updateEntry(category.key, index, "label", event.target.value)
                      }
                      placeholder="S, M, 8, 30x32"
                    />
                  </label>

                  <label className="settings-label">
                    <span>Measurement name (optional)</span>
                    <input
                      type="text"
                      value={entry.measurementName}
                      onChange={(event) =>
                        updateEntry(category.key, index, "measurementName", event.target.value)
                      }
                      placeholder="Chest, waist, inseam"
                    />
                  </label>

                  <div className="size-measurement-fields">
                    <label className="settings-label">
                      <span>Measurement value</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={entry.measurementValue}
                        onChange={(event) =>
                          updateEntry(category.key, index, "measurementValue", event.target.value)
                        }
                        placeholder="38"
                      />
                    </label>

                    <label className="settings-label">
                      <span>Unit</span>
                      <select
                        value={entry.measurementUnit || "in"}
                        onChange={(event) =>
                          updateEntry(category.key, index, "measurementUnit", event.target.value)
                        }
                      >
                        <option value="in">in</option>
                        <option value="cm">cm</option>
                      </select>
                    </label>
                  </div>

                  <button
                    type="button"
                    className="size-remove"
                    onClick={() => removeEntry(category.key, index)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function BrandPreferencesEditor({
  favoriteBrands,
  setFavoriteBrands,
  customBrand,
  setCustomBrand,
}) {
  const selectedBrandSet = useMemo(
    () => new Set(favoriteBrands.map((brand) => brand.toLowerCase())),
    [favoriteBrands]
  );

  function toggleSeededBrand(brand) {
    const key = brand.toLowerCase();

    setFavoriteBrands((prev) => {
      if (prev.some((item) => item.toLowerCase() === key)) {
        return prev.filter((item) => item.toLowerCase() !== key);
      }
      return normalizeFavoriteBrands([...prev, brand]);
    });
  }

  function addCustomBrand() {
    const trimmed = customBrand.trim();
    if (!trimmed) return;

    setFavoriteBrands((prev) => normalizeFavoriteBrands([...prev, trimmed]));
    setCustomBrand("");
  }

  function removeBrand(brandToRemove) {
    const key = brandToRemove.toLowerCase();
    setFavoriteBrands((prev) => prev.filter((brand) => brand.toLowerCase() !== key));
  }

  return (
    <div className="brand-survey">
      <div className="brand-chip-grid">
        {SEEDED_BRANDS.map((brand) => {
          const selected = selectedBrandSet.has(brand.toLowerCase());
          return (
            <button
              key={brand}
              type="button"
              className={`brand-chip ${selected ? "selected" : ""}`}
              onClick={() => toggleSeededBrand(brand)}
            >
              {brand}
            </button>
          );
        })}
      </div>

      <div className="brand-custom-row">
        <input
          type="text"
          value={customBrand}
          onChange={(event) => setCustomBrand(event.target.value)}
          placeholder="Add custom brand"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustomBrand();
            }
          }}
        />
        <button type="button" className="size-add" onClick={addCustomBrand}>
          Add
        </button>
      </div>

      {favoriteBrands.length > 0 ? (
        <div className="brand-selected-list">
          {favoriteBrands.map((brand) => (
            <span key={brand} className="brand-selected-item">
              {brand}
              <button type="button" onClick={() => removeBrand(brand)}>
                remove
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="size-category-empty">No favorite brands selected.</p>
      )}
    </div>
  );
}

function OnboardingPreferencesPage({ user, onUpdateUser, onDismissPrompt }) {
  const navigate = useNavigate();
  const [bio, setBio] = useState(user?.bio || "");
  const [sizePreferences, setSizePreferences] = useState(() =>
    normalizeSizePreferences(user?.sizePreferences)
  );
  const [favoriteBrands, setFavoriteBrands] = useState(() =>
    normalizeFavoriteBrands(user?.favoriteBrands)
  );
  const [customBrand, setCustomBrand] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setBio(user?.bio || "");
    setSizePreferences(normalizeSizePreferences(user?.sizePreferences));
    setFavoriteBrands(normalizeFavoriteBrands(user?.favoriteBrands));
    setCustomBrand("");
  }, [user]);

  async function submitOnboarding(action) {
    setMessage("");
    setSaving(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setSaving(false);
      setMessage("You are no longer logged in.");
      return;
    }

    const payload =
      action === "complete"
        ? {
            action,
            bio,
            sizePreferences: toSizePreferencesApiPayload(sizePreferences),
            favoriteBrands: normalizeFavoriteBrands(favoriteBrands),
          }
        : { action };

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await parseApiResponse(res);
      if (!res.ok) {
        setMessage(data?.message || "Failed to save onboarding preferences.");
      } else {
        onUpdateUser(data.user);
        onDismissPrompt();
        navigate("/home", { replace: true });
      }
    } catch (err) {
      console.error("Onboarding submit failed", err);
      setMessage("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleComplete(event) {
    event.preventDefault();
    submitOnboarding("complete");
  }

  return (
    <div className="onboarding-shell">
      <section className="onboarding-page">
        <header className="settings-header">
          <h1 className="settings-title">Finish your profile setup</h1>
          <p className="onboarding-subtitle">
            Add as much or as little as you want. You can always update this later in settings.
          </p>
        </header>

        <form className="onboarding-form" onSubmit={handleComplete}>
          {message && (
            <div className={`settings-message ${message.includes("success") ? "success" : "error"}`}>
              {message}
            </div>
          )}

          <div className="settings-section">
            <h2 className="settings-section-title">Bio</h2>
            <label className="settings-label">
              <span>Tell people about your style (optional)</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Vintage denim collector, minimalist wardrobe, etc."
                rows={4}
              />
            </label>
          </div>

          <div className="settings-section">
            <h2 className="settings-section-title">Fit preferences</h2>
            <p className="field-note">
              Private to your account. Used for future personalized search and recommendations.
            </p>
            <SizePreferencesEditor
              sizePreferences={sizePreferences}
              setSizePreferences={setSizePreferences}
            />
          </div>

          <div className="settings-section">
            <h2 className="settings-section-title">Favorite brands (optional)</h2>
            <BrandPreferencesEditor
              favoriteBrands={favoriteBrands}
              setFavoriteBrands={setFavoriteBrands}
              customBrand={customBrand}
              setCustomBrand={setCustomBrand}
            />
          </div>

          <div className="settings-actions onboarding-actions">
            <button type="submit" className="save-button" disabled={saving}>
              {saving ? "Saving..." : "Save and continue"}
            </button>
            <button
              type="button"
              className="cancel-button"
              onClick={() => submitOnboarding("skip")}
              disabled={saving}
            >
              Skip for now
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AccountSettings({ user, onUpdateUser }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: user?.name || "",
    username: user?.username || "",
    bio: user?.bio || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [sizePreferences, setSizePreferences] = useState(() =>
    normalizeSizePreferences(user?.sizePreferences)
  );
  const [favoriteBrands, setFavoriteBrands] = useState(() =>
    normalizeFavoriteBrands(user?.favoriteBrands)
  );
  const [customBrand, setCustomBrand] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(user?.profilePicture || null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setFormData({
      name: user?.name || "",
      username: user?.username || "",
      bio: user?.bio || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setSizePreferences(normalizeSizePreferences(user?.sizePreferences));
    setFavoriteBrands(normalizeFavoriteBrands(user?.favoriteBrands));
    setCustomBrand("");
    setAvatarFile(null);
    setPreviewUrl(user?.profilePicture || null);
  }, [user]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (file) {
      setAvatarFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setMessage("New passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");

      let profilePictureUrl;
      if (avatarFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", avatarFile);
        uploadForm.append("folder", "avatars");

        const uploadRes = await fetch(`${API_BASE_URL}/uploads`, {
          method: "POST",
          body: uploadForm,
        });
        const uploadData = await parseApiResponse(uploadRes);
        if (!uploadRes.ok) {
          setMessage(uploadData?.error || uploadData?.message || "Image upload failed.");
          setSaving(false);
          return;
        }
        profilePictureUrl = uploadData?.publicUrl;
        if (!profilePictureUrl) {
          setMessage("Upload succeeded but no public URL was returned.");
          setSaving(false);
          return;
        }
      }

      const patchBody = {
        name: formData.name,
        username: formData.username,
        bio: formData.bio,
        sizePreferences: toSizePreferencesApiPayload(sizePreferences),
        favoriteBrands: normalizeFavoriteBrands(favoriteBrands),
      };
      if (profilePictureUrl) {
        patchBody.profilePicture = profilePictureUrl;
      }

      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patchBody),
      });

      const data = await parseApiResponse(res);
      if (!res.ok) {
        setMessage(data?.message || "Failed to save changes");
      } else {
        onUpdateUser(data.user);
        setAvatarFile(null);
        setPreviewUrl(data.user.profilePicture || null);
        setMessage("Changes saved successfully!");
      }
    } catch (err) {
      console.error("Update profile error", err);
      setMessage("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="feed-content">
      <section className="settings-page">
        <header className="settings-header">
          <button
            className="back-button"
            type="button"
            onClick={() => navigate("/profile")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to profile
          </button>
          <h1 className="settings-title">Change account info</h1>
        </header>

        <form className="settings-form" onSubmit={handleSubmit}>
          {message && (
            <div className={`settings-message ${message.includes("success") ? "success" : "error"}`}>
              {message}
            </div>
          )}

          {/* Profile Picture */}
          <div className="settings-section">
            <h2 className="settings-section-title">Profile picture</h2>
            <div className="profile-picture-upload">
              <div className="profile-patch profile-patch--large">
                <div className="profile-patch-inner">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Profile preview" className="profile-preview-img" />
                  ) : (
                    <span className="profile-patch-initial">
                      {formData.name?.charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                </div>
              </div>
              <label className="upload-button">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  hidden
                />
                Choose photo
              </label>
            </div>
          </div>

          {/* Basic Info */}
          <div className="settings-section">
            <h2 className="settings-section-title">Basic info</h2>
            <label className="settings-label">
              <span>Name</span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your name"
              />
            </label>
            <label className="settings-label">
              <span>Username</span>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="username"
              />
              <small className="field-note">You can only change your username once every 60 days</small>
            </label>
            <label className="settings-label">
              <span>Bio</span>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                placeholder="Tell us about yourself..."
                rows={3}
              />
            </label>
          </div>

          {/* Fit + Style Preferences */}
          <div className="settings-section">
            <h2 className="settings-section-title">Fit and style preferences</h2>
            <p className="field-note">
              Private to your account. Used for future personalized search and recommendations.
            </p>
            <SizePreferencesEditor
              sizePreferences={sizePreferences}
              setSizePreferences={setSizePreferences}
            />
            <h3 className="settings-subtitle">Favorite brands</h3>
            <BrandPreferencesEditor
              favoriteBrands={favoriteBrands}
              setFavoriteBrands={setFavoriteBrands}
              customBrand={customBrand}
              setCustomBrand={setCustomBrand}
            />
          </div>

          {/* Password */}
          <div className="settings-section">
            <h2 className="settings-section-title">Change password</h2>
            <label className="settings-label">
              <span>Current password</span>
              <input
                type="password"
                name="currentPassword"
                value={formData.currentPassword}
                onChange={handleChange}
                placeholder="Enter current password"
              />
            </label>
            <label className="settings-label">
              <span>New password</span>
              <input
                type="password"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                placeholder="Enter new password"
              />
            </label>
            <label className="settings-label">
              <span>Confirm new password</span>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm new password"
              />
            </label>
          </div>

          <div className="settings-actions">
            <button type="submit" className="save-button" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              className="cancel-button"
              onClick={() => navigate("/profile")}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PostDetailPage({ currentUser }) {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [soldBusy, setSoldBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchPost() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/posts/${postId}`, { headers });
        const data = await parseApiResponse(res);
        if (!res.ok) {
          if (isMounted) setError(data?.message || "Failed to load post.");
        } else if (isMounted) {
          setPost(data.post);
        }
      } catch {
        if (isMounted) setError("Network error while loading post.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPost();
    return () => { isMounted = false; };
  }, [postId]);

  const handleLikeChange = useCallback((liked, likeCount) => {
    setPost((prev) => prev ? { ...prev, userLiked: liked, likeCount } : prev);
  }, []);

  const isOwner = currentUser && post && currentUser.id === post.userId;

  async function saveEdit() {
    const token = localStorage.getItem("token");
    if (!token) return;
    setEditSaving(true);
    try {
      const payload = { caption: editCaption };
      if (post.type === "market" && editPrice !== "") {
        payload.priceCents = Math.round(Number(editPrice) * 100);
      }
      const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setPost((prev) => ({ ...prev, ...data.post }));
        setEditing(false);
      }
    } catch {
      // silent
    } finally {
      setEditSaving(false);
    }
  }

  async function deletePost() {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        navigate(-1);
      }
    } catch {
      // silent
    }
  }

  async function toggleSold() {
    const token = localStorage.getItem("token");
    if (!token || soldBusy) return;
    setSoldBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/sold`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setPost((prev) => ({ ...prev, isSold: data.post.isSold }));
      }
    } catch {
      // silent
    } finally {
      setSoldBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="feed-content">
        <div className="feed-empty">Loading post...</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="feed-content">
        <div className="feed-empty">{error || "Post not found."}</div>
      </div>
    );
  }

  const isMarket = post.type === "market";
  const priceLabel = isMarket && post.priceCents !== null ? formatPrice(post.priceCents) : "";
  const timestamp = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="feed-content">
      <div className="post-detail">
        <button
          className="back-button"
          type="button"
          onClick={() => navigate(-1)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="post-detail-card">
          <div className="post-detail-image-wrap">
            <img src={post.imageUrl} alt={post.caption || "Post"} className="post-detail-image" />
            {post.isSold && <div className="sold-badge sold-badge--detail">SOLD</div>}
          </div>

          <div className="post-detail-body">
            <div className="post-detail-author-row">
              <ProfilePatch
                name={post.author?.name}
                imageUrl={post.author?.profilePicture}
              />
              <div className="post-detail-author-info">
                <button
                  type="button"
                  className="post-detail-author-link"
                  onClick={() => navigate(`/userpage/${post.author?.username}`)}
                >
                  @{post.author?.username}
                </button>
                {timestamp && <span className="post-detail-timestamp">{timestamp}</span>}
              </div>
            </div>

            {editing ? (
              <div className="post-edit-inline">
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="quilt-edit-input"
                  rows={3}
                  maxLength={2000}
                />
                {isMarket && (
                  <label className="post-edit-price-label">
                    Price (USD)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="quilt-edit-input"
                    />
                  </label>
                )}
                <div className="post-edit-actions">
                  <button type="button" className="save-button save-button--sm" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? "Saving..." : "Save"}
                  </button>
                  <button type="button" className="cancel-button cancel-button--sm" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {post.caption && (
                  <p className="post-detail-caption">{post.caption}</p>
                )}
                {priceLabel && (
                  <p className="post-detail-price">{priceLabel}</p>
                )}
              </>
            )}

            <div className="post-detail-actions">
              <LikeButton
                postId={post.id}
                initialLiked={post.userLiked}
                initialCount={post.likeCount}
                onLikeChange={handleLikeChange}
              />
              <PatchButton postId={post.id} />
            </div>

            {isOwner && !editing && (
              <div className="post-owner-actions">
                <button
                  type="button"
                  className="save-button save-button--sm"
                  onClick={() => {
                    setEditCaption(post.caption || "");
                    setEditPrice(isMarket && post.priceCents ? (post.priceCents / 100).toString() : "");
                    setEditing(true);
                  }}
                >
                  Edit
                </button>
                {isMarket && (
                  <button
                    type="button"
                    className={`save-button save-button--sm ${post.isSold ? "sold-toggle--sold" : ""}`}
                    onClick={toggleSold}
                    disabled={soldBusy}
                  >
                    {post.isSold ? "Mark as Available" : "Mark as Sold"}
                  </button>
                )}
                {deleteConfirm ? (
                  <>
                    <span className="post-delete-confirm-text">Delete this post?</span>
                    <button type="button" className="cancel-button cancel-button--sm" onClick={deletePost}>
                      Yes, delete
                    </button>
                    <button type="button" className="save-button save-button--sm" onClick={() => setDeleteConfirm(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="quilt-delete-btn"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}

            <CommentSection postId={post.id} postOwnerId={post.userId} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LikeButton({ postId, initialLiked, initialCount, onLikeChange }) {
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [count, setCount] = useState(initialCount || 0);
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    if (busy) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setBusy(true);
    const method = liked ? "DELETE" : "POST";
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setLiked(data.liked);
        setCount(data.likeCount);
        if (onLikeChange) onLikeChange(data.liked, data.likeCount);
      }
    } catch (err) {
      console.error("Like toggle failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`like-button ${liked ? "like-button--active" : ""}`}
      onClick={toggleLike}
      disabled={busy}
    >
      <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span>{count}</span>
    </button>
  );
}

function CommentLikeButton({ postId, commentId, initialLiked, initialCount }) {
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [count, setCount] = useState(initialCount || 0);
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    if (busy) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setBusy(true);
    const method = liked ? "DELETE" : "POST";
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments/${commentId}/like`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setLiked(data.liked);
        setCount(data.likeCount);
      }
    } catch (err) {
      console.error("Comment like toggle failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`comment-like-btn ${liked ? "comment-like-btn--active" : ""}`}
      onClick={toggleLike}
      disabled={busy}
    >
      <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

function PatchButton({ postId }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="patch-button"
        onClick={() => setOpen(true)}
        title="Save to quilt"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <rect x="5" y="5" width="14" height="14" rx="0.5" strokeDasharray="2 1.5" />
        </svg>
      </button>
      <QuiltPickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        postId={postId}
      />
    </>
  );
}

function CommentSection({ postId, postOwnerId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const currentUserId = useMemo(() => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return null;
      return JSON.parse(atob(token.split(".")[1])).id;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchComments() {
      setLoading(true);
      try {
        const headers = {};
        const token = localStorage.getItem("token");
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, { headers });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setComments(Array.isArray(data?.comments) ? data.comments : []);
        }
      } catch {
        // silent fail
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchComments();
    return () => { isMounted = false; };
  }, [postId]);

  function startReply(comment, topLevelId) {
    // If topLevelId is provided, the comment is a reply — nest under the top-level parent
    setReplyingTo({ id: topLevelId || comment.id, username: comment.author?.username });
    setBody(`@${comment.author?.username} `);
  }

  function cancelReply() {
    setReplyingTo(null);
    setBody("");
  }

  async function handleDelete(commentId, parentId) {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (parentId) {
          // Remove reply from its parent
          setComments((prev) =>
            prev.map((c) =>
              c.id === parentId
                ? { ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) }
                : c
            )
          );
        } else {
          // Remove top-level comment
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      }
    } catch (err) {
      console.error("Comment delete failed:", err);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!body.trim() || submitting) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setSubmitting(true);
    try {
      const payload = { body: body.trim() };
      if (replyingTo) {
        payload.parentId = replyingTo.id;
      }

      const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse(res);
      if (res.ok && data?.comment) {
        if (replyingTo) {
          // Add reply under its parent
          setComments((prev) =>
            prev.map((c) =>
              c.id === replyingTo.id
                ? { ...c, replies: [...(c.replies || []), data.comment] }
                : c
            )
          );
        } else {
          setComments((prev) => [...prev, { ...data.comment, replies: [] }]);
        }
        setBody("");
        setReplyingTo(null);
      }
    } catch (err) {
      console.error("Comment submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  function canDelete(comment) {
    if (!currentUserId) return false;
    return comment.userId === currentUserId || postOwnerId === currentUserId;
  }

  return (
    <div className="comment-section">
      <h3 className="comment-section-title">Comments</h3>
      <div className="comment-list">
        {loading ? (
          <p className="comment-empty">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="comment-empty">No comments yet. Be the first!</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="comment-item">
              <div className="comment-item-row">
                <span className="comment-author">@{c.author?.username}</span>
                <span className="comment-body">{c.body}</span>
              </div>
              <div className="comment-actions">
                <CommentLikeButton postId={postId} commentId={c.id} initialLiked={c.userLiked} initialCount={c.likeCount} />
                <button
                  type="button"
                  className="comment-reply-btn"
                  onClick={() => startReply(c)}
                >
                  Reply
                </button>
                {canDelete(c) && (
                  <button
                    type="button"
                    className="comment-delete-btn"
                    onClick={() => handleDelete(c.id, null)}
                  >
                    Delete
                  </button>
                )}
              </div>
              {c.replies && c.replies.length > 0 && (
                <div className="comment-replies">
                  {c.replies.map((r) => (
                    <div key={r.id} className="comment-item">
                      <div className="comment-item-row">
                        <span className="comment-author">@{r.author?.username}</span>
                        <span className="comment-body">{r.body}</span>
                      </div>
                      <div className="comment-actions">
                        <CommentLikeButton postId={postId} commentId={r.id} initialLiked={r.userLiked} initialCount={r.likeCount} />
                        <button
                          type="button"
                          className="comment-reply-btn"
                          onClick={() => startReply(r, c.id)}
                        >
                          Reply
                        </button>
                        {canDelete(r) && (
                          <button
                            type="button"
                            className="comment-delete-btn"
                            onClick={() => handleDelete(r.id, c.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {replyingTo && (
        <div className="comment-replying-indicator">
          Replying to @{replyingTo.username}
          <button type="button" className="comment-reply-btn" onClick={cancelReply}>
            Cancel
          </button>
        </div>
      )}
      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="comment-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Add a comment..."}
          maxLength={1000}
        />
        <button
          type="submit"
          className="comment-submit"
          disabled={submitting || !body.trim()}
        >
          {submitting ? "..." : "Post"}
        </button>
      </form>
    </div>
  );
}

function QuiltPickerModal({ isOpen, onClose, postId }) {
  const [quilts, setQuilts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setNewName("");
      setMessage("");
      return;
    }

    let isMounted = true;
    async function fetchQuilts() {
      setLoading(true);
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${API_BASE_URL}/quilts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setQuilts(Array.isArray(data?.quilts) ? data.quilts : []);
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchQuilts();
    return () => { isMounted = false; };
  }, [isOpen]);

  async function saveToQuilt(quiltId) {
    setSaving(true);
    setMessage("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}/patches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });
      if (res.ok) {
        setMessage("Saved!");
        setTimeout(() => onClose(), 800);
      } else {
        const data = await parseApiResponse(res);
        setMessage(data?.message || "Failed to save.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function createAndSave() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    setMessage("");
    const token = localStorage.getItem("token");
    try {
      const createRes = await fetch(`${API_BASE_URL}/quilts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const createData = await parseApiResponse(createRes);
      if (!createRes.ok) {
        setMessage(createData?.message || "Failed to create quilt.");
        return;
      }

      const quiltId = createData.quilt.id;
      const patchRes = await fetch(`${API_BASE_URL}/quilts/${quiltId}/patches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });

      if (patchRes.ok) {
        setMessage("Saved!");
        setTimeout(() => onClose(), 800);
      } else {
        const patchData = await parseApiResponse(patchRes);
        setMessage(patchData?.message || "Created quilt but failed to save post.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="create-post-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="quilt-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="create-post-header">
          <h2>Save to quilt</h2>
          <button type="button" className="create-post-close" onClick={onClose}>
            Close
          </button>
        </div>

        {message && (
          <div className={`settings-message ${message === "Saved!" ? "success" : "error"}`}>
            {message}
          </div>
        )}

        {loading ? (
          <p className="comment-empty">Loading quilts...</p>
        ) : (
          <div className="quilt-picker-list">
            {quilts.map((q) => (
              <button
                key={q.id}
                type="button"
                className="quilt-picker-item"
                onClick={() => saveToQuilt(q.id)}
                disabled={saving}
              >
                {q.name}
                <span className="quilt-picker-count">{q.patchCount || 0} patches</span>
              </button>
            ))}
          </div>
        )}

        <div className="quilt-picker-create">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New quilt name"
            maxLength={100}
          />
          <button
            type="button"
            className="save-button"
            onClick={createAndSave}
            disabled={saving || !newName.trim()}
          >
            {saving ? "..." : "Create & save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessagesPage({ currentUser }) {
  const [conversations, setConversations] = useState([]);
  const [activeConvoId, setActiveConvoId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgBody, setMsgBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [convoDetail, setConvoDetail] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Fetch conversations
  useEffect(() => {
    async function fetchConversations() {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/messages/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiResponse(res);
        if (res.ok) {
          setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchConversations();
  }, []);

  // Socket.IO connection
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let socket;
    async function connectSocket() {
      const { io } = await import("socket.io-client");
      const socketUrl = API_BASE_URL.replace("/api", "");
      socket = io(socketUrl || window.location.origin, {
        auth: { token },
      });
      socketRef.current = socket;

      socket.on("new_message", ({ message, conversationId }) => {
        // Update messages if viewing that conversation
        if (conversationId === activeConvoId) {
          setMessages((prev) => [...prev, message]);
        }
        // Update conversation list (move to top, update last message)
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [message], updatedAt: new Date().toISOString() }
              : c
          );
          updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          return updated;
        });
      });

      socket.on("conversation_updated", ({ conversation }) => {
        setConversations((prev) => {
          if (prev.find((c) => c.id === conversation.id)) return prev;
          return [conversation, ...prev];
        });
      });
    }

    connectSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [activeConvoId]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConvoId) {
      setMessages([]);
      setConvoDetail(null);
      return;
    }

    let isMounted = true;
    async function fetchMessages() {
      setMsgLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/messages/conversations/${activeConvoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setMessages(Array.isArray(data?.messages) ? data.messages : []);
          setConvoDetail(data?.conversation || null);
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setMsgLoading(false);
      }
    }
    fetchMessages();
    return () => { isMounted = false; };
  }, [activeConvoId]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!msgBody.trim() || sending || !activeConvoId) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/messages/conversations/${activeConvoId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: msgBody.trim() }),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setMessages((prev) => [...prev, data.message]);
        setMsgBody("");
        // Update conversation list
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === activeConvoId
              ? { ...c, messages: [data.message], updatedAt: new Date().toISOString() }
              : c
          );
          updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          return updated;
        });
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  async function searchUsers(query) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setSearchResults(
          (Array.isArray(data?.users) ? data.users : []).filter(
            (u) => u.id !== currentUser?.id
          )
        );
      }
    } catch {
      // silent
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim()) searchUsers(searchQuery);
      else setSearchResults([]);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function startConversation() {
    if (!selectedUsers.length) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/messages/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantIds: selectedUsers.map((u) => u.id) }),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        const convo = data.conversation;
        if (!data.existing) {
          setConversations((prev) => [convo, ...prev]);
        }
        setActiveConvoId(convo.id);
        setNewConvoOpen(false);
        setSelectedUsers([]);
        setSearchQuery("");
        setSearchResults([]);
      }
    } catch {
      // silent
    }
  }

  async function deleteConversation(convoId) {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/messages/conversations/${convoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convoId));
        if (activeConvoId === convoId) {
          setActiveConvoId(null);
        }
        setDeleteConfirmId(null);
      }
    } catch {
      // silent
    }
  }

  function getConvoName(convo) {
    const others = (convo.participants || [])
      .filter((p) => p.user?.id !== currentUser?.id)
      .map((p) => p.user?.name || p.user?.username || "Unknown");
    return others.join(", ") || "Conversation";
  }

  function getConvoAvatar(convo) {
    const other = (convo.participants || []).find((p) => p.user?.id !== currentUser?.id);
    return other?.user || null;
  }

  function formatMsgTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="feed-content">
      <div className="messages-page">
        {/* Conversation List */}
        <div className="conversations-list">
          <div className="conversations-list-header">
            <h2>Messages</h2>
            <button
              type="button"
              className="new-convo-btn"
              onClick={() => setNewConvoOpen(true)}
              title="New conversation"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="12" y1="8" x2="12" y2="14" />
                <line x1="9" y1="11" x2="15" y2="11" />
              </svg>
            </button>
          </div>

          {loading ? (
            <p className="comment-empty">Loading...</p>
          ) : conversations.length === 0 ? (
            <p className="comment-empty">No conversations yet.</p>
          ) : (
            conversations.map((convo) => {
              const lastMsg = convo.messages?.[0];
              const convoUser = getConvoAvatar(convo);
              return (
                <div
                  key={convo.id}
                  className={`conversation-item${activeConvoId === convo.id ? " conversation-item--active" : ""}`}
                >
                  <button
                    type="button"
                    className="conversation-item-btn"
                    onClick={() => setActiveConvoId(convo.id)}
                  >
                    <ProfilePatch name={convoUser?.name} imageUrl={convoUser?.profilePicture} />
                    <div className="conversation-item-info">
                      <span className="conversation-item-name">{getConvoName(convo)}</span>
                      {lastMsg && (
                        <span className="conversation-item-preview">
                          {lastMsg.sender?.id === currentUser?.id ? "You: " : ""}
                          {lastMsg.body?.substring(0, 40)}{lastMsg.body?.length > 40 ? "..." : ""}
                        </span>
                      )}
                    </div>
                    {lastMsg && (
                      <span className="conversation-item-time">
                        {formatMsgTime(lastMsg.createdAt)}
                      </span>
                    )}
                  </button>
                  {deleteConfirmId === convo.id ? (
                    <div className="conversation-delete-confirm">
                      <button type="button" className="cancel-button cancel-button--sm" onClick={() => deleteConversation(convo.id)}>
                        Delete
                      </button>
                      <button type="button" className="save-button save-button--sm" onClick={() => setDeleteConfirmId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="conversation-delete-btn"
                      onClick={() => setDeleteConfirmId(convo.id)}
                      title="Leave conversation"
                    >
                      &times;
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Chat Panel */}
        <div className="chat-panel">
          {activeConvoId ? (
            <>
              <div className="chat-header">
                <h3>{convoDetail ? getConvoName(convoDetail) : "..."}</h3>
                {convoDetail && convoDetail.participants?.length > 2 && (
                  <span className="chat-header-count">
                    {convoDetail.participants.length} members
                  </span>
                )}
              </div>
              <div className="chat-messages">
                {msgLoading ? (
                  <p className="comment-empty">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="comment-empty">No messages yet. Say hello!</p>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender?.id === currentUser?.id || msg.senderId === currentUser?.id;
                    return (
                      <div key={msg.id} className={`chat-bubble ${isOwn ? "chat-bubble--own" : "chat-bubble--other"}`}>
                        {!isOwn && (
                          <span className="chat-bubble-sender">{msg.sender?.name || msg.sender?.username}</span>
                        )}
                        <p className="chat-bubble-body">{msg.body}</p>
                        <span className="chat-bubble-time">{formatMsgTime(msg.createdAt)}</span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  type="text"
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={2000}
                />
                <button type="submit" disabled={sending || !msgBody.trim()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p>Select a conversation or start a new one</p>
            </div>
          )}
        </div>

        {/* New Conversation Modal */}
        {newConvoOpen && (
          <div className="create-post-overlay" role="dialog" aria-modal="true" onClick={() => setNewConvoOpen(false)}>
            <div className="new-convo-modal" onClick={(e) => e.stopPropagation()}>
              <div className="create-post-header">
                <h2>New conversation</h2>
                <button type="button" className="create-post-close" onClick={() => { setNewConvoOpen(false); setSelectedUsers([]); setSearchQuery(""); }}>
                  Close
                </button>
              </div>
              <div className="new-convo-search">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users..."
                />
              </div>
              {selectedUsers.length > 0 && (
                <div className="new-convo-selected">
                  {selectedUsers.map((u) => (
                    <span key={u.id} className="brand-selected-item">
                      @{u.username}
                      <button type="button" onClick={() => setSelectedUsers((prev) => prev.filter((s) => s.id !== u.id))}>
                        remove
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="new-convo-results">
                {searchLoading ? (
                  <p className="comment-empty">Searching...</p>
                ) : searchResults.length === 0 && searchQuery.trim() ? (
                  <p className="comment-empty">No users found.</p>
                ) : (
                  searchResults
                    .filter((u) => !selectedUsers.find((s) => s.id === u.id))
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="follow-list-item-link"
                        onClick={() => setSelectedUsers((prev) => [...prev, u])}
                      >
                        <ProfilePatch name={u.name} imageUrl={u.profilePicture} />
                        <div className="follow-list-item-info">
                          <span className="follow-list-item-name">{u.name}</span>
                          <span className="follow-list-item-handle">@{u.username}</span>
                        </div>
                      </button>
                    ))
                )}
              </div>
              <button
                type="button"
                className="save-button"
                onClick={startConversation}
                disabled={!selectedUsers.length}
              >
                Start conversation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
