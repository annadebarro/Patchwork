import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import {
  normalizeFavoriteBrands,
  normalizeSizePreferences,
  toSizePreferencesApiPayload,
} from "../../shared/preferences/preferences";
import SizePreferencesEditor from "./SizePreferencesEditor";
import BrandPreferencesEditor from "./BrandPreferencesEditor";
import ImageCropper from "../feed/ImageCropper";

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
  const [showCropper, setShowCropper] = useState(false);
  const [rawPreviewUrl, setRawPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
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
      setRawPreviewUrl(URL.createObjectURL(file));
      setShowCropper(true);
    }
    event.target.value = "";
  }

  function handleCropDone(croppedFile) {
    setAvatarFile(croppedFile);
    setPreviewUrl(URL.createObjectURL(croppedFile));
    setShowCropper(false);
    setRawPreviewUrl(null);
  }

  function handleChangeImage() {
    setShowCropper(false);
    setRawPreviewUrl(null);
    fileInputRef.current?.click();
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
              {showCropper && rawPreviewUrl ? (
                <ImageCropper
                  mode="avatar"
                  imageUrl={rawPreviewUrl}
                  onCropDone={handleCropDone}
                  onChangeImage={handleChangeImage}
                />
              ) : (
                <>
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
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      hidden
                    />
                    Choose photo
                  </label>
                </>
              )}
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

export default AccountSettings;
