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
              <Navigate to="/home/social" replace />
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
          <Route path="/home" element={<HomeLayout />}>
            <Route index element={<Navigate to="social" replace />} />
            <Route path="social" element={<SocialHome refreshKey={postRefreshKey} />} />
            <Route path="marketplace" element={<MarketplaceHome refreshKey={postRefreshKey} />} />
          </Route>
          <Route path="/post/:postId" element={<PostDetailPage />} />
          <Route path="/userpage/:username" element={<UserPage currentUser={user} />} />
          <Route
            path="/profile"
            element={<UserPage user={user} isOwnProfile refreshKey={postRefreshKey} />}
          />
          <Route path="/settings" element={<AccountSettings user={user} onUpdateUser={setUser} />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? "/home/social" : "/"} replace />} />
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
            to="/home/social"
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
          <NavLink to="/home/messages" className="sidebar-icon sidebar-icon--messages" title="Messages">
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

function HomeLayout() {
  return (
    <>
      {/* Feed Tabs */}
      <nav className="feed-tabs">
        <NavLink to="/home/social" className={({ isActive }) => `feed-tab ${isActive ? "active" : ""}`}>
          Social
        </NavLink>
        <NavLink to="/home/marketplace" className={({ isActive }) => `feed-tab ${isActive ? "active" : ""}`}>
          Marketplace
        </NavLink>
      </nav>

      {/* Feed Content */}
      <div className="feed-content">
        <Outlet />
      </div>
    </>
  );
}

function SocialHome({ refreshKey }) {
  return <PostsGrid type="regular" refreshKey={refreshKey} />;
}

function MarketplaceHome({ refreshKey }) {
  return <PostsGrid type="market" refreshKey={refreshKey} />;
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

function PostCard({ post }) {
  const navigate = useNavigate();
  const isMarket = post.type === "market";
  const priceLabel = isMarket && post.priceCents !== null ? formatPrice(post.priceCents) : "";
  const caption = typeof post.caption === "string" ? post.caption : "";
  const authorUsername = post.author?.username;

  return (
    <div
      className="post-card post-card--clickable"
      onClick={() => navigate(`/post/${post.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/post/${post.id}`);
      }}
    >
      <img src={post.imageUrl} alt={caption || "Post"} />
      {isMarket && (
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
              Change account info
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

        <section className="user-posts" aria-label="User posts">
          <h2 className="user-posts-title">{isOwnProfile ? "Your posts" : "Posts"}</h2>
          {postsLoading ? (
            <div className="placeholder">
              <p>Loading posts...</p>
            </div>
          ) : postsError ? (
            <div className="placeholder">
              <p>{postsError}</p>
            </div>
          ) : posts.length ? (
            <div className="masonry-grid">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className="placeholder">
              <p>No posts yet.</p>
            </div>
          )}
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
        navigate("/home/social", { replace: true });
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

function PostDetailPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

            {post.caption && (
              <p className="post-detail-caption">{post.caption}</p>
            )}
            {priceLabel && (
              <p className="post-detail-price">{priceLabel}</p>
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
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`);
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

export default App;
