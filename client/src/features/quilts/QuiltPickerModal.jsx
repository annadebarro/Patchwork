import { useEffect, useState } from "react";
import { API_BASE_URL, parseApiResponse } from "../../shared/api/http";

function QuiltPickerModal({ isOpen, onClose, postId }) {
  const [quilts, setQuilts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setNewName("");
      setMessage("");
      return;
    }

    let isMounted = true;
    async function fetchQuilts() {
      setLoading(true);
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${API_BASE_URL}/quilts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseApiResponse(res);
        if (res.ok && isMounted) {
          setQuilts(Array.isArray(data?.quilts) ? data.quilts : []);
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchQuilts();
    return () => { isMounted = false; };
  }, [isOpen]);

  async function saveToQuilt(quiltId) {
    setSaving(true);
    setMessage("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/quilts/${quiltId}/patches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });
      if (res.ok) {
        setMessage("Saved!");
        setTimeout(() => onClose(), 800);
      } else {
        const data = await parseApiResponse(res);
        setMessage(data?.message || "Failed to save.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function createAndSave() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    setMessage("");
    const token = localStorage.getItem("token");
    try {
      const createRes = await fetch(`${API_BASE_URL}/quilts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const createData = await parseApiResponse(createRes);
      if (!createRes.ok) {
        setMessage(createData?.message || "Failed to create quilt.");
        return;
      }

      const quiltId = createData.quilt.id;
      const patchRes = await fetch(`${API_BASE_URL}/quilts/${quiltId}/patches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });

      if (patchRes.ok) {
        setMessage("Saved!");
        setTimeout(() => onClose(), 800);
      } else {
        const patchData = await parseApiResponse(patchRes);
        setMessage(patchData?.message || "Created quilt but failed to save post.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="create-post-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="quilt-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="create-post-header">
          <h2>Save to quilt</h2>
          <button type="button" className="create-post-close" onClick={onClose}>
            Close
          </button>
        </div>

        {message && (
          <div className={`settings-message ${message === "Saved!" ? "success" : "error"}`}>
            {message}
          </div>
        )}

        {loading ? (
          <p className="comment-empty">Loading quilts...</p>
        ) : (
          <div className="quilt-picker-list">
            {quilts.map((q) => (
              <button
                key={q.id}
                type="button"
                className="quilt-picker-item"
                onClick={() => saveToQuilt(q.id)}
                disabled={saving}
              >
                {q.name}
                <span className="quilt-picker-count">{q.patchCount || 0} patches</span>
              </button>
            ))}
          </div>
        )}

        <div className="quilt-picker-create">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New quilt name"
            maxLength={100}
          />
          <button
            type="button"
            className="save-button"
            onClick={createAndSave}
            disabled={saving || !newName.trim()}
          >
            {saving ? "..." : "Create & save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuiltPickerModal;
