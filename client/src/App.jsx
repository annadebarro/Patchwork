import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function App() {
  const [view, setView] = useState("login"); // login | signup | home
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    async function fetchMe() {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setView("home");
        } else {
          localStorage.removeItem("token");
        }
      } catch {
        localStorage.removeItem("token");
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
        setView("home");
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
        setView("home");
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
    setView("login");
  }

  return (
    <main className="shell">
      <div className="card">
        <h1 className="logo">Patchwork</h1>

        {view !== "home" && (
          <div className="tabs">
            <button
              className={view === "login" ? "active" : ""}
              onClick={() => {
                setError("");
                setView("login");
              }}
            >
              Log in
            </button>
            <button
              className={view === "signup" ? "active" : ""}
              onClick={() => {
                setError("");
                setView("signup");
              }}
            >
              Create account
            </button>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {view === "signup" && (
          <form className="form" onSubmit={handleSignup}>
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
        )}

        {view === "login" && (
          <form className="form" onSubmit={handleLogin}>
            <label>
              Email or username
              <input
                name="emailOrUsername"
                type="text"
                placeholder="you@example.com or username"
                required
              />
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

        {view === "home" && (
          <div className="home">
            <p className="hello">
              Hello{user?.name ? `, ${user.name}` : ""}! More coming later.
            </p>
            <button onClick={handleLogout}>Log out</button>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
