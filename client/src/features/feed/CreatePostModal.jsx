import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import ImageCropper from "./ImageCropper";
import SortableThumbnails from "../../shared/ui/SortableThumbnails";

const MAX_IMAGES = 10;
let nextThumbId = 1;

function CreatePostModal({ isOpen, onClose, onCreated }) {
  const [type, setType] = useState(POST_TYPES.REGULAR);
  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Multi-image state
  // Each item: { id, file (cropped or original), previewUrl }
  const [imageItems, setImageItems] = useState([]);
  // Cropping queue: raw files waiting to be cropped
  const [cropQueue, setCropQueue] = useState([]);
  const [cropRawUrl, setCropRawUrl] = useState("");
  const [firstImageAspect, setFirstImageAspect] = useState(null);
  const fileInputRef = useRef(null);

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

  const isCropping = cropQueue.length > 0 && cropRawUrl;
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
      // Revoke all preview URLs
      imageItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setImageItems([]);
      setCropQueue([]);
      if (cropRawUrl) URL.revokeObjectURL(cropRawUrl);
      setCropRawUrl("");
      setFirstImageAspect(null);
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
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [isOpen, type]);

  useEffect(() => {
    if (!subcategoryOptions.includes(subcategory)) {
      setSubcategory(UNKNOWN);
    }
  }, [subcategory, subcategoryOptions]);

  // Start cropping the next file in the queue
  const startNextCrop = useCallback((queue) => {
    if (queue.length === 0) {
      setCropRawUrl("");
      return;
    }
    const rawFile = queue[0];
    setCropRawUrl(URL.createObjectURL(rawFile));
  }, []);

  function handleFileChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    const slotsLeft = MAX_IMAGES - imageItems.length;
    if (slotsLeft <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per post.`);
      return;
    }

    const toAdd = files.slice(0, slotsLeft);
    if (files.length > slotsLeft) {
      setError(`Only ${slotsLeft} more image${slotsLeft === 1 ? "" : "s"} can be added (max ${MAX_IMAGES}).`);
    }

    setCropQueue(toAdd);
    startNextCrop(toAdd);
  }

  function handleCropDone(croppedFile) {
    const previewUrl = URL.createObjectURL(croppedFile);
    const id = `thumb-${nextThumbId++}`;

    // If this is the first image overall, record its aspect for locking subsequent crops
    const isFirstImage = imageItems.length === 0 && cropQueue.length === cropQueue.length; // always first of this batch if no items yet
    if (imageItems.length === 0 && firstImageAspect === null) {
      // Detect aspect from cropped file
      const img = new Image();
      img.onload = () => {
        setFirstImageAspect(img.naturalWidth / img.naturalHeight);
        URL.revokeObjectURL(img.src);
      };
      img.src = previewUrl;
    }

    setImageItems((prev) => [...prev, { id, file: croppedFile, previewUrl }]);

    // Advance crop queue
    if (cropRawUrl) URL.revokeObjectURL(cropRawUrl);
    const remaining = cropQueue.slice(1);
    setCropQueue(remaining);
    startNextCrop(remaining);
  }

  function handleUseOriginal() {
    const rawFile = cropQueue[0];
    if (!rawFile) return;

    const previewUrl = cropRawUrl; // reuse the blob URL
    const id = `thumb-${nextThumbId++}`;

    if (imageItems.length === 0 && firstImageAspect === null) {
      const img = new Image();
      img.onload = () => {
        setFirstImageAspect(img.naturalWidth / img.naturalHeight);
      };
      img.src = previewUrl;
    }

    setImageItems((prev) => [...prev, { id, file: rawFile, previewUrl }]);

    const remaining = cropQueue.slice(1);
    setCropQueue(remaining);
    setCropRawUrl("");
    startNextCrop(remaining);
  }

  function handleChangeImage() {
    // Skip current crop, discard this file
    if (cropRawUrl) URL.revokeObjectURL(cropRawUrl);
    const remaining = cropQueue.slice(1);
    setCropQueue(remaining);
    startNextCrop(remaining);
  }

  function handleSkipCrop() {
    // Skip remaining crop queue entirely, use originals
    cropQueue.forEach((rawFile, i) => {
      if (i === 0 && cropRawUrl) {
        // First one already has a URL
        const id = `thumb-${nextThumbId++}`;
        setImageItems((prev) => [...prev, { id, file: rawFile, previewUrl: cropRawUrl }]);
      } else {
        const url = URL.createObjectURL(rawFile);
        const id = `thumb-${nextThumbId++}`;
        setImageItems((prev) => [...prev, { id, file: rawFile, previewUrl: url }]);
      }
    });
    setCropQueue([]);
    setCropRawUrl("");
  }

  function handleReorder(newItems) {
    setImageItems(newItems);
    // If order changed, update firstImageAspect from the new first image
    if (newItems.length > 0) {
      const img = new Image();
      img.onload = () => {
        setFirstImageAspect(img.naturalWidth / img.naturalHeight);
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(newItems[0].file);
    }
  }

  function handleDeleteThumb(id) {
    setImageItems((prev) => {
      const filtered = prev.filter((item) => {
        if (item.id === id) {
          URL.revokeObjectURL(item.previewUrl);
          return false;
        }
        return true;
      });
      return filtered;
    });
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

    if (imageItems.length === 0) {
      setError("Please select at least one image to upload.");
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
      // Upload all images
      const imageUrls = [];
      for (const item of imageItems) {
        const formData = new FormData();
        formData.append("file", item.file);
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

        const publicUrl = uploadData?.publicUrl;
        if (!publicUrl) {
          setError("Upload succeeded but no public URL was returned.");
          return;
        }
        imageUrls.push(publicUrl);
      }

      const payload = {
        type,
        caption: caption.trim(),
        imageUrls,
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

  // Determine locked aspect for 2nd+ images
  const currentCropIsFirst = imageItems.length === 0;
  const lockedAspect = currentCropIsFirst ? null : firstImageAspect;

  const thumbItems = imageItems.map((item) => ({
    id: item.id,
    url: item.previewUrl,
  }));

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

          <div>
            <label>
              Images ({imageItems.length}/{MAX_IMAGES})
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                disabled={isCropping}
              />
            </label>
          </div>

          {isCropping && (
            <div>
              <p className="field-note">
                Cropping image {imageItems.length + 1} of {imageItems.length + cropQueue.length}
                {cropQueue.length > 1 && (
                  <button type="button" className="cancel-button cancel-button--sm" style={{ marginLeft: 8 }} onClick={handleSkipCrop}>
                    Skip remaining crops
                  </button>
                )}
              </p>
              <ImageCropper
                imageUrl={cropRawUrl}
                onCropDone={handleCropDone}
                onChangeImage={handleChangeImage}
                onUseOriginal={currentCropIsFirst ? handleUseOriginal : undefined}
                lockedAspect={lockedAspect}
              />
            </div>
          )}

          {!isCropping && imageItems.length > 0 && (
            <div>
              <SortableThumbnails
                items={thumbItems}
                onReorder={(newOrder) => {
                  const idMap = new Map(imageItems.map((item) => [item.id, item]));
                  handleReorder(newOrder.map((t) => idMap.get(t.id)));
                }}
                onDelete={handleDeleteThumb}
              />
              {imageItems.length < MAX_IMAGES && (
                <button
                  type="button"
                  className="cancel-button cancel-button--sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add more images
                </button>
              )}
            </div>
          )}

          <button type="submit" className="save-button" disabled={submitting || isCropping}>
            {submitting ? "Uploading..." : "Share post"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CreatePostModal;
