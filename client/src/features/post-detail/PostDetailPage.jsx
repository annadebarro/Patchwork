import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import ProfilePatch from "../../shared/ui/ProfilePatch";
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [soldBusy, setSoldBusy] = useState(false);
  const feedTelemetry = location.state?.feedTelemetry;
  const patchTelemetryContext = {
    feedType: typeof feedTelemetry?.feedType === "string" ? feedTelemetry.feedType : null,
    rankPosition: normalizeRankPosition(feedTelemetry?.rankPosition),
    algorithm: typeof feedTelemetry?.algorithm === "string" ? feedTelemetry.algorithm : null,
    requestId: typeof feedTelemetry?.requestId === "string" ? feedTelemetry.requestId : null,
  };

  useEffect(() => {
    let isMounted = true;

    async function fetchPost() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/posts/${postId}`, { headers });
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
    return () => { isMounted = false; };
  }, [postId]);

  const handleLikeChange = useCallback((liked, likeCount) => {
    setPost((prev) => prev ? { ...prev, userLiked: liked, likeCount } : prev);
  }, []);

  const isOwner = currentUser && post && currentUser.id === post.userId;

  async function saveEdit() {
    const token = localStorage.getItem("token");
    if (!token) return;
    setEditSaving(true);
    try {
      const payload = { caption: editCaption };
      if (post.type === "market" && editPrice !== "") {
        payload.priceCents = Math.round(Number(editPrice) * 100);
      }
      const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setPost((prev) => ({ ...prev, ...data.post }));
        setEditing(false);
      }
    } catch {
      // silent
    } finally {
      setEditSaving(false);
    }
  }

  async function deletePost() {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/sold`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
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

  const isMarket = post.type === "market";
  const priceLabel = isMarket && post.priceCents !== null ? formatPrice(post.priceCents) : "";
  const timestamp = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="feed-content">
      <div className="post-detail">
        <button
          className="back-button"
          type="button"
          onClick={() => navigate(-1)}
        >
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
              <ProfilePatch
                name={post.author?.name}
                imageUrl={post.author?.profilePicture}
              />
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
                <div className="post-edit-actions">
                  <button type="button" className="save-button save-button--sm" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? "Saving..." : "Save"}
                  </button>
                  <button type="button" className="cancel-button cancel-button--sm" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {post.caption && (
                  <p className="post-detail-caption">{post.caption}</p>
                )}
                {priceLabel && (
                  <p className="post-detail-price">{priceLabel}</p>
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
                    setEditPrice(isMarket && post.priceCents ? (post.priceCents / 100).toString() : "");
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
                    <button type="button" className="save-button save-button--sm" onClick={() => setDeleteConfirm(false)}>
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
