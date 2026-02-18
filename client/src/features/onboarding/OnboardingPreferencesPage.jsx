import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import {
  normalizeFavoriteBrands,
  normalizeSizePreferences,
  toSizePreferencesApiPayload,
} from "../../shared/preferences/preferences";
import SizePreferencesEditor from "../settings/SizePreferencesEditor";
import BrandPreferencesEditor from "../settings/BrandPreferencesEditor";

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

export default OnboardingPreferencesPage;
