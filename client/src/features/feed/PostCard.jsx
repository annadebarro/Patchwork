import { useNavigate } from "react-router-dom";

function formatPrice(priceCents) {
  if (!Number.isFinite(priceCents)) return "";
  return `$${(priceCents / 100).toFixed(2)}`;
}

function PostCard({ post, imageOnly }) {
  const navigate = useNavigate();
  const isMarket = post.type === "market";
  const priceLabel = isMarket && post.priceCents !== null ? formatPrice(post.priceCents) : "";
  const caption = typeof post.caption === "string" ? post.caption : "";
  const authorUsername = post.author?.username;
  const isSold = Boolean(post.isSold);

  if (imageOnly) {
    return (
      <div
        className="post-card post-card--image-only"
        onClick={() => navigate(`/post/${post.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(`/post/${post.id}`);
        }}
      >
        <img src={post.imageUrl} alt="Post" />
      </div>
    );
  }

  return (
    <div
      className={`post-card post-card--clickable${isSold ? " post-card--sold" : ""}`}
      onClick={() => navigate(`/post/${post.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/post/${post.id}`);
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
