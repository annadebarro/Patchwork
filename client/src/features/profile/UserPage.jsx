import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_BASE_URL, apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";
import PostCard from "../feed/PostCard";
import ProfilePatch from "../../shared/ui/ProfilePatch";
import QuiltListView from "../quilts/QuiltListView";
import QuiltDetailView from "../quilts/QuiltDetailView";
import FollowListModal from "./FollowListModal";
import StarRating from "../../shared/ui/StarRating";

function UserPage({ user, isOwnProfile = false, refreshKey = 0, currentUser }) {
  const { username } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profileUser, setProfileUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState("");
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followListType, setFollowListType] = useState(null);
  const [activeTab, setActiveTab] = useState("everything");
  const [quilts, setQuilts] = useState([]);
  const [selectedQuiltId, setSelectedQuiltId] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [ratingsAvg, setRatingsAvg] = useState(null);
  const [ratingsTotal, setRatingsTotal] = useState(0);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [editingRatingId, setEditingRatingId] = useState(null);
  const [editScore, setEditScore] = useState(0);
  const [editReview, setEditReview] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setPostsLoading(true);
      setPostsError("");

      try {
        if (isOwnProfile) {
          const [postsRes, profileRes] = await Promise.all([
            apiFetch("/posts/mine", {
              auth: true,
              surface: REQUEST_SURFACES.PROFILE,
            }),
            user?.username
              ? apiFetch(`/users/${encodeURIComponent(user.username)}`, {
                  auth: true,
                  surface: REQUEST_SURFACES.PROFILE,
                })
              : null,
          ]);

          const postsData = await parseApiResponse(postsRes);
          if (!postsRes.ok) {
            if (isMounted) setPostsError(postsData?.message || `Failed to load posts (${postsRes.status})`);
          } else if (isMounted) {
            setPosts(Array.isArray(postsData?.posts) ? postsData.posts : []);
          }

          if (profileRes) {
            const profileData = await parseApiResponse(profileRes);
            if (profileRes.ok && isMounted) {
              setFollowerCount(profileData.user?.followerCount || 0);
              setFollowingCount(profileData.user?.followingCount || 0);
              setQuilts(Array.isArray(profileData?.quilts) ? profileData.quilts : []);
            }
          }
        } else if (username) {
          const token = localStorage.getItem("token");
          const res = await apiFetch(`/users/${encodeURIComponent(username)}`, {
            token,
            surface: REQUEST_SURFACES.PROFILE,
          });
          const data = await parseApiResponse(res);
          if (!res.ok) {
            if (isMounted) setPostsError(data?.message || "User not found.");
          } else if (isMounted) {
            setProfileUser(data.user);
            setPosts(Array.isArray(data?.posts) ? data.posts : []);
            setFollowerCount(data.user?.followerCount || 0);
            setFollowingCount(data.user?.followingCount || 0);
            setIsFollowing(Boolean(data.isFollowing));
            setQuilts(Array.isArray(data?.quilts) ? data.quilts : []);
          }
        }
      } catch {
        if (isMounted) setPostsError("Network error while loading profile.");
      } finally {
        if (isMounted) setPostsLoading(false);
      }
    }

    fetchData();
    return () => { isMounted = false; };
  }, [isOwnProfile, username, refreshKey, user?.username]);

  // Activate tab from ?tab= query param (e.g. from rating notification click)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const validTabs = ["everything", "marketplace", "quilts", "ratings"];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== "ratings") return;
    const targetUserId = isOwnProfile ? user?.id : profileUser?.id;
    if (!targetUserId) return;

    let isMounted = true;
    async function fetchRatings() {
      setRatingsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/ratings/users/${targetUserId}`);
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setRatings(Array.isArray(data?.ratings) ? data.ratings : []);
          setRatingsAvg(data?.averageScore ?? null);
          setRatingsTotal(data?.totalCount ?? 0);
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setRatingsLoading(false);
      }
    }
    fetchRatings();
    return () => { isMounted = false; };
  }, [activeTab, isOwnProfile, user?.id, profileUser?.id]);

  async function toggleFollow() {
    if (followBusy || !profileUser) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setFollowBusy(true);
    const method = isFollowing ? "DELETE" : "POST";
    try {
      const res = await apiFetch(`/follows/${profileUser.id}`, {
        method,
        auth: true,
        surface: REQUEST_SURFACES.PROFILE,
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setIsFollowing(data.following);
        setFollowerCount(data.followerCount);
      }
    } catch (err) {
      console.error("Follow toggle failed:", err);
    } finally {
      setFollowBusy(false);
    }
  }

  function recomputeAvg(updatedRatings) {
    if (!updatedRatings.length) { setRatingsAvg(null); setRatingsTotal(0); return; }
    setRatingsTotal(updatedRatings.length);
    setRatingsAvg(updatedRatings.reduce((s, r) => s + r.score, 0) / updatedRatings.length);
  }

  async function deleteRating(ratingId) {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE_URL}/ratings/${ratingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const updated = ratings.filter((r) => r.id !== ratingId);
      setRatings(updated);
      recomputeAvg(updated);
    }
  }

  async function saveEditRating(ratingId) {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE_URL}/ratings/${ratingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: editScore, review: editReview }),
    });
    if (res.ok) {
      const updated = ratings.map((r) =>
        r.id === ratingId ? { ...r, score: editScore, review: editReview } : r
      );
      setRatings(updated);
      recomputeAvg(updated);
      setEditingRatingId(null);
    }
  }

  const displayUser = isOwnProfile ? user : profileUser;
  const displayName = displayUser?.name || (isOwnProfile ? "Your name" : username || "User");
  const displayUsername = displayUser?.username || username || "username";
  const displayBio = displayUser?.bio || "";
  const showFollowButton = !isOwnProfile && profileUser && currentUser && currentUser.id !== profileUser.id;

  return (
    <div className="feed-content">
      <section className="user-page">
        {!isOwnProfile && (
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
        )}
        <header className="user-header">
          <ProfilePatch name={displayName} imageUrl={displayUser?.profilePicture} />
          <div className="user-header-info">
            <h1 className="user-name">{displayName}</h1>
            <p className="user-handle">@{displayUsername}</p>
          </div>
          {isOwnProfile && (
            <button
              className="edit-profile"
              type="button"
              onClick={() => navigate("/settings")}
            >
              Edit profile
            </button>
          )}
          {showFollowButton && (
            <button
              className={`follow-button ${isFollowing ? "follow-button--following" : ""}`}
              type="button"
              onClick={toggleFollow}
              disabled={followBusy}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </header>

        <div className="user-stats">
          <button className="stat" type="button" onClick={() => setFollowListType("followers")}>
            <span className="stat-value">{followerCount}</span>
            <span className="stat-label">Followers</span>
          </button>
          <button className="stat" type="button" onClick={() => setFollowListType("following")}>
            <span className="stat-value">{followingCount}</span>
            <span className="stat-label">Following</span>
          </button>
        </div>

        <div className="user-bio">
          {displayBio ? (
            <p className="user-bio-text">{displayBio}</p>
          ) : (
            <p className="user-bio-empty">No bio yet</p>
          )}
        </div>

        <nav className="profile-tabs">
          {[
            { key: "everything", title: "Everything", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            )},
            { key: "marketplace", title: "Marketplace", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            )},
            { key: "quilts", title: "Quilts", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="1" />
                <path d="M4 8h-1.5M4 12h-1.5M4 16h-1.5M20 8h1.5M20 12h1.5M20 16h1.5M8 4v-1.5M12 4v-1.5M16 4v-1.5M8 20v1.5M12 20v1.5M16 20v1.5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )},
            { key: "ratings", title: "Ratings", icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )},
          ].map((tab, i) => (
            <button
              key={tab.key}
              type="button"
              title={tab.title}
              className={`profile-tab${activeTab === tab.key ? " active" : ""}`}
              style={{ transform: `rotate(${i % 2 === 0 ? -1 : 1.5}deg)` }}
              onClick={() => { setActiveTab(tab.key); setSelectedQuiltId(null); }}
            >
              {tab.icon}
            </button>
          ))}
        </nav>

        <section className="user-posts" aria-label="User posts">
          {postsLoading ? (
            <div className="placeholder">
              <p>Loading posts...</p>
            </div>
          ) : postsError ? (
            <div className="placeholder">
              <p>{postsError}</p>
            </div>
          ) : activeTab === "everything" ? (
            posts.length ? (
              <div className="masonry-grid">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} imageOnly />
                ))}
              </div>
            ) : (
              <div className="placeholder"><p>No posts yet.</p></div>
            )
          ) : activeTab === "marketplace" ? (
            (() => {
              const marketPosts = posts.filter((p) => p.type === "market");
              return marketPosts.length ? (
                <div className="masonry-grid">
                  {marketPosts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <div className="placeholder"><p>No marketplace posts yet.</p></div>
              );
            })()
          ) : activeTab === "quilts" ? (
            selectedQuiltId ? (
              <QuiltDetailView
                quiltId={selectedQuiltId}
                isOwner={isOwnProfile}
                onBack={() => setSelectedQuiltId(null)}
              />
            ) : (
              <QuiltListView quilts={quilts} onSelectQuilt={setSelectedQuiltId} isOwnProfile={isOwnProfile} />
            )
          ) : activeTab === "ratings" ? (
            ratingsLoading ? (
              <div className="placeholder"><p>Loading ratings...</p></div>
            ) : ratingsTotal === 0 ? (
              <div className="placeholder"><p>No ratings yet.</p></div>
            ) : (
              <div className="ratings-tab">
                <div className="rating-avg">
                  <StarRating value={Math.round(ratingsAvg || 0)} size="md" />
                  <span className="rating-avg-score">
                    {ratingsAvg !== null ? ratingsAvg.toFixed(1) : "—"} / 5
                  </span>
                  <span className="rating-avg-count">({ratingsTotal} review{ratingsTotal !== 1 ? "s" : ""})</span>
                </div>
                <div className="rating-list">
                  {ratings.map((r) => {
                    const isMyRating = currentUser?.id === r.raterId;
                    const isEditing = editingRatingId === r.id;
                    return (
                      <div key={r.id} className="rating-card">
                        <div className="rating-card-header">
                          <button
                            type="button"
                            className="rating-card-avatar-btn"
                            onClick={() => r.rater?.username && navigate(`/userpage/${r.rater.username}`)}
                          >
                            <ProfilePatch name={r.rater?.name} imageUrl={r.rater?.profilePicture} />
                          </button>
                          <div className="rating-card-info">
                            <button
                              type="button"
                              className="rating-card-name"
                              onClick={() => r.rater?.username && navigate(`/userpage/${r.rater.username}`)}
                            >{r.rater?.name || r.rater?.username}</button>
                            {isEditing ? (
                              <StarRating value={editScore} onChange={setEditScore} size="sm" />
                            ) : (
                              <StarRating value={r.score} size="sm" />
                            )}
                          </div>
                          <span className="rating-card-date">
                            {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                          {isMyRating && !isEditing && (
                            <div className="rating-card-actions">
                              <button
                                type="button"
                                className="rating-action-btn"
                                onClick={() => { setEditingRatingId(r.id); setEditScore(r.score); setEditReview(r.review || ""); }}
                              >Edit</button>
                              <button
                                type="button"
                                className="rating-action-btn rating-action-btn--delete"
                                onClick={() => deleteRating(r.id)}
                              >Delete</button>
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="rating-edit-form">
                            <textarea
                              className="rating-edit-textarea"
                              value={editReview}
                              onChange={(e) => setEditReview(e.target.value)}
                              placeholder="Edit your review (optional)"
                              rows={2}
                            />
                            <div className="rating-edit-actions">
                              <button type="button" className="rating-action-btn" onClick={() => saveEditRating(r.id)}>Save</button>
                              <button type="button" className="rating-action-btn" onClick={() => setEditingRatingId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          r.review && <p className="rating-card-review">{r.review}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : null}
        </section>
      </section>

      {followListType && (
        <FollowListModal
          userId={(isOwnProfile ? user : profileUser)?.id}
          type={followListType}
          currentUserId={(isOwnProfile ? user : currentUser)?.id}
          onClose={() => setFollowListType(null)}
          onCountChange={(delta) => {
            if (followListType === "followers") {
              setFollowerCount((c) => c + delta);
            } else {
              setFollowingCount((c) => c + delta);
            }
          }}
        />
      )}
    </div>
  );
}

export default UserPage;
