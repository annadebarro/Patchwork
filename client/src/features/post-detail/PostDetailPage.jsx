import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";
import ProfilePatch from "../../shared/ui/ProfilePatch";
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
import LikeButton from "./LikeButton";
import PatchButton from "./PatchButton";
import CommentSection from "./CommentSection";

function formatPrice(priceCents) {
  if (!Number.isFinite(priceCents)) return "";
  return `$${(priceCents / 100).toFixed(2)}`;
}

function normalizeRankPosition(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry.trim());
}

function PostDetailPage({ currentUser }) {
  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [soldBusy, setSoldBusy] = useState(false);

  const [metadataOptions, setMetadataOptions] = useState(() =>
    getFallbackPostMetadataOptions({ type: POST_TYPES.REGULAR })
  );
  const [editCategory, setEditCategory] = useState(UNKNOWN);
  const [editSubcategory, setEditSubcategory] = useState(UNKNOWN);
  const [editBrand, setEditBrand] = useState("");
  const [editCondition, setEditCondition] = useState(UNKNOWN);
  const [editSizeLabel, setEditSizeLabel] = useState(UNKNOWN);
  const [editStyleTags, setEditStyleTags] = useState([]);
  const [editColorTags, setEditColorTags] = useState([]);
  const [editStyleTagInput, setEditStyleTagInput] = useState("");
  const [editColorTagInput, setEditColorTagInput] = useState("");

  const feedTelemetry = location.state?.feedTelemetry;
  const patchTelemetryContext = {
    feedType: typeof feedTelemetry?.feedType === "string" ? feedTelemetry.feedType : null,
    rankPosition: normalizeRankPosition(feedTelemetry?.rankPosition),
    algorithm: typeof feedTelemetry?.algorithm === "string" ? feedTelemetry.algorithm : null,
    requestId: typeof feedTelemetry?.requestId === "string" ? feedTelemetry.requestId : null,
  };

  const editSubcategoryOptions = useMemo(() => {
    const options = metadataOptions?.subcategoriesByCategory?.[editCategory];
    return Array.isArray(options) && options.length > 0 ? options : [UNKNOWN];
  }, [editCategory, metadataOptions]);

  useEffect(() => {
    if (!post?.type) return;

    let ignore = false;
    const postType = post.type;
    setMetadataOptions(getFallbackPostMetadataOptions({ type: postType }));

    fetchPostMetadataOptions({ type: postType })
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
  }, [post?.type]);

  useEffect(() => {
    if (!editSubcategoryOptions.includes(editSubcategory)) {
      setEditSubcategory(UNKNOWN);
    }
  }, [editSubcategory, editSubcategoryOptions]);

  useEffect(() => {
    let isMounted = true;

    async function fetchPost() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");

        const res = await apiFetch(`/posts/${postId}`, {
          method: "GET",
          auth: Boolean(token),
          surface: REQUEST_SURFACES.POST_DETAIL,
        });
        const data = await parseApiResponse(res);
        if (!res.ok) {
          if (isMounted) setError(data?.message || "Failed to load post.");
        } else if (isMounted) {
          setPost(data.post);
        }
      } catch {
        if (isMounted) setError("Network error while loading post.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPost();
    return () => {
      isMounted = false;
    };
  }, [postId]);

  const handleLikeChange = useCallback((liked, likeCount) => {
    setPost((prev) => (prev ? { ...prev, userLiked: liked, likeCount } : prev));
  }, []);

  const isOwner = currentUser && post && currentUser.id === post.userId;

  function addEditStyleTag(rawTag) {
    setEditStyleTags((prev) => addTagValue(prev, rawTag, MAX_STYLE_TAGS));
  }

  function addEditColorTag(rawTag) {
    setEditColorTags((prev) => addTagValue(prev, rawTag, MAX_COLOR_TAGS));
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

  async function saveEdit() {
    const token = localStorage.getItem("token");
    if (!token) return;

    setEditSaving(true);
    setEditError("");
    try {
      if (
        post.type === POST_TYPES.MARKET &&
        (editCategory === UNKNOWN || editCondition === UNKNOWN || editSizeLabel === UNKNOWN)
      ) {
        setEditError("Marketplace posts require category, condition, and size.");
        return;
      }

      const payload = {
        caption: editCaption,
        brand: editBrand,
        styleTags: editStyleTags,
        colorTags: editColorTags,
      };

      if (post.type === POST_TYPES.MARKET) {
        payload.category = editCategory;
        payload.subcategory = editSubcategory;
        payload.condition = editCondition;
        payload.sizeLabel = editSizeLabel;
        payload.priceCents = editPrice === "" ? null : Math.round(Number(editPrice) * 100);
      }

      const res = await apiFetch(`/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        auth: true,
        surface: REQUEST_SURFACES.POST_DETAIL,
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setPost((prev) => ({ ...prev, ...data.post }));
        setEditing(false);
      } else if (data?.message) {
        setEditError(data.message);
      }
    } catch {
      setEditError("Network error while saving post edits.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deletePost() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await apiFetch(`/posts/${postId}`, {
        method: "DELETE",
        auth: true,
        surface: REQUEST_SURFACES.POST_DETAIL,
      });
      if (res.ok) {
        navigate(-1);
      }
    } catch {
      // silent
    }
  }

  async function toggleSold() {
    const token = localStorage.getItem("token");
    if (!token || soldBusy) return;

    setSoldBusy(true);
    try {
      const res = await apiFetch(`/posts/${postId}/sold`, {
        method: "PATCH",
        auth: true,
        surface: REQUEST_SURFACES.POST_DETAIL,
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setPost((prev) => ({ ...prev, isSold: data.post.isSold }));
      }
    } catch {
      // silent
    } finally {
      setSoldBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="feed-content">
        <div className="feed-empty">Loading post...</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="feed-content">
        <div className="feed-empty">{error || "Post not found."}</div>
      </div>
    );
  }

  const isMarket = post.type === POST_TYPES.MARKET;
  const priceLabel = isMarket && post.priceCents !== null ? formatPrice(post.priceCents) : "";
  const timestamp = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const styleTags = normalizeTags(post.styleTags);
  const colorTags = normalizeTags(post.colorTags);

  const hasMetadata = isMarket
    ? (post.category && post.category !== UNKNOWN) ||
      (post.subcategory && post.subcategory !== UNKNOWN) ||
      (post.condition && post.condition !== UNKNOWN) ||
      (post.sizeLabel && post.sizeLabel !== UNKNOWN) ||
      !!post.brand ||
      styleTags.length > 0 ||
      colorTags.length > 0
    : !!post.brand || styleTags.length > 0 || colorTags.length > 0;

  return (
    <div className="feed-content">
      <div className="post-detail">
        <button className="back-button" type="button" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="post-detail-card">
          <div className="post-detail-image-wrap">
            <img src={post.imageUrl} alt={post.caption || "Post"} className="post-detail-image" />
            {post.isSold && <div className="sold-badge sold-badge--detail">SOLD</div>}
          </div>

          <div className="post-detail-body">
            <div className="post-detail-author-row">
              <ProfilePatch name={post.author?.name} imageUrl={post.author?.profilePicture} />
              <div className="post-detail-author-info">
                <button
                  type="button"
                  className="post-detail-author-link"
                  onClick={() => navigate(`/userpage/${post.author?.username}`)}
                >
                  @{post.author?.username}
                </button>
                {timestamp && <span className="post-detail-timestamp">{timestamp}</span>}
              </div>
            </div>

            {editing ? (
              <div className="post-edit-inline">
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="quilt-edit-input"
                  rows={3}
                  maxLength={2000}
                />

                {isMarket && (
                  <label className="post-edit-price-label">
                    Price (USD)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="quilt-edit-input"
                    />
                  </label>
                )}

                {isMarket && metadataOptions?.fields?.category && (
                  <div className="post-metadata-grid">
                    <label>
                      Category*
                      <select value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>
                        {metadataOptions.categories.map((entry) => (
                          <option key={entry} value={entry}>
                            {toDisplayLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Subcategory
                      <select
                        value={editSubcategory}
                        onChange={(event) => setEditSubcategory(event.target.value)}
                      >
                        {editSubcategoryOptions.map((entry) => (
                          <option key={entry} value={entry}>
                            {toDisplayLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Condition*
                      <select value={editCondition} onChange={(event) => setEditCondition(event.target.value)}>
                        {metadataOptions.conditions.map((entry) => (
                          <option key={entry} value={entry}>
                            {toDisplayLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Size*
                      <select value={editSizeLabel} onChange={(event) => setEditSizeLabel(event.target.value)}>
                        {metadataOptions.sizeLabels.map((entry) => (
                          <option key={entry} value={entry}>
                            {toDisplayLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <label className="post-edit-price-label">
                  Brand
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(event) => setEditBrand(event.target.value)}
                    className="quilt-edit-input"
                    maxLength={50}
                    list="edit-post-brand-options"
                  />
                  <datalist id="edit-post-brand-options">
                    {metadataOptions.suggestedBrands.map((entry) => (
                      <option key={entry} value={entry} />
                    ))}
                  </datalist>
                </label>

                <div className="post-tag-editor">
                  <span>{isMarket ? "Style tags" : "Style/Vibe tags"}</span>
                  <div className="post-tag-row">
                    <input
                      type="text"
                      value={editStyleTagInput}
                      onChange={(event) => setEditStyleTagInput(event.target.value)}
                      onKeyDown={(event) => handleTagKeyDown(event, addEditStyleTag, setEditStyleTagInput)}
                      placeholder="Add style tag"
                    />
                    <button
                      type="button"
                      className="size-add"
                      onClick={() => {
                        addEditStyleTag(editStyleTagInput);
                        setEditStyleTagInput("");
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
                        className={`brand-chip ${editStyleTags.includes(tag) ? "selected" : ""}`}
                        onClick={() => addEditStyleTag(tag)}
                      >
                        {toDisplayLabel(tag)}
                      </button>
                    ))}
                  </div>
                  {editStyleTags.length > 0 ? (
                    <div className="post-tag-list">
                      {editStyleTags.map((tag) => (
                        <span key={tag} className="post-tag-chip">
                          {toDisplayLabel(tag)}
                          <button
                            type="button"
                            onClick={() => setEditStyleTags((prev) => removeTagValue(prev, tag))}
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
                  <span>Color tags</span>
                  <div className="post-tag-row">
                    <input
                      type="text"
                      value={editColorTagInput}
                      onChange={(event) => setEditColorTagInput(event.target.value)}
                      onKeyDown={(event) => handleTagKeyDown(event, addEditColorTag, setEditColorTagInput)}
                      placeholder="Add color tag"
                    />
                    <button
                      type="button"
                      className="size-add"
                      onClick={() => {
                        addEditColorTag(editColorTagInput);
                        setEditColorTagInput("");
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
                        className={`brand-chip ${editColorTags.includes(tag) ? "selected" : ""}`}
                        onClick={() => addEditColorTag(tag)}
                      >
                        {toDisplayLabel(tag)}
                      </button>
                    ))}
                  </div>
                  {editColorTags.length > 0 ? (
                    <div className="post-tag-list">
                      {editColorTags.map((tag) => (
                        <span key={tag} className="post-tag-chip">
                          {toDisplayLabel(tag)}
                          <button
                            type="button"
                            onClick={() => setEditColorTags((prev) => removeTagValue(prev, tag))}
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

                <div className="post-edit-actions">
                  <button
                    type="button"
                    className="save-button save-button--sm"
                    onClick={saveEdit}
                    disabled={editSaving}
                  >
                    {editSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    className="cancel-button cancel-button--sm"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
                {editError && <p className="post-tag-empty">{editError}</p>}
              </div>
            ) : (
              <>
                {post.caption && <p className="post-detail-caption">{post.caption}</p>}
                {priceLabel && <p className="post-detail-price">{priceLabel}</p>}

                {hasMetadata && (
                  <div className="post-detail-metadata">
                    {isMarket ? (
                      <div className="post-detail-metadata-grid">
                        <div className="post-detail-metadata-item">
                          <span className="post-detail-metadata-label">Category</span>
                          <span>{toDisplayLabel(post.category || UNKNOWN)}</span>
                        </div>
                        <div className="post-detail-metadata-item">
                          <span className="post-detail-metadata-label">Subcategory</span>
                          <span>{toDisplayLabel(post.subcategory || UNKNOWN)}</span>
                        </div>
                        <div className="post-detail-metadata-item">
                          <span className="post-detail-metadata-label">Condition</span>
                          <span>{toDisplayLabel(post.condition || UNKNOWN)}</span>
                        </div>
                        <div className="post-detail-metadata-item">
                          <span className="post-detail-metadata-label">Size</span>
                          <span>{toDisplayLabel(post.sizeLabel || UNKNOWN)}</span>
                        </div>
                        <div className="post-detail-metadata-item">
                          <span className="post-detail-metadata-label">Brand</span>
                          <span>{post.brand || "Unspecified"}</span>
                        </div>
                      </div>
                    ) : (
                      !!post.brand && (
                        <div className="post-detail-metadata-item">
                          <span className="post-detail-metadata-label">Brand</span>
                          <span>{post.brand}</span>
                        </div>
                      )
                    )}

                    {styleTags.length > 0 && (
                      <div>
                        <span className="post-detail-metadata-label">
                          {isMarket ? "Style tags" : "Style/Vibe tags"}
                        </span>
                        <div className="post-detail-tag-list">
                          {styleTags.map((tag) => (
                            <span key={tag} className="post-detail-tag">
                              {toDisplayLabel(tag)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {colorTags.length > 0 && (
                      <div>
                        <span className="post-detail-metadata-label">Color tags</span>
                        <div className="post-detail-tag-list">
                          {colorTags.map((tag) => (
                            <span key={tag} className="post-detail-tag">
                              {toDisplayLabel(tag)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="post-detail-actions">
              <LikeButton
                postId={post.id}
                initialLiked={post.userLiked}
                initialCount={post.likeCount}
                onLikeChange={handleLikeChange}
              />
              <PatchButton postId={post.id} telemetryContext={patchTelemetryContext} />
            </div>

            {isOwner && !editing && (
              <div className="post-owner-actions">
                <button
                  type="button"
                  className="save-button save-button--sm"
                  onClick={() => {
                    setEditCaption(post.caption || "");
                    setEditPrice(
                      isMarket && Number.isFinite(post.priceCents)
                        ? (post.priceCents / 100).toString()
                        : ""
                    );
                    setEditCategory(post.category || UNKNOWN);
                    setEditSubcategory(post.subcategory || UNKNOWN);
                    setEditBrand(post.brand || "");
                    setEditCondition(post.condition || UNKNOWN);
                    setEditSizeLabel(post.sizeLabel || UNKNOWN);
                    setEditStyleTags(normalizeTags(post.styleTags));
                    setEditColorTags(normalizeTags(post.colorTags));
                    setEditStyleTagInput("");
                    setEditColorTagInput("");
                    setEditError("");
                    setEditing(true);
                  }}
                >
                  Edit
                </button>
                {isMarket && (
                  <button
                    type="button"
                    className={`save-button save-button--sm ${post.isSold ? "sold-toggle--sold" : ""}`}
                    onClick={toggleSold}
                    disabled={soldBusy}
                  >
                    {post.isSold ? "Mark as Available" : "Mark as Sold"}
                  </button>
                )}
                {deleteConfirm ? (
                  <>
                    <span className="post-delete-confirm-text">Delete this post?</span>
                    <button type="button" className="cancel-button cancel-button--sm" onClick={deletePost}>
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      className="save-button save-button--sm"
                      onClick={() => setDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="quilt-delete-btn"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}

            <CommentSection postId={post.id} postOwnerId={post.userId} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PostDetailPage;
