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

  // Sample images for collage (placeholder fashion photos)
  const collageImages = [
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=400&fit=crop",
  ];

  // Home view (after login)
  if (view === "home") {
    return (
      <div className="home-container">
        <div className="home">
          <h1 className="logo">Patchwork</h1>
          <p className="hello">
            Hello{user?.name ? `, ${user.name}` : ""}! More coming later.
          </p>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </div>
    );
  }

  // Login/Signup view
  return (
    <main className="auth-container">
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
          {view === "login" ? "Log into Patchwork" : "Create an account"}
        </h2>

        {error && <div className="error">{error}</div>}

        {view === "signup" && (
          <form className="form" onSubmit={handleSignup}>
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
              onClick={() => {
                setError("");
                setView("login");
              }}
            >
              log in
            </button>
          </form>
        )}

        {view === "login" && (
          <form className="form" onSubmit={handleLogin}>
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
            <button type="submit" disabled={loading}>
              {loading ? "logging in..." : "log in"}
            </button>
            <button
              type="button"
              className="switch-auth"
              onClick={() => {
                setError("");
                setView("signup");
              }}
            >
              create an account
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default App;
