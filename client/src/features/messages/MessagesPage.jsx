import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import ProfilePatch from "../../shared/ui/ProfilePatch";
import RatingModal from "./RatingModal";

function MessagesPage({ currentUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [activeConvoId, setActiveConvoId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgBody, setMsgBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [convoDetail, setConvoDetail] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTarget, setRatingTarget] = useState(null);
  const [ratingConvoId, setRatingConvoId] = useState(null);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const conversationsRef = useRef([]);
  const activeConvoIdRef = useRef(null);
  const showRatingAfterLoadRef = useRef(false);
  const SEARCH_USERS_LIMIT = 20;

  // Keep refs in sync so socket handlers and effects always see fresh values
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConvoIdRef.current = activeConvoId;
  }, [activeConvoId]);

  // Fetch conversations
  useEffect(() => {
    async function fetchConversations() {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/messages/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiResponse(res);
        if (res.ok) {
          setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchConversations();
  }, []);

  // Auto-select conversation from URL query param or navigation state
  useEffect(() => {
    const stateConvoId = location.state?.activeConvoId;
    const stateShowRating = location.state?.showRating;
    const convoParam = searchParams.get("convo");

    if (stateConvoId && conversations.length > 0) {
      const match = conversations.find((c) => c.id === stateConvoId);
      if (match) {
        if (stateShowRating) {
          if (activeConvoIdRef.current === stateConvoId) {
            // Already viewing this conversation — fetchMessages won't re-run,
            // so show the rating modal immediately using ref data
            openRatingModalForConvo(stateConvoId);
          } else {
            setActiveConvoId(stateConvoId);
            showRatingAfterLoadRef.current = true;
          }
        } else {
          setActiveConvoId(stateConvoId);
        }
      }
      navigate(location.pathname, { replace: true, state: {} });
    } else if (convoParam && conversations.length > 0) {
      const match = conversations.find((c) => c.id === convoParam);
      if (match) setActiveConvoId(convoParam);
      setSearchParams({}, { replace: true });
    }
  }, [conversations, searchParams, setSearchParams, location.state, location.pathname, navigate]);

  // Socket.IO connection
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let socket;
    async function connectSocket() {
      const { io } = await import("socket.io-client");
      const socketUrl = API_BASE_URL.replace("/api", "");
      socket = io(socketUrl || window.location.origin, {
        auth: { token },
      });
      socketRef.current = socket;

      socket.on("new_message", ({ message, conversationId }) => {
        if (conversationId === activeConvoId) {
          setMessages((prev) => [...prev, message]);
        }
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [message], updatedAt: new Date().toISOString() }
              : c
          );
          updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          return updated;
        });
      });

      socket.on("conversation_updated", ({ conversation }) => {
        setConversations((prev) => {
          if (prev.find((c) => c.id === conversation.id)) return prev;
          return [conversation, ...prev];
        });
      });

      socket.on("deal_completed", ({ conversationId }) => {
        // Update conversations list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, dealStatus: "completed" } : c
          )
        );
        // Update convoDetail if currently viewing this conversation
        setConvoDetail((prev) => {
          if (!prev || prev.id !== conversationId) return prev;
          return { ...prev, dealStatus: "completed" };
        });

        // Show the rating modal — use ref for freshest participant data
        // Small timeout lets state updates above settle first
        setTimeout(() => {
          const convo = conversationsRef.current.find((c) => c.id === conversationId);
          const participants = convo?.participants || [];
          const other = participants.find((p) => p.user?.id !== currentUser?.id);
          if (other?.user) {
            setRatingTarget(other.user);
            setRatingConvoId(conversationId);
            setShowRatingModal(true);
          }
        }, 0);
      });
    }

    connectSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [activeConvoId, currentUser?.id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConvoId) {
      setMessages([]);
      setConvoDetail(null);
      return;
    }

    let isMounted = true;
    async function fetchMessages() {
      setMsgLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/messages/conversations/${activeConvoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setMessages(Array.isArray(data?.messages) ? data.messages : []);
          const convo = data?.conversation || null;
          setConvoDetail(convo);

          // If navigated from a "deal complete" notification, show the rating modal
          if (showRatingAfterLoadRef.current && convo?.dealStatus === "completed") {
            showRatingAfterLoadRef.current = false;
            const other = (convo.participants || []).find(
              (p) => p.user?.id !== currentUser?.id
            );
            if (other?.user) {
              setRatingTarget(other.user);
              setRatingConvoId(convo.id);
              setShowRatingModal(true);
            }
          }
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setMsgLoading(false);
      }
    }
    fetchMessages();
    return () => { isMounted = false; };
  }, [activeConvoId]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!msgBody.trim() || sending || !activeConvoId) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/messages/conversations/${activeConvoId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: msgBody.trim() }),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setMessages((prev) => [...prev, data.message]);
        setMsgBody("");
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === activeConvoId
              ? { ...c, messages: [data.message], updatedAt: new Date().toISOString() }
              : c
          );
          updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          return updated;
        });
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  const searchUsers = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const token = localStorage.getItem("token");
    try {
      const params = new URLSearchParams();
      params.set("q", query.trim());
      params.set("tab", "users");
      params.set("limit", String(SEARCH_USERS_LIMIT));

      const res = await fetch(`${API_BASE_URL}/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setSearchResults(
          (Array.isArray(data?.items) ? data.items : []).filter(
            (u) => u.id !== currentUser?.id
          )
        );
      }
    } catch {
      // silent
    } finally {
      setSearchLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim()) searchUsers(searchQuery);
      else setSearchResults([]);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, searchUsers]);

  async function startConversation() {
    if (!selectedUsers.length) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/messages/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantIds: selectedUsers.map((u) => u.id) }),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        const convo = data.conversation;
        if (!data.existing) {
          setConversations((prev) => [convo, ...prev]);
        }
        setActiveConvoId(convo.id);
        setNewConvoOpen(false);
        setSelectedUsers([]);
        setSearchQuery("");
        setSearchResults([]);
      }
    } catch {
      // silent
    }
  }

  async function deleteConversation(convoId) {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/messages/conversations/${convoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convoId));
        if (activeConvoId === convoId) {
          setActiveConvoId(null);
        }
        setDeleteConfirmId(null);
      }
    } catch {
      // silent
    }
  }

  function openRatingModalForConvo(conversationId) {
    const convo = conversationsRef.current.find((c) => c.id === conversationId);
    const participants = convo?.participants || convoDetail?.participants || [];
    const other = participants.find((p) => p.user?.id !== currentUser?.id);
    if (other?.user) {
      setRatingTarget(other.user);
      setRatingConvoId(conversationId);
      setShowRatingModal(true);
    }
  }

  async function markDealComplete() {
    if (markingComplete || !activeConvoId) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setMarkingComplete(true);
    try {
      const res = await fetch(`${API_BASE_URL}/messages/conversations/${activeConvoId}/complete`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConvoDetail((prev) => prev ? { ...prev, dealStatus: "completed" } : prev);
        setConversations((prev) =>
          prev.map((c) => c.id === activeConvoId ? { ...c, dealStatus: "completed" } : c)
        );
        // The socket event will trigger the modal for both parties,
        // but show it immediately for the person who clicked too
        openRatingModalForConvo(activeConvoId);
      }
    } catch {
      // silent
    } finally {
      setMarkingComplete(false);
    }
  }

  function getConvoName(convo) {
    const others = (convo.participants || [])
      .filter((p) => p.user?.id !== currentUser?.id)
      .map((p) => p.user?.name || p.user?.username || "Unknown");
    return others.join(", ") || "Conversation";
  }

  function getConvoAvatar(convo) {
    const other = (convo.participants || []).find((p) => p.user?.id !== currentUser?.id);
    return other?.user || null;
  }

  function formatMsgTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const showDealCompleteBtn =
    convoDetail &&
    convoDetail.linkedPostId &&
    convoDetail.dealStatus !== "completed";

  return (
    <div className="feed-content">
      <div className="messages-page">
        {/* Conversation List */}
        <div className="conversations-list">
          <div className="conversations-list-header">
            <h2>Messages</h2>
            <button
              type="button"
              className="new-convo-btn"
              onClick={() => setNewConvoOpen(true)}
              title="New conversation"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="12" y1="8" x2="12" y2="14" />
                <line x1="9" y1="11" x2="15" y2="11" />
              </svg>
            </button>
          </div>

          {loading ? (
            <p className="comment-empty">Loading...</p>
          ) : conversations.length === 0 ? (
            <p className="comment-empty">No conversations yet.</p>
          ) : (
            conversations.map((convo) => {
              const lastMsg = convo.messages?.[0];
              const convoUser = getConvoAvatar(convo);
              return (
                <div
                  key={convo.id}
                  className={`conversation-item${activeConvoId === convo.id ? " conversation-item--active" : ""}`}
                >
                  <button
                    type="button"
                    className="conversation-item-btn"
                    onClick={() => setActiveConvoId(convo.id)}
                  >
                    <ProfilePatch name={convoUser?.name} imageUrl={convoUser?.profilePicture} />
                    <div className="conversation-item-info">
                      <span className="conversation-item-name">{getConvoName(convo)}</span>
                      {lastMsg && (
                        <span className="conversation-item-preview">
                          {lastMsg.sender?.id === currentUser?.id ? "You: " : ""}
                          {lastMsg.body?.substring(0, 40)}{lastMsg.body?.length > 40 ? "..." : ""}
                        </span>
                      )}
                    </div>
                    {lastMsg && (
                      <span className="conversation-item-time">
                        {formatMsgTime(lastMsg.createdAt)}
                      </span>
                    )}
                  </button>
                  {deleteConfirmId === convo.id ? (
                    <div className="conversation-delete-confirm">
                      <button type="button" className="cancel-button cancel-button--sm" onClick={() => deleteConversation(convo.id)}>
                        Delete
                      </button>
                      <button type="button" className="save-button save-button--sm" onClick={() => setDeleteConfirmId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="conversation-delete-btn"
                      onClick={() => setDeleteConfirmId(convo.id)}
                      title="Leave conversation"
                    >
                      &times;
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Chat Panel */}
        <div className="chat-panel">
          {activeConvoId ? (
            <>
              <div className="chat-header">
                <h3>
                  {convoDetail ? (
                    convoDetail.participants?.length === 2 ? (
                      <button
                        type="button"
                        className="chat-header-name-link"
                        onClick={() => {
                          const other = convoDetail.participants.find((p) => p.user?.id !== currentUser?.id);
                          if (other?.user?.username) navigate(`/userpage/${other.user.username}`);
                        }}
                      >
                        {getConvoName(convoDetail)}
                      </button>
                    ) : (
                      getConvoName(convoDetail)
                    )
                  ) : "..."}
                </h3>
                {convoDetail && convoDetail.participants?.length > 2 && (
                  <span className="chat-header-count">
                    {convoDetail.participants.length} members
                  </span>
                )}
                {showDealCompleteBtn && (
                  <button
                    type="button"
                    className="deal-complete-btn"
                    onClick={markDealComplete}
                    disabled={markingComplete}
                  >
                    {markingComplete ? "Marking..." : "Mark deal as complete"}
                  </button>
                )}
                {convoDetail?.dealStatus === "completed" && (
                  <span className="deal-complete-badge">Deal complete</span>
                )}
              </div>
              <div className="chat-messages">
                {msgLoading ? (
                  <p className="comment-empty">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="comment-empty">No messages yet. Say hello!</p>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender?.id === currentUser?.id || msg.senderId === currentUser?.id;
                    return (
                      <div key={msg.id} className={`chat-bubble ${isOwn ? "chat-bubble--own" : "chat-bubble--other"}`}>
                        {!isOwn && (
                          <button
                            type="button"
                            className="chat-bubble-sender-link"
                            onClick={() => {
                              if (msg.sender?.username) navigate(`/userpage/${msg.sender.username}`);
                            }}
                          >
                            {msg.sender?.name || msg.sender?.username}
                          </button>
                        )}
                        <p className="chat-bubble-body">{msg.body}</p>
                        <span className="chat-bubble-time">{formatMsgTime(msg.createdAt)}</span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  type="text"
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={2000}
                />
                <button type="submit" disabled={sending || !msgBody.trim()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p>Select a conversation or start a new one</p>
            </div>
          )}
        </div>

        {/* New Conversation Modal */}
        {newConvoOpen && (
          <div className="create-post-overlay" role="dialog" aria-modal="true" onClick={() => setNewConvoOpen(false)}>
            <div className="new-convo-modal" onClick={(e) => e.stopPropagation()}>
              <div className="create-post-header">
                <h2>New conversation</h2>
                <button type="button" className="create-post-close" onClick={() => { setNewConvoOpen(false); setSelectedUsers([]); setSearchQuery(""); }}>
                  Close
                </button>
              </div>
              <div className="new-convo-search">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users..."
                />
              </div>
              {selectedUsers.length > 0 && (
                <div className="new-convo-selected">
                  {selectedUsers.map((u) => (
                    <span key={u.id} className="brand-selected-item">
                      @{u.username}
                      <button type="button" onClick={() => setSelectedUsers((prev) => prev.filter((s) => s.id !== u.id))}>
                        remove
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="new-convo-results">
                {searchLoading ? (
                  <p className="comment-empty">Searching...</p>
                ) : searchResults.length === 0 && searchQuery.trim() ? (
                  <p className="comment-empty">No users found.</p>
                ) : (
                  searchResults
                    .filter((u) => !selectedUsers.find((s) => s.id === u.id))
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="follow-list-item-link"
                        onClick={() => setSelectedUsers((prev) => [...prev, u])}
                      >
                        <ProfilePatch name={u.name} imageUrl={u.profilePicture} />
                        <div className="follow-list-item-info">
                          <span className="follow-list-item-name">{u.name}</span>
                          <span className="follow-list-item-handle">@{u.username}</span>
                        </div>
                      </button>
                    ))
                )}
              </div>
              <button
                type="button"
                className="save-button"
                onClick={startConversation}
                disabled={!selectedUsers.length}
              >
                Start conversation
              </button>
            </div>
          </div>
        )}

        {/* Rating Modal */}
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          conversationId={ratingConvoId}
          rateeUser={ratingTarget}
          onSubmitted={() => setShowRatingModal(false)}
        />
      </div>
    </div>
  );
}

export default MessagesPage;
