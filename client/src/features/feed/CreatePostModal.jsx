import { useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  parseApiResponse,
  REQUEST_SURFACES,
} from "../../shared/api/http";
import {
  addTagValue,
  fetchPostMetadataOptions,
  getFallbackPostMetadataOptions,
  MAX_COLOR_TAGS,
  MAX_STYLE_TAGS,
  POST_TYPES,
  removeTagValue,
  toDisplayLabel,
  UNKNOWN,
} from "../../shared/posts/postMetadata";

function CreatePostModal({ isOpen, onClose, onCreated }) {
  const [type, setType] = useState(POST_TYPES.REGULAR);
  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [metadataOptions, setMetadataOptions] = useState(() =>
    getFallbackPostMetadataOptions({ type: POST_TYPES.REGULAR })
  );
  const [category, setCategory] = useState(UNKNOWN);
  const [subcategory, setSubcategory] = useState(UNKNOWN);
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState(UNKNOWN);
  const [sizeLabel, setSizeLabel] = useState(UNKNOWN);
  const [styleTags, setStyleTags] = useState([]);
  const [colorTags, setColorTags] = useState([]);
  const [styleTagInput, setStyleTagInput] = useState("");
  const [colorTagInput, setColorTagInput] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const isMarket = type === POST_TYPES.MARKET;
  const supportsCategory = Boolean(metadataOptions?.fields?.category);
  const subcategoryOptions = useMemo(() => {
    const options = metadataOptions?.subcategoriesByCategory?.[category];
    return Array.isArray(options) && options.length > 0 ? options : [UNKNOWN];
  }, [category, metadataOptions]);

  useEffect(() => {
    if (!isOpen) {
      setType(POST_TYPES.REGULAR);
      setCaption("");
      setPrice("");
      setImageFile(null);
      setPreviewUrl("");
      setError("");
      setMetadataOptions(getFallbackPostMetadataOptions({ type: POST_TYPES.REGULAR }));
      setCategory(UNKNOWN);
      setSubcategory(UNKNOWN);
      setBrand("");
      setCondition(UNKNOWN);
      setSizeLabel(UNKNOWN);
      setStyleTags([]);
      setColorTags([]);
      setStyleTagInput("");
      setColorTagInput("");
      setShowDetails(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let ignore = false;
    setMetadataOptions(getFallbackPostMetadataOptions({ type }));
    fetchPostMetadataOptions({ type })
      .then((options) => {
        if (!ignore && options) {
          setMetadataOptions(options);
        }
      })
      .catch(() => {
        // Keep fallback metadata options when options API fails.
      });

    return () => {
      ignore = true;
    };
  }, [isOpen, type]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!subcategoryOptions.includes(subcategory)) {
      setSubcategory(UNKNOWN);
    }
  }, [subcategory, subcategoryOptions]);

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

  function addStyleTag(rawTag) {
    setStyleTags((prev) => addTagValue(prev, rawTag, MAX_STYLE_TAGS));
  }

  function addColorTag(rawTag) {
    setColorTags((prev) => addTagValue(prev, rawTag, MAX_COLOR_TAGS));
  }

  function handleTagKeyDown(event, addFn, clearFn) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const rawValue = event.currentTarget.value;
      if (!rawValue.trim()) return;
      addFn(rawValue);
      clearFn("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!imageFile) {
      setError("Please select an image to upload.");
      return;
    }

    if (isMarket) {
      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        setError("Please enter a valid dollar amount.");
        return;
      }

      if (category === UNKNOWN || condition === UNKNOWN || sizeLabel === UNKNOWN) {
        setError("Marketplace posts require category, condition, and size.");
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

      const uploadRes = await apiFetch("/uploads", {
        method: "POST",
        body: formData,
        surface: REQUEST_SURFACES.SOCIAL_FEED,
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
        brand: brand.trim(),
        styleTags,
        colorTags,
      };

      if (isMarket) {
        payload.category = category;
        payload.subcategory = subcategory;
        payload.condition = condition;
        payload.sizeLabel = sizeLabel;
        payload.priceCents = Math.round(Number(price) * 100);
      }

      const res = await apiFetch("/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        auth: true,
        surface: REQUEST_SURFACES.SOCIAL_FEED,
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
            <select
              value={type}
              onChange={(event) => {
                const nextType = event.target.value;
                setType(nextType);
                if (nextType === POST_TYPES.REGULAR) {
                  setCategory(UNKNOWN);
                  setSubcategory(UNKNOWN);
                  setCondition(UNKNOWN);
                  setSizeLabel(UNKNOWN);
                  setPrice("");
                }
              }}
            >
              <option value={POST_TYPES.REGULAR}>Regular</option>
              <option value={POST_TYPES.MARKET}>Marketplace</option>
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

          {isMarket && (
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

          {!isMarket && !showDetails && (
            <button
              type="button"
              className="post-details-toggle"
              onClick={() => setShowDetails(true)}
            >
              Add vibe tags (optional)
            </button>
          )}

          {isMarket && supportsCategory && (
            <div className="post-metadata-grid">
              <label>
                Category*
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {metadataOptions.categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {toDisplayLabel(entry)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Subcategory
                <select value={subcategory} onChange={(event) => setSubcategory(event.target.value)}>
                  {subcategoryOptions.map((entry) => (
                    <option key={entry} value={entry}>
                      {toDisplayLabel(entry)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Condition*
                <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                  {metadataOptions.conditions.map((entry) => (
                    <option key={entry} value={entry}>
                      {toDisplayLabel(entry)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Size*
                <select value={sizeLabel} onChange={(event) => setSizeLabel(event.target.value)}>
                  {metadataOptions.sizeLabels.map((entry) => (
                    <option key={entry} value={entry}>
                      {toDisplayLabel(entry)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {(isMarket || showDetails) && (
            <>
              <label>
                Brand (optional)
                <input
                  type="text"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  placeholder="Brand (optional)"
                  maxLength={50}
                  list="create-post-brand-options"
                />
                <datalist id="create-post-brand-options">
                  {metadataOptions.suggestedBrands.map((entry) => (
                    <option key={entry} value={entry} />
                  ))}
                </datalist>
              </label>

              <div className="post-tag-editor">
                <span>Style/Vibe tags (optional)</span>
                <div className="post-tag-row">
                  <input
                    type="text"
                    value={styleTagInput}
                    onChange={(event) => setStyleTagInput(event.target.value)}
                    onKeyDown={(event) => handleTagKeyDown(event, addStyleTag, setStyleTagInput)}
                    placeholder="Add style tag"
                  />
                  <button
                    type="button"
                    className="size-add"
                    onClick={() => {
                      addStyleTag(styleTagInput);
                      setStyleTagInput("");
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className="post-tag-suggestions">
                  {metadataOptions.suggestedStyleTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`brand-chip ${styleTags.includes(tag) ? "selected" : ""}`}
                      onClick={() => addStyleTag(tag)}
                    >
                      {toDisplayLabel(tag)}
                    </button>
                  ))}
                </div>
                {styleTags.length > 0 ? (
                  <div className="post-tag-list">
                    {styleTags.map((tag) => (
                      <span key={tag} className="post-tag-chip">
                        {toDisplayLabel(tag)}
                        <button
                          type="button"
                          onClick={() => setStyleTags((prev) => removeTagValue(prev, tag))}
                        >
                          remove
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="post-tag-empty">No style tags selected.</p>
                )}
              </div>

              <div className="post-tag-editor">
                <span>Color tags (optional)</span>
                <div className="post-tag-row">
                  <input
                    type="text"
                    value={colorTagInput}
                    onChange={(event) => setColorTagInput(event.target.value)}
                    onKeyDown={(event) => handleTagKeyDown(event, addColorTag, setColorTagInput)}
                    placeholder="Add color tag"
                  />
                  <button
                    type="button"
                    className="size-add"
                    onClick={() => {
                      addColorTag(colorTagInput);
                      setColorTagInput("");
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className="post-tag-suggestions">
                  {metadataOptions.suggestedColorTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`brand-chip ${colorTags.includes(tag) ? "selected" : ""}`}
                      onClick={() => addColorTag(tag)}
                    >
                      {toDisplayLabel(tag)}
                    </button>
                  ))}
                </div>
                {colorTags.length > 0 ? (
                  <div className="post-tag-list">
                    {colorTags.map((tag) => (
                      <span key={tag} className="post-tag-chip">
                        {toDisplayLabel(tag)}
                        <button
                          type="button"
                          onClick={() => setColorTags((prev) => removeTagValue(prev, tag))}
                        >
                          remove
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="post-tag-empty">No color tags selected.</p>
                )}
              </div>
            </>
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
