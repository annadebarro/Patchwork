import { useState } from "react";
import QuiltPickerModal from "../quilts/QuiltPickerModal";

function PatchButton({ postId }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="patch-button"
        onClick={() => setOpen(true)}
        title="Save to quilt"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <rect x="5" y="5" width="14" height="14" rx="0.5" strokeDasharray="2 1.5" />
        </svg>
      </button>
      <QuiltPickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        postId={postId}
      />
    </>
  );
}

export default PatchButton;
