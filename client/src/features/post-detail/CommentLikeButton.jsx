import { useState } from "react";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";

function CommentLikeButton({ postId, commentId, initialLiked, initialCount }) {
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [count, setCount] = useState(initialCount || 0);
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    if (busy) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setBusy(true);
    const method = liked ? "DELETE" : "POST";
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments/${commentId}/like`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setLiked(data.liked);
        setCount(data.likeCount);
      }
    } catch (err) {
      console.error("Comment like toggle failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`comment-like-btn ${liked ? "comment-like-btn--active" : ""}`}
      onClick={toggleLike}
      disabled={busy}
    >
      <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

export default CommentLikeButton;
