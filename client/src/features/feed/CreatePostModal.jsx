import { useEffect, useState } from "react";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";

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
    } catch {
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

export default CreatePostModal;
