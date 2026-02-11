import { useEffect, useMemo, useState } from "react";
import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";
import CommentLikeButton from "./CommentLikeButton";

function CommentSection({ postId, postOwnerId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const currentUserId = useMemo(() => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return null;
      return JSON.parse(atob(token.split(".")[1])).id;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchComments() {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await apiFetch(`/posts/${postId}/comments`, {
          surface: REQUEST_SURFACES.POST_DETAIL,
          token,
        });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setComments(Array.isArray(data?.comments) ? data.comments : []);
        }
      } catch {
        // silent fail
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchComments();
    return () => { isMounted = false; };
  }, [postId]);

  function startReply(comment, topLevelId) {
    // If topLevelId is provided, the comment is a reply — nest under the top-level parent
    setReplyingTo({ id: topLevelId || comment.id, username: comment.author?.username });
    setBody(`@${comment.author?.username} `);
  }

  function cancelReply() {
    setReplyingTo(null);
    setBody("");
  }

  async function handleDelete(commentId, parentId) {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await apiFetch(`/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        auth: true,
        surface: REQUEST_SURFACES.POST_DETAIL,
      });
      if (res.ok) {
        if (parentId) {
          // Remove reply from its parent
          setComments((prev) =>
            prev.map((c) =>
              c.id === parentId
                ? { ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) }
                : c
            )
          );
        } else {
          // Remove top-level comment
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      }
    } catch (err) {
      console.error("Comment delete failed:", err);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!body.trim() || submitting) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setSubmitting(true);
    try {
      const payload = { body: body.trim() };
      if (replyingTo) {
        payload.parentId = replyingTo.id;
      }

      const res = await apiFetch(`/posts/${postId}/comments`, {
        method: "POST",
        auth: true,
        surface: REQUEST_SURFACES.POST_DETAIL,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse(res);
      if (res.ok && data?.comment) {
        if (replyingTo) {
          // Add reply under its parent
          setComments((prev) =>
            prev.map((c) =>
              c.id === replyingTo.id
                ? { ...c, replies: [...(c.replies || []), data.comment] }
                : c
            )
          );
        } else {
          setComments((prev) => [...prev, { ...data.comment, replies: [] }]);
        }
        setBody("");
        setReplyingTo(null);
      }
    } catch (err) {
      console.error("Comment submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  function canDelete(comment) {
    if (!currentUserId) return false;
    return comment.userId === currentUserId || postOwnerId === currentUserId;
  }

  return (
    <div className="comment-section">
      <h3 className="comment-section-title">Comments</h3>
      <div className="comment-list">
        {loading ? (
          <p className="comment-empty">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="comment-empty">No comments yet. Be the first!</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="comment-item">
              <div className="comment-item-row">
                <span className="comment-author">@{c.author?.username}</span>
                <span className="comment-body">{c.body}</span>
              </div>
              <div className="comment-actions">
                <CommentLikeButton postId={postId} commentId={c.id} initialLiked={c.userLiked} initialCount={c.likeCount} />
                <button
                  type="button"
                  className="comment-reply-btn"
                  onClick={() => startReply(c)}
                >
                  Reply
                </button>
                {canDelete(c) && (
                  <button
                    type="button"
                    className="comment-delete-btn"
                    onClick={() => handleDelete(c.id, null)}
                  >
                    Delete
                  </button>
                )}
              </div>
              {c.replies && c.replies.length > 0 && (
                <div className="comment-replies">
                  {c.replies.map((r) => (
                    <div key={r.id} className="comment-item">
                      <div className="comment-item-row">
                        <span className="comment-author">@{r.author?.username}</span>
                        <span className="comment-body">{r.body}</span>
                      </div>
                      <div className="comment-actions">
                        <CommentLikeButton postId={postId} commentId={r.id} initialLiked={r.userLiked} initialCount={r.likeCount} />
                        <button
                          type="button"
                          className="comment-reply-btn"
                          onClick={() => startReply(r, c.id)}
                        >
                          Reply
                        </button>
                        {canDelete(r) && (
                          <button
                            type="button"
                            className="comment-delete-btn"
                            onClick={() => handleDelete(r.id, c.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {replyingTo && (
        <div className="comment-replying-indicator">
          Replying to @{replyingTo.username}
          <button type="button" className="comment-reply-btn" onClick={cancelReply}>
            Cancel
          </button>
        </div>
      )}
      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="comment-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Add a comment..."}
          maxLength={1000}
        />
        <button
          type="submit"
          className="comment-submit"
          disabled={submitting || !body.trim()}
        >
          {submitting ? "..." : "Post"}
        </button>
      </form>
    </div>
  );
}

export default CommentSection;
