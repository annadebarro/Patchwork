import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch,
  parseApiResponse,
  REQUEST_SURFACES,
} from "../../shared/api/http";
import PostCard from "./PostCard";

const TELEMETRY_FLUSH_DELAY_MS = 1500;
const TELEMETRY_BATCH_SIZE = 20;
const MIN_DWELL_MS = 300;

function normalizeRankPosition(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function PostsGrid({ type, refreshKey }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [algorithm, setAlgorithm] = useState("chronological_fallback");
  const [requestId, setRequestId] = useState(null);
  const telemetryQueueRef = useRef([]);
  const flushTimerRef = useRef(null);
  const feedType = useMemo(() => type || "all", [type]);

  const sendTelemetryEvents = useCallback((events, { keepalive = false } = {}) => {
    if (!Array.isArray(events) || !events.length) return;

    void apiFetch("/recommendations/telemetry", {
      method: "POST",
      auth: true,
      surface: REQUEST_SURFACES.SOCIAL_FEED,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
      keepalive,
    }).catch(() => {
      // best effort telemetry
    });
  }, []);

  const flushQueuedTelemetry = useCallback((keepalive = false) => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    if (!telemetryQueueRef.current.length) return;

    const events = telemetryQueueRef.current;
    telemetryQueueRef.current = [];
    sendTelemetryEvents(events, { keepalive });
  }, [sendTelemetryEvents]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;

    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushQueuedTelemetry();
    }, TELEMETRY_FLUSH_DELAY_MS);
  }, [flushQueuedTelemetry]);

  const queueTelemetryEvent = useCallback((event) => {
    telemetryQueueRef.current.push(event);

    if (telemetryQueueRef.current.length >= TELEMETRY_BATCH_SIZE) {
      flushQueuedTelemetry();
      return;
    }

    scheduleFlush();
  }, [flushQueuedTelemetry, scheduleFlush]);

  const buildFeedEvent = useCallback(({
    actionType,
    postId,
    rankPosition,
    occurredAt = new Date(),
    dwellMs,
  }) => {
    const event = {
      actionType,
      postId,
      feedType,
      rankPosition: normalizeRankPosition(rankPosition),
      algorithm: algorithm || null,
      requestId: requestId || null,
      occurredAt: occurredAt.toISOString(),
    };

    if (Number.isFinite(dwellMs) && dwellMs >= 0) {
      event.dwellMs = Math.round(dwellMs);
    }

    return event;
  }, [algorithm, feedType, requestId]);

  const handleFeedImpression = useCallback(({ postId, rankPosition, occurredAt }) => {
    queueTelemetryEvent(buildFeedEvent({
      actionType: "feed_impression",
      postId,
      rankPosition,
      occurredAt,
    }));
  }, [buildFeedEvent, queueTelemetryEvent]);

  const handleFeedDwell = useCallback(({ postId, rankPosition, dwellMs, occurredAt }) => {
    if (!Number.isFinite(dwellMs) || dwellMs < MIN_DWELL_MS) return;

    queueTelemetryEvent(buildFeedEvent({
      actionType: "feed_dwell",
      postId,
      rankPosition,
      occurredAt,
      dwellMs,
    }));
  }, [buildFeedEvent, queueTelemetryEvent]);

  const handleFeedClick = useCallback(({ postId, rankPosition, occurredAt }) => {
    sendTelemetryEvents(
      [
        buildFeedEvent({
          actionType: "feed_click",
          postId,
          rankPosition,
          occurredAt,
        }),
      ],
      { keepalive: true }
    );
  }, [buildFeedEvent, sendTelemetryEvents]);

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
        const res = await apiFetch(`/recommendations?${params.toString()}`, {
          auth: true,
          surface: REQUEST_SURFACES.SOCIAL_FEED,
        });
        const data = await parseApiResponse(res);
        if (!res.ok) {
          const message = data?.message || `Failed to load posts (${res.status})`;
          if (isMounted) setError(message);
        } else if (isMounted) {
          setPosts(Array.isArray(data?.posts) ? data.posts : []);
          setAlgorithm(typeof data?.algorithm === "string" ? data.algorithm : "chronological_fallback");
          setRequestId(typeof data?.requestId === "string" ? data.requestId : null);
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

  useEffect(() => {
    function onPageHide() {
      flushQueuedTelemetry(true);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushQueuedTelemetry(true);
      }
    }

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushQueuedTelemetry(true);
    };
  }, [flushQueuedTelemetry]);

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
      {posts.map((post, index) => (
        <PostCard
          key={post.id}
          post={post}
          rankPosition={index + 1}
          feedContext={{
            feedType,
            algorithm,
            requestId,
          }}
          onFeedImpression={handleFeedImpression}
          onFeedDwell={handleFeedDwell}
          onFeedClick={handleFeedClick}
        />
      ))}
    </div>
  );
}

export default PostsGrid;
