import { useCallback, useEffect, useRef, useState } from "react";

function ImageCarousel({ images, size = "feed", className = "" }) {
  const trackRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const touchStartRef = useRef(null);
  const isDraggingRef = useRef(false);

  const count = images.length;

  const scrollToIndex = useCallback(
    (index) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = Math.max(0, Math.min(index, count - 1));
      const slide = track.children[clamped];
      if (slide) {
        track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
      }
    },
    [count]
  );

  // Observe which slide is in view
  useEffect(() => {
    const track = trackRef.current;
    if (!track || count <= 1) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const index = Number(entry.target.dataset.index);
            if (Number.isFinite(index)) setCurrent(index);
          }
        }
      },
      { root: track, threshold: 0.5 }
    );

    for (const child of track.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [count]);

  function handleTouchStart(e) {
    touchStartRef.current = e.touches[0].clientX;
    isDraggingRef.current = false;
  }

  function handleTouchMove() {
    isDraggingRef.current = true;
  }

  function handleTouchEnd(e) {
    if (!isDraggingRef.current || touchStartRef.current === null) return;
    const diff = touchStartRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      // Swiped — prevent click propagation
      e.stopPropagation();
    }
    touchStartRef.current = null;
    isDraggingRef.current = false;
  }

  // Block click if we were swiping
  function handleClick(e) {
    if (isDraggingRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className={`image-carousel image-carousel--${size} ${className}`}>
        <img src={images[0]} alt="Post" className="image-carousel-single" />
      </div>
    );
  }

  return (
    <div
      className={`image-carousel image-carousel--${size} ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClickCapture={handleClick}
    >
      <div className="image-carousel-track" ref={trackRef}>
        {images.map((url, i) => (
          <div key={i} className="image-carousel-slide" data-index={i}>
            <img src={url} alt={`Photo ${i + 1}`} />
          </div>
        ))}
      </div>

      {/* Arrow buttons */}
      {current > 0 && (
        <button
          type="button"
          className="image-carousel-arrow image-carousel-arrow--left"
          onClick={(e) => {
            e.stopPropagation();
            scrollToIndex(current - 1);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      {current < count - 1 && (
        <button
          type="button"
          className="image-carousel-arrow image-carousel-arrow--right"
          onClick={(e) => {
            e.stopPropagation();
            scrollToIndex(current + 1);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {/* Dot indicators */}
      <div className="image-carousel-dots">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`image-carousel-dot${i === current ? " active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              scrollToIndex(i);
            }}
          />
        ))}
      </div>

      {/* Multi-image indicator */}
      <div className="image-carousel-count">
        {current + 1}/{count}
      </div>
    </div>
  );
}

export default ImageCarousel;
