import { useRef } from "react";

const STAR_PATH =
  "M 11.12,3.79 Q 12,2 12.88,3.79 L 14.43,6.91 Q 15.09,8.26 16.57,8.48 L 20.02,8.98 Q 22,9.27 20.57,10.67 L 18.07,13.09 Q 17,14.14 17.25,15.62 L 17.84,19.05 Q 18.18,21.02 16.41,20.09 L 13.33,18.47 Q 12,17.77 10.67,18.47 L 7.59,20.09 Q 5.82,21.02 6.16,19.05 L 6.75,15.62 Q 7,14.14 5.93,13.09 L 3.43,10.67 Q 2,9.27 3.98,8.98 L 7.43,8.48 Q 8.91,8.26 9.57,6.91 Z";

function StarRating({ value = 0, onChange, size = "md" }) {
  const interactive = typeof onChange === "function";
  // Stable per-component ID so clipPath ids don't collide between instances
  const uid = useRef(`sr-${Math.random().toString(36).slice(2)}`).current;

  return (
    <div className={`star-rating star-rating--${size}`} aria-label={`Rating: ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star${value >= star ? " star--filled" : ""}${interactive ? " star--interactive" : ""}`}
          onClick={interactive ? () => onChange(star) : undefined}
          disabled={!interactive}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          <svg viewBox="0 0 24 24" className="star-svg" aria-hidden="true">
            <defs>
              {/*
                clipPath matches the star's filled region exactly.
                Any stroke rendered with this clipPath will only show
                the portion that falls inside the star — giving us
                stitching on the inside edge, not a border on the outside.
              */}
              <clipPath id={`${uid}-${star}`}>
                <path d={STAR_PATH} />
              </clipPath>
            </defs>
            {/* Star body — red fill (or ghost outline when empty) */}
            <path d={STAR_PATH} className="star-body" />
            {/* White stitching — scaled to 80% so it sits inset from the edge,
                clipped to the star interior to prevent any bleed-through at tips */}
            <path
              d={STAR_PATH}
              className="star-stitch"
              clipPath={`url(#${uid}-${star})`}
              transform="translate(12,12) scale(0.8) translate(-12,-12)"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default StarRating;
