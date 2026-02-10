import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";
import GrannySquareGrid from "./GrannySquareGrid";

function QuiltDetailView({ quiltId, isOwner, onBack }) {
  const navigate = useNavigate();
  const [quilt, setQuilt] = useState(null);
  const [patches, setPatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchQuilt() {
      setLoading(true);
      const token = localStorage.getItem("token");
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      try {
        const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}`, { headers });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setQuilt(data.quilt);
          setPatches(
            (data.quilt?.patches || []).map((p) => ({
              postId: p.post?.id || p.postId,
              imageUrl: p.post?.imageUrl,
            })).filter((p) => p.imageUrl)
          );
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchQuilt();
    return () => { isMounted = false; };
  }, [quiltId]);

  async function removePatch(postId) {
    const token = localStorage.getItem("token");
    if (!token) return;
    setRemovingId(postId);
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}/patches/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPatches((prev) => prev.filter((p) => p.postId !== postId));
      }
    } catch {
      // silent
    } finally {
      setRemovingId(null);
    }
  }

  async function saveEdit(fields) {
    const token = localStorage.getItem("token");
    if (!token) return;
    setEditSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fields),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        setQuilt(data.quilt);
        setEditingName(false);
        setEditingDesc(false);
      }
    } catch {
      // silent
    } finally {
      setEditSaving(false);
    }
  }

  async function togglePrivacy() {
    if (!quilt) return;
    await saveEdit({ isPublic: !quilt.isPublic });
  }

  async function deleteQuilt() {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        onBack();
      }
    } catch {
      // silent
    }
  }

  if (loading) {
    return <div className="placeholder"><p>Loading quilt...</p></div>;
  }

  return (
    <div className="quilt-detail">
      <button type="button" className="back-button" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        All quilts
      </button>
      {quilt && (
        <>
          <div className="quilt-detail-header">
            {editingName ? (
              <div className="quilt-edit-inline">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  className="quilt-edit-input"
                />
                <button
                  type="button"
                  className="save-button save-button--sm"
                  onClick={() => saveEdit({ name: editName })}
                  disabled={editSaving || !editName.trim()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="cancel-button cancel-button--sm"
                  onClick={() => setEditingName(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2 className="quilt-detail-name">
                {quilt.name}
                {isOwner && (
                  <button
                    type="button"
                    className="quilt-edit-btn"
                    onClick={() => { setEditName(quilt.name); setEditingName(true); }}
                    title="Edit name"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </h2>
            )}

            {isOwner && (
              <div className="quilt-detail-controls">
                <button
                  type="button"
                  className={`quilt-privacy-toggle ${quilt.isPublic ? "quilt-privacy-toggle--public" : ""}`}
                  onClick={togglePrivacy}
                  disabled={editSaving}
                >
                  {quilt.isPublic ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      Public
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Private
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {editingDesc ? (
            <div className="quilt-edit-inline">
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="quilt-edit-input"
                rows={2}
              />
              <button
                type="button"
                className="save-button save-button--sm"
                onClick={() => saveEdit({ description: editDesc })}
                disabled={editSaving}
              >
                Save
              </button>
              <button
                type="button"
                className="cancel-button cancel-button--sm"
                onClick={() => setEditingDesc(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            quilt.description ? (
              <p className="quilt-detail-desc" onClick={() => { if (isOwner) { setEditDesc(quilt.description); setEditingDesc(true); } }}>
                {quilt.description}
                {isOwner && <span className="quilt-edit-hint"> (click to edit)</span>}
              </p>
            ) : isOwner ? (
              <p className="quilt-detail-desc quilt-detail-desc--empty" onClick={() => { setEditDesc(""); setEditingDesc(true); }}>
                Add a description...
              </p>
            ) : null
          )}

          {isOwner && (
            <div className="quilt-danger-zone">
              {deleteConfirm ? (
                <div className="quilt-delete-confirm">
                  <span>Delete this quilt?</span>
                  <button type="button" className="cancel-button cancel-button--sm" onClick={deleteQuilt}>
                    Yes, delete
                  </button>
                  <button type="button" className="save-button save-button--sm" onClick={() => setDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="quilt-delete-btn"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete quilt
                </button>
              )}
            </div>
          )}
        </>
      )}
      <GrannySquareGrid
        images={patches}
        isOwner={isOwner}
        onRemove={removePatch}
        removingId={removingId}
        onClickPatch={(postId) => navigate(`/post/${postId}`)}
      />
    </div>
  );
}

export default QuiltDetailView;
