const collageImages = ["/ref2.jpg", "/ref1.jpg", "/ref4.jpg", "/ref3.jpg"];

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

export default AuthPage;
