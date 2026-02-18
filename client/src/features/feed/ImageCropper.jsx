import { useCallback, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "../../shared/utils/getCroppedImg";

// Each ratio pair: [portrait, landscape]. We pick the orientation that suits the image.
const RATIO_PAIRS = [
  { portrait: { label: "1:1", value: 1 }, landscape: { label: "1:1", value: 1 } },
  { portrait: { label: "4:5", value: 4 / 5 }, landscape: { label: "5:4", value: 5 / 4 } },
  { portrait: { label: "2:3", value: 2 / 3 }, landscape: { label: "3:2", value: 3 / 2 } },
  { portrait: { label: "5:7", value: 5 / 7 }, landscape: { label: "7:5", value: 7 / 5 } },
  { portrait: { label: "3:4", value: 3 / 4 }, landscape: { label: "4:3", value: 4 / 3 } },
];

function ImageCropper({ imageUrl, onCropDone, onChangeImage, onUseOriginal, mode = "post", lockedAspect = null }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [naturalAspect, setNaturalAspect] = useState(1);
  const [aspect, setAspect] = useState(mode === "avatar" ? 1 : lockedAspect !== null ? lockedAspect : null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [hasModified, setHasModified] = useState(false);

  const isLandscape = naturalAspect >= 1;

  // Build the ratio buttons based on image orientation
  const aspectOptions = useMemo(() => {
    const orientation = isLandscape ? "landscape" : "portrait";
    return [
      { label: "Original", value: null },
      ...RATIO_PAIRS.map((pair) => pair[orientation]),
    ];
  }, [isLandscape]);

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const onMediaLoaded = useCallback((mediaSize) => {
    setNaturalAspect(mediaSize.naturalWidth / mediaSize.naturalHeight);
  }, []);

  const showAspectButtons = mode === "post" && lockedAspect === null;

  function getActiveAspect() {
    if (mode === "avatar") return 1;
    if (lockedAspect !== null) return lockedAspect;
    return aspect === null ? naturalAspect : aspect;
  }

  function handleCropChange(newCrop) {
    setCrop(newCrop);
    setHasModified(true);
  }

  function handleZoomChange(newZoom) {
    setZoom(newZoom);
    setHasModified(true);
  }

  function handleAspectChange(value) {
    setAspect(value);
    if (value !== null) setHasModified(true);
  }

  // Flip the current aspect ratio between portrait and landscape
  function handleRotate() {
    if (aspect === null) return;
    const flipped = 1 / aspect;
    setAspect(flipped);
    setHasModified(true);
  }

  async function handleCrop() {
    if (!croppedAreaPixels) return;
    const blob = await getCroppedImg(imageUrl, croppedAreaPixels);
    const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
    onCropDone(file);
  }

  function handleDone() {
    if (!hasModified && aspect === null && onUseOriginal) {
      onUseOriginal();
    } else {
      handleCrop();
    }
  }

  return (
    <div className="image-cropper">
      <div className="image-cropper-area">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={getActiveAspect()}
          onCropChange={handleCropChange}
          onZoomChange={handleZoomChange}
          onCropComplete={onCropComplete}
          onMediaLoaded={onMediaLoaded}
        />
      </div>

      <div className="image-cropper-controls">
        {showAspectButtons && (
          <div className="image-cropper-aspects">
            {aspectOptions.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`image-cropper-aspect-btn${aspect === r.value ? " active" : ""}`}
                onClick={() => handleAspectChange(r.value)}
              >
                {r.label}
              </button>
            ))}
            {aspect !== null && (
              <button
                type="button"
                className="image-cropper-rotate-btn"
                onClick={handleRotate}
                title="Rotate crop orientation"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4" />
                  <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            )}
          </div>
        )}

        <label className="image-cropper-zoom-label">
          Zoom
          <input
            type="range"
            className="image-cropper-zoom"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
          />
        </label>

        <div className="image-cropper-actions">
          <button type="button" className="cancel-button" onClick={onChangeImage}>
            Change image
          </button>
          <button type="button" className="save-button" onClick={handleDone}>
            {!hasModified && aspect === null && onUseOriginal ? "Use original" : "Crop"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropper;
