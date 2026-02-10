import { useEffect, useState } from "react";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import PostCard from "./PostCard";

function PostsGrid({ type, refreshKey }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchPosts() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          if (isMounted) {
            setPosts([]);
            setError("Please log in again.");
          }
          return;
        }

        const params = new URLSearchParams();
        if (type) params.set("type", type);
        const res = await fetch(`${API_BASE_URL}/recommendations?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiResponse(res);
        if (!res.ok) {
          const message = data?.message || `Failed to load posts (${res.status})`;
          if (isMounted) setError(message);
        } else if (isMounted) {
          setPosts(Array.isArray(data?.posts) ? data.posts : []);
        }
      } catch {
        if (isMounted) setError("Network error while loading posts.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPosts();

    return () => {
      isMounted = false;
    };
  }, [type, refreshKey]);

  if (loading) {
    return <div className="feed-empty">Loading posts...</div>;
  }

  if (error) {
    return <div className="feed-empty">{error}</div>;
  }

  if (!posts.length) {
    return <div className="feed-empty">No posts yet.</div>;
  }

  return (
    <div className="masonry-grid">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

export default PostsGrid;
