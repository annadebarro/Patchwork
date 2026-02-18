import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { API_BASE_URL, parseApiResponse } from "./shared/api/http";
import RequireAuth from "./shared/ui/RequireAuth";
import RequireAdmin from "./shared/ui/RequireAdmin";
import AuthPage from "./features/auth/AuthPage";
import OnboardingPrompt from "./features/onboarding/OnboardingPrompt";
import OnboardingPreferencesPage from "./features/onboarding/OnboardingPreferencesPage";
import AuthedLayout from "./features/layout/AuthedLayout";
import HomeLayout from "./features/feed/HomeLayout";
import SearchPage from "./features/search/SearchPage";
import PostDetailPage from "./features/post-detail/PostDetailPage";
import MessagesPage from "./features/messages/MessagesPage";
import UserPage from "./features/profile/UserPage";
import AccountSettings from "./features/settings/AccountSettings";
import CreatePostModal from "./features/feed/CreatePostModal";
import AdminSimulationPage from "./features/admin/AdminSimulationPage";

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
          <Route path="/search" element={<SearchPage />} />
          <Route path="/post/:postId" element={<PostDetailPage currentUser={user} />} />
          <Route path="/messages" element={<MessagesPage currentUser={user} />} />
          <Route path="/userpage/:username" element={<UserPage currentUser={user} />} />
          <Route
            path="/profile"
            element={<UserPage user={user} isOwnProfile refreshKey={postRefreshKey} />}
          />
          <Route path="/settings" element={<AccountSettings user={user} onUpdateUser={setUser} />} />
          <Route
            path="/admin/recommendations"
            element={(
              <RequireAdmin user={user}>
                <AdminSimulationPage />
              </RequireAdmin>
            )}
          />
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

export default App;
