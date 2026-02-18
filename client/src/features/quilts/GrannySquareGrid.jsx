import { useNavigate } from "react-router-dom";

function GrannySquareGrid({ images, mini, isOwner, onRemove, removingId, onClickPatch }) {
  const navigate = useNavigate();
  const items = mini
    ? (images || []).slice(0, 9).map((url, i) => ({ postId: i, imageUrl: url }))
    : images || [];

  if (!items.length) {
    return <div className="placeholder"><p>No patches yet.</p></div>;
  }

  const cols = mini ? Math.min(items.length, 3) : undefined;

  return (
    <div
      className={`granny-grid ${mini ? "granny-grid--mini" : "granny-grid--full"}`}
      style={mini ? { "--granny-cols": cols } : undefined}
    >
      <div className="granny-grid-inner">
        {items.map((item) => (
          <div
            key={mini ? item.postId : item.postId}
            className="granny-square"
          >
            <div
              className="granny-square-inner"
              onClick={() => {
                if (mini) return;
                if (onClickPatch) onClickPatch(item.postId);
                else navigate(`/post/${item.postId}`);
              }}
              style={mini ? undefined : { cursor: "pointer" }}
            >
              <img src={item.imageUrl} alt="" />
              {!mini && isOwner && (
                <button
                  type="button"
                  className="granny-square-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRemove) onRemove(item.postId);
                  }}
                  disabled={removingId === item.postId}
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GrannySquareGrid;
