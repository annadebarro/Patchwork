import { useState } from "react";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import StarRating from "../../shared/ui/StarRating";

function RatingModal({ isOpen, onClose, conversationId, rateeUser, onSubmitted }) {
  const [score, setScore] = useState(0);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (score < 1) {
      setError("Please select a star rating.");
      return;
    }
    setSubmitting(true);
    setError("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          rateeId: rateeUser?.id,
          score,
          review: review.trim() || undefined,
        }),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        if (onSubmitted) onSubmitted(data.rating);
        onClose();
      } else {
        setError(data?.message || "Failed to submit rating.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="create-post-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="create-post-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="create-post-header">
          <h2>Rate your experience</h2>
          <button type="button" className="create-post-close" onClick={onClose}>
            Close
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "16px 24px 24px" }}>
          <p style={{ marginBottom: 12 }}>
            How was your experience with <strong>{rateeUser?.name || rateeUser?.username || "this user"}</strong>?
          </p>
          <StarRating value={score} onChange={setScore} size="md" />
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Leave an optional review..."
            rows={3}
            maxLength={500}
            className="quilt-edit-input"
            style={{ width: "100%", marginTop: 12 }}
          />
          {error && <p className="post-tag-empty" style={{ marginTop: 8 }}>{error}</p>}
          <div className="post-edit-actions" style={{ marginTop: 16 }}>
            <button
              type="submit"
              className="save-button save-button--sm"
              disabled={submitting || score < 1}
            >
              {submitting ? "Submitting..." : "Submit rating"}
            </button>
            <button
              type="button"
              className="cancel-button cancel-button--sm"
              onClick={onClose}
            >
              Skip
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RatingModal;
