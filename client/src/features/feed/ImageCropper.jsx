import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "../../shared/utils/getCroppedImg";

const ASPECT_RATIOS = [
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "16:9", value: 16 / 9 },
];

function ImageCropper({ imageUrl, onCropDone, onChangeImage }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

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
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="image-cropper-controls">
        <div className="image-cropper-aspects">
          {ASPECT_RATIOS.map((r) => (
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
