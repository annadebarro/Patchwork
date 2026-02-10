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

export default OnboardingPrompt;
