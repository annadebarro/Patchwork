import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import PatchLogo from "../../shared/ui/PatchLogo";
import ProfilePatch from "../../shared/ui/ProfilePatch";

function AuthedLayout({ user, onLogout, onOpenCreatePost }) {
  const navigate = useNavigate();
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [relativeNowMs, setRelativeNowMs] = useState(() => new Date().getTime());
  const pollRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setRelativeNowMs(new Date().getTime());
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
        setUnreadCount(data?.unreadCount || 0);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      fetchNotifications();
    }, 0);
    pollRef.current = setInterval(fetchNotifications, 30000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollRef.current);
    };
  }, [fetchNotifications]);

  async function openNotifPanel() {
    setNotifPanelOpen(true);
    setRelativeNowMs(new Date().getTime());
    if (unreadCount > 0) {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/notifications/read`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          setUnreadCount(0);
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        } catch {
          // silent
        }
      }
    }
  }

  function formatNotifMessage(notif) {
    const actor = notif.actor?.username || "Someone";
    switch (notif.type) {
      case "like":
        return `@${actor} liked your post`;
      case "comment":
        return `@${actor} commented on your post`;
      case "follow":
        return `@${actor} started following you`;
      case "patch":
        return `@${actor} saved your post to a quilt`;
      case "mention":
        return `@${actor} mentioned you in a comment`;
      case "comment_like":
        return `@${actor} liked your comment`;
      case "message":
        return `@${actor} sent you a message`;
      case "deal_complete":
        return `@${actor} marked the deal as complete`;
      case "rating":
        return `@${actor} left you a rating`;
      default:
        return `@${actor} interacted with you`;
    }
  }

  function formatTimeAgo(dateStr) {
    const diff = relativeNowMs - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  return (
    <div className="app-layout">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-profile">
          <PatchLogo className="patch-logo" />
        </div>
        <nav className="sidebar-nav">
          <NavLink
            to="/home"
            className={({ isActive }) => `sidebar-icon ${isActive ? "active" : ""}`}
            title="Home"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) => `sidebar-icon ${isActive ? "active" : ""}`}
            title="Search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.65" y1="16.65" x2="21" y2="21" />
            </svg>
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) => `sidebar-icon ${isActive ? "active" : ""}`}
            title="My profile"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </NavLink>
          <NavLink to="/messages" className={({ isActive }) => `sidebar-icon sidebar-icon--messages ${isActive ? "active" : ""}`} title="Messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </NavLink>
          {user?.role === "admin" && (
            <NavLink
              to="/admin/recommendations"
              className={({ isActive }) => `sidebar-icon ${isActive ? "active" : ""}`}
              title="Admin recommendations"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 15l3-3 2 2 5-5" />
              </svg>
            </NavLink>
          )}
          <button
            className={`sidebar-icon sidebar-icon--notif ${notifPanelOpen ? "active" : ""}`}
            title="Notifications"
            type="button"
            onClick={() => notifPanelOpen ? setNotifPanelOpen(false) : openNotifPanel()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
            )}
          </button>
          <button
            className="sidebar-icon"
            title="Create Post"
            type="button"
            onClick={onOpenCreatePost}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </nav>
        <button className="sidebar-logout" onClick={onLogout} type="button">
          Log out
        </button>
      </aside>

      {/* Notification Panel */}
      {notifPanelOpen && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <h3>Notifications</h3>
            <button
              type="button"
              className="notif-panel-close"
              onClick={() => setNotifPanelOpen(false)}
            >
              &times;
            </button>
          </div>
          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <p className="notif-empty">No notifications yet.</p>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  className={`notif-item ${!notif.read ? "notif-item--unread" : ""}`}
                  onClick={() => {
                    setNotifPanelOpen(false);
                    if (notif.type === "follow") {
                      navigate(`/userpage/${notif.actor?.username}`);
                    } else if (notif.type === "message") {
                      navigate("/messages", notif.conversationId ? { state: { activeConvoId: notif.conversationId } } : undefined);
                    } else if (notif.type === "deal_complete") {
                      navigate("/messages", { state: { activeConvoId: notif.conversationId, showRating: true } });
                    } else if (notif.type === "rating") {
                      navigate("/profile?tab=ratings");
                    } else if (notif.postId) {
                      navigate(`/post/${notif.postId}`);
                    }
                  }}
                >
                  <div className="notif-item-avatar">
                    <ProfilePatch
                      name={notif.actor?.name}
                      imageUrl={notif.actor?.profilePicture}
                    />
                  </div>
                  <div className="notif-item-content">
                    <p className="notif-item-text">{formatNotifMessage(notif)}</p>
                    <span className="notif-item-time">{formatTimeAgo(notif.createdAt)}</span>
                  </div>
                  {notif.post?.imageUrl && (
                    <img
                      className="notif-item-thumb"
                      src={notif.post.imageUrl}
                      alt=""
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}

export default AuthedLayout;
