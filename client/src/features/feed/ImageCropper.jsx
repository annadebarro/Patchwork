import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "../../shared/utils/getCroppedImg";

const POST_ASPECT_RATIOS = [
  { label: "Original", value: null },
  { label: "4:5", value: 4 / 5 },
  { label: "5:4", value: 5 / 4 },
];

function ImageCropper({ imageUrl, onCropDone, onChangeImage, mode = "post" }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [naturalAspect, setNaturalAspect] = useState(1);
  const [aspect, setAspect] = useState(mode === "avatar" ? 1 : null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const onMediaLoaded = useCallback((mediaSize) => {
    setNaturalAspect(mediaSize.naturalWidth / mediaSize.naturalHeight);
  }, []);

  function getActiveAspect() {
    if (mode === "avatar") return 1;
    return aspect === null ? naturalAspect : aspect;
  }

  async function handleCrop() {
    if (!croppedAreaPixels) return;
    const blob = await getCroppedImg(imageUrl, croppedAreaPixels);
    const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
    onCropDone(file);
  }

  return (
    <div className="image-cropper">
      <div className="image-cropper-area">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={getActiveAspect()}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          onMediaLoaded={onMediaLoaded}
        />
      </div>

      <div className="image-cropper-controls">
        {mode === "post" && (
          <div className="image-cropper-aspects">
            {POST_ASPECT_RATIOS.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`image-cropper-aspect-btn${aspect === r.value ? " active" : ""}`}
                onClick={() => setAspect(r.value)}
              >
                {r.label}
              </button>
            ))}
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
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>

        <div className="image-cropper-actions">
          <button type="button" className="cancel-button" onClick={onChangeImage}>
            Change image
          </button>
          <button type="button" className="save-button" onClick={handleCrop}>
            Crop
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropper;
