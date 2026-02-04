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

// Sample images for collage (placeholder fashion photos)
const collageImages = [
  "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=400&fit=crop",
];

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
      <div className="loading-container">
        <div className="loading-card">
          <h1 className="logo">Patchwork</h1>
          <p className="loading">Loading...</p>
        </div>
      </div>
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
          element={
            <RequireAuth user={user}>
              <AuthedLayout user={user} onLogout={handleLogout} />
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
      {/* Left side - Photo collage */}
      <div className="photo-collage">
        <div className="collage-grid">
          {collageImages.map((src, index) => (
            <div key={index} className="collage-item">
              <img src={src} alt={`Fashion ${index + 1}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="auth-form-container">
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
            <button type="submit" disabled={loading}>
              {loading ? "creating..." : "create account"}
            </button>
            <button
              type="button"
              className="switch-auth"
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
                placeholder="username or email"
                required
              />
            </label>
            <label>
              <input name="password" type="password" placeholder="password" required />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "logging in..." : "log in"}
            </button>
            <button
              type="button"
              className="switch-auth"
              onClick={() => onSwitchView("signup")}
            >
              create an account
            </button>
          </form>
        )}
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

function AuthedLayout({ user, onLogout }) {
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
  const marketplacePosts = samplePosts.filter(p => p.forSale);
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

function UserPage({ user, isOwnProfile = false }) {
  const { username } = useParams();
  const navigate = useNavigate();
  const displayName = isOwnProfile ? user?.name || "Your name" : "User name";
  const displayUsername = isOwnProfile ? user?.username || "your-username" : username || "username";
  const displayBio = isOwnProfile ? user?.bio || "" : "";

  return (
    <div className="feed-content">
      <section className="user-page">
        <header className="user-header">
          <ProfilePatch name={displayName} />
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
        </div>

        <div className="user-bio">
          {displayBio ? (
            <p className="user-bio-text">{displayBio}</p>
          ) : (
            <p className="user-bio-empty">No bio yet</p>
          )}
        </div>

        <section className="user-posts" aria-label="Assigned posts">
          <h2 className="user-posts-title">Assigned posts</h2>
          <div className="placeholder">
            <p>No posts assigned yet.</p>
          </div>
        </section>
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
  const [profilePicture, setProfilePicture] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      setProfilePicture(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || "Failed to save changes");
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
