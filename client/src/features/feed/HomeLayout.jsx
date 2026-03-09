import { useState } from "react";
import PostsGrid from "./PostsGrid";

function HomeLayout({ refreshKey }) {
  const [socialOnly, setSocialOnly] = useState(false);

  const type = socialOnly ? "regular" : null;

  return (
    <>
      <nav className="feed-tabs">
        <button
          type="button"
          className={`social-toggle ${socialOnly ? "on" : "off"}`}
          onClick={() => setSocialOnly((prev) => !prev)}
        >
          <span className="social-toggle__label">social only</span>
          <span className="social-toggle__badge">{socialOnly ? "ON" : "OFF"}</span>
        </button>
      </nav>
      <div className="feed-content">
        <PostsGrid type={type} refreshKey={refreshKey} />
      </div>
    </>
  );
}

export default HomeLayout;
