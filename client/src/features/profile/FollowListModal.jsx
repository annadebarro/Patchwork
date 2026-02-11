import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";
import ProfilePatch from "../../shared/ui/ProfilePatch";

function FollowListModal({ userId, type, currentUserId, onClose, onCountChange }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    async function fetchList() {
      setLoading(true);
      const token = localStorage.getItem("token");

      try {
        const res = await apiFetch(`/follows/${userId}/${type}`, {
          token,
          surface: REQUEST_SURFACES.PROFILE,
        });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setUsers(Array.isArray(data?.users) ? data.users : []);
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchList();
    return () => { isMounted = false; };
  }, [userId, type]);

  async function toggleFollow(targetUserId, currentlyFollowing) {
    const token = localStorage.getItem("token");
    if (!token) return;

    const method = currentlyFollowing ? "DELETE" : "POST";
    try {
      const res = await apiFetch(`/follows/${targetUserId}`, {
        method,
        auth: true,
        surface: REQUEST_SURFACES.PROFILE,
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUserId ? { ...u, isFollowing: !currentlyFollowing } : u
          )
        );
        if (onCountChange) {
          onCountChange(currentlyFollowing ? -1 : 1);
        }
      }
    } catch (err) {
      console.error("Follow toggle failed:", err);
    }
  }

  const title = type === "followers" ? "Followers" : "Following";

  return (
    <div className="create-post-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="follow-list-modal" onClick={(e) => e.stopPropagation()}>
        <div className="create-post-header">
          <h2>{title}</h2>
          <button type="button" className="create-post-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="follow-list-body">
          {loading ? (
            <p className="comment-empty">Loading...</p>
          ) : users.length === 0 ? (
            <p className="comment-empty">No {type} yet.</p>
          ) : (
            users.map((u) => (
              <div key={u.id} className="follow-list-item">
                <button
                  type="button"
                  className="follow-list-item-link"
                  onClick={() => {
                    onClose();
                    navigate(`/userpage/${u.username}`);
                  }}
                >
                  <ProfilePatch name={u.name} imageUrl={u.profilePicture} />
                  <div className="follow-list-item-info">
                    <span className="follow-list-item-name">{u.name}</span>
                    <span className="follow-list-item-handle">@{u.username}</span>
                  </div>
                </button>
                {currentUserId && currentUserId !== u.id && (
                  <button
                    type="button"
                    className={`follow-button follow-button--sm ${u.isFollowing ? "follow-button--following" : ""}`}
                    onClick={() => toggleFollow(u.id, u.isFollowing)}
                  >
                    {u.isFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default FollowListModal;
