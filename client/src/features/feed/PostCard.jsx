import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const VISIBILITY_THRESHOLD = 0.5;

function formatPrice(priceCents) {
  if (!Number.isFinite(priceCents)) return "";
  return `$${(priceCents / 100).toFixed(2)}`;
}

function PostCard({
  post,
  imageOnly,
  rankPosition = null,
  feedContext = null,
  onFeedImpression,
  onFeedDwell,
  onFeedClick,
}) {
  const navigate = useNavigate();
  const cardRef = useRef(null);
  const hasLoggedImpressionRef = useRef(false);
  const visibleSinceRef = useRef(null);
  const isMarket = post.type === "market";
  const priceLabel = isMarket && post.priceCents !== null ? formatPrice(post.priceCents) : "";
  const caption = typeof post.caption === "string" ? post.caption : "";
  const authorUsername = post.author?.username;
  const isSold = Boolean(post.isSold);

  const emitDwell = useCallback((now = Date.now()) => {
    if (visibleSinceRef.current === null || typeof onFeedDwell !== "function") {
      return;
    }

    const dwellMs = now - visibleSinceRef.current;
    visibleSinceRef.current = null;

    if (dwellMs > 0) {
      onFeedDwell({
        postId: post.id,
        rankPosition,
        dwellMs,
        occurredAt: new Date(now),
      });
    }
  }, [onFeedDwell, post.id, rankPosition]);

  useEffect(() => {
    hasLoggedImpressionRef.current = false;
    visibleSinceRef.current = null;
  }, [feedContext?.requestId, post.id]);

  useEffect(() => {
    if (imageOnly) return undefined;

    const element = cardRef.current;
    if (!element || typeof IntersectionObserver !== "function") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
          if (!hasLoggedImpressionRef.current && typeof onFeedImpression === "function") {
            hasLoggedImpressionRef.current = true;
            onFeedImpression({
              postId: post.id,
              rankPosition,
              occurredAt: new Date(),
            });
          }

          if (visibleSinceRef.current === null) {
            visibleSinceRef.current = Date.now();
          }
          return;
        }

        emitDwell(Date.now());
      },
      { threshold: [VISIBILITY_THRESHOLD] }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      emitDwell(Date.now());
    };
  }, [emitDwell, imageOnly, onFeedImpression, post.id, rankPosition]);

  function openPost() {
    if (typeof onFeedClick === "function") {
      onFeedClick({
        postId: post.id,
        rankPosition,
        occurredAt: new Date(),
      });
    }

    navigate(`/post/${post.id}`, {
      state: {
        feedTelemetry: {
          postId: post.id,
          feedType: typeof feedContext?.feedType === "string" ? feedContext.feedType : null,
          rankPosition,
          algorithm: typeof feedContext?.algorithm === "string" ? feedContext.algorithm : null,
          requestId: typeof feedContext?.requestId === "string" ? feedContext.requestId : null,
        },
      },
    });
  }

  if (imageOnly) {
    return (
      <div
        ref={cardRef}
        className="post-card post-card--image-only"
        onClick={openPost}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") openPost();
        }}
      >
        <img src={post.imageUrl} alt="Post" />
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`post-card post-card--clickable${isSold ? " post-card--sold" : ""}`}
      onClick={openPost}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") openPost();
      }}
    >
      <img src={post.imageUrl} alt={caption || "Post"} />
      {isSold && <div className="sold-badge">SOLD</div>}
      {isMarket && !isSold && (
        <div className="sale-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
      )}
      <div className="post-meta">
        {authorUsername && (
          <p className="post-author">@{authorUsername}</p>
        )}
        {caption && <p className="post-caption">{caption}</p>}
        {priceLabel && <p className="post-price">{priceLabel}</p>}
      </div>
    </div>
  );
}

export default PostCard;
