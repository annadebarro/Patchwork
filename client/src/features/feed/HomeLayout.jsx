import { useState } from "react";
import PostsGrid from "./PostsGrid";

function HomeLayout({ refreshKey }) {
  const [filters, setFilters] = useState({ social: true, marketplace: true });

  function toggleFilter(key) {
    setFilters((prev) => {
      const other = key === "social" ? "marketplace" : "social";
      if (prev[key] && !prev[other]) return prev;
      return { ...prev, [key]: !prev[key] };
    });
  }

  const type = filters.social && filters.marketplace
    ? null
    : filters.social
      ? "regular"
      : "market";

  return (
    <>
      <nav className="feed-tabs">
        <button
          type="button"
          className={`feed-tab ${filters.social ? "active" : ""}`}
          onClick={() => toggleFilter("social")}
        >
          Social
        </button>
        <button
          type="button"
          className={`feed-tab ${filters.marketplace ? "active" : ""}`}
          onClick={() => toggleFilter("marketplace")}
        >
          Marketplace
        </button>
      </nav>
      <div className="feed-content">
        <PostsGrid type={type} refreshKey={refreshKey} />
      </div>
    </>
  );
}

export default HomeLayout;
