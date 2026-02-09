import { useEffect, useMemo, useState } from "react";
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
              <AuthedLayout onLogout={handleLogout} user={user} />
            </RequireAuth>
          }
        >
          <Route path="/home" element={<HomeLayout />}>
            <Route index element={<Navigate to="social" replace />} />
            <Route path="social" element={<SocialHome />} />
            <Route path="marketplace" element={<MarketplaceHome />} />
          </Route>
          <Route path="/userpage/:username" element={<UserPage />} />
          <Route path="/profile" element={<UserPage user={user} isOwnProfile />} />
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

function AuthedLayout({ onLogout, user }) {
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
          <NavLink to="/home/messages" className="sidebar-icon" title="Messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </NavLink>
          <NavLink to="/home/likes" className="sidebar-icon" title="Likes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </NavLink>
          <button className="sidebar-icon" title="Create Post" type="button">
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
          <ProfileAvatar name={user?.name} size="sm" imageUrl={user?.avatarUrl} />
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

function SocialHome() {
  return (
    <div className="masonry-grid">
      {samplePosts.map((post) => (
        <div key={post.id} className="post-card">
          <img src={post.image} alt="Post" />
          {post.forSale && (
            <div className="sale-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MarketplaceHome() {
  const marketplacePosts = samplePosts.filter((post) => post.forSale);

  return (
    <div className="masonry-grid">
      {marketplacePosts.map((post) => (
        <div key={post.id} className="post-card">
          <img src={post.image} alt="Post" />
          <div className="sale-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfilePatch({ name }) {
  const initial = name?.charAt(0).toUpperCase() || "?";
  return (
    <div className="profile-patch">
      <div className="profile-patch-inner">
        <span className="profile-patch-initial">{initial}</span>
      </div>
    </div>
  );
}

function ProfileAvatar({ name, size = "md", imageUrl }) {
  const initial = name?.charAt(0).toUpperCase() || "?";
  return (
    <div className={`profile-avatar profile-avatar--${size}`} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" /> : <span>{initial}</span>}
    </div>
  );
}

function UserPage({ user, isOwnProfile = false }) {
  const { username } = useParams();
  const navigate = useNavigate();
  const displayName = isOwnProfile ? user?.name || "Your name" : "User name";
  const displayUsername = isOwnProfile ? user?.username || "your-username" : username || "username";
  const galleryPosts = samplePosts.slice(0, 4);

  return (
    <div className="feed-content">
      <section className="user-page">
        <section className="profile-hero">
          <ProfileAvatar name={displayName} size="lg" imageUrl={user?.avatarUrl} />
          <h1 className="profile-name">{displayUsername}</h1>
          <div className="profile-actions">
            {isOwnProfile && (
              <button
                className="profile-action"
                type="button"
                onClick={() => navigate("/settings")}
              >
                edit profile
              </button>
            )}
            <button className="profile-action" type="button">
              view archive
            </button>
          </div>
        </section>

        <nav className="profile-tabs" aria-label="Profile tabs">
          <button type="button" className="profile-tab active" aria-label="Grid view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="4" width="6" height="6" />
              <rect x="14" y="4" width="6" height="6" />
              <rect x="4" y="14" width="6" height="6" />
              <rect x="14" y="14" width="6" height="6" />
            </svg>
          </button>
          <button type="button" className="profile-tab" aria-label="Favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 3l3 6 6 1-4.5 4.5 1.2 6.5L12 17l-5.7 4 1.2-6.5L3 10l6-1 3-6z" />
            </svg>
          </button>
          <button type="button" className="profile-tab" aria-label="Highlights">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" />
            </svg>
          </button>
          <button type="button" className="profile-tab" aria-label="Saved">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
            </svg>
          </button>
        </nav>

        <section className="profile-gallery" aria-label="User posts">
          <div className="gallery-frame">
            {galleryPosts.map((post) => (
              <div key={post.id} className="gallery-card">
                <img src={post.image} alt="User post" />
              </div>
            ))}
          </div>
        </section>
      </section>
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
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
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
  const [previewUrl, setPreviewUrl] = useState(user?.avatarUrl || null);
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
    setAvatarUrl(user?.avatarUrl || "");
    setSizePreferences(normalizeSizePreferences(user?.sizePreferences));
    setFavoriteBrands(normalizeFavoriteBrands(user?.favoriteBrands));
    setCustomBrand("");
    setPreviewUrl(user?.avatarUrl || null);
  }, [user]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setPreviewUrl(result || null);
      setAvatarUrl(result || "");
    };
    reader.readAsDataURL(file);
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
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          username: formData.username,
          bio: formData.bio,
          avatarUrl,
          sizePreferences: toSizePreferencesApiPayload(sizePreferences),
          favoriteBrands: normalizeFavoriteBrands(favoriteBrands),
        }),
      });

      const data = await parseApiResponse(res);
      if (!res.ok) {
        setMessage(data?.message || "Failed to save changes");
      } else {
        onUpdateUser(data.user);
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

export default App;
