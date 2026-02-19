import GrannySquareGrid from "./GrannySquareGrid";

function QuiltListView({ quilts, onSelectQuilt, isOwnProfile }) {
  const displayQuilts = isOwnProfile ? quilts : quilts.filter((q) => q.isPublic);

  if (!displayQuilts.length) {
    return <div className="placeholder"><p>No quilts yet.</p></div>;
  }

  return (
    <div className="quilt-list">
      {displayQuilts.map((quilt) => (
        <button
          key={quilt.id}
          type="button"
          className="quilt-list-card"
          onClick={() => onSelectQuilt(quilt.id)}
        >
          <div className="quilt-list-preview">
            <GrannySquareGrid
              images={quilt.previewImageUrl ? [quilt.previewImageUrl] : quilt.previewImages}
              mini
            />
          </div>
          <div className="quilt-list-info">
            <h3 className="quilt-list-name">
              {quilt.isPublic ? (
                <svg className="quilt-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              ) : (
                <svg className="quilt-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
              {quilt.name}
            </h3>
            <span className="quilt-list-count">
              {quilt.patchCount} {quilt.patchCount === 1 ? "patch" : "patches"}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export default QuiltListView;
