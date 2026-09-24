"use client";

import { useEffect, useRef, useState } from "react";
import type { WeddingGalleryImage } from "@/db/weddingSite";

const AUTO_ADVANCE_MS = 4000;
const DRAG_CLICK_THRESHOLD_PX = 5;

// A horizontal, scroll-snapped strip (not the old full-bleed cross-fade --
// this shows several real photos at once, ~2.5 across on desktop so the
// half-visible one signals there's more to the right, one at a time on
// mobile). Auto-advances slowly, but only until a visitor actually touches
// it: dragging, using an arrow, or picking a dot stops auto-advance for
// good rather than fighting whatever they were just doing. That, plus
// disabling auto-advance entirely under prefers-reduced-motion, is the
// "auto-moving content must be stoppable" accessibility rule from the
// brief -- everything here (arrows, dots, the lightbox close button)
// is a real <button>, keyboard-reachable, with its own label, and nothing
// here traps focus.
export function GalleryCarousel({ images }: { images: WeddingGalleryImage[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const pausedRef = useRef(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const [autoAdvanceOn, setAutoAdvanceOn] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (reducedMotion || !autoAdvanceOn || images.length < 2) return;
    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || pausedRef.current) return;
      const itemWidth = (track.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width ?? track.clientWidth;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + itemWidth, behavior: "smooth" });
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion, autoAdvanceOn, images.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function onScroll() {
      const itemWidth = (track!.firstElementChild as HTMLElement | null)?.offsetWidth || track!.clientWidth;
      setActiveIndex(Math.round(track!.scrollLeft / itemWidth));
    }
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex]);

  function scrollToIndex(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const itemWidth = (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? track.clientWidth;
    track.scrollTo({ left: i * itemWidth, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track) return;
    draggingRef.current = true;
    dragDistanceRef.current = 0;
    dragStartXRef.current = e.clientX;
    dragStartScrollRef.current = track.scrollLeft;
    track.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const dx = e.clientX - dragStartXRef.current;
    dragDistanceRef.current = Math.max(dragDistanceRef.current, Math.abs(dx));
    track.scrollLeft = dragStartScrollRef.current - dx;
  }
  function onPointerUp() {
    if (draggingRef.current && dragDistanceRef.current > DRAG_CLICK_THRESHOLD_PX) setAutoAdvanceOn(false);
    draggingRef.current = false;
  }

  if (images.length === 0) return null;

  return (
    <div
      className="bws-gallery-carousel"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onTouchStart={() => { pausedRef.current = true; setAutoAdvanceOn(false); }}
      onFocus={() => { pausedRef.current = true; }}
      onBlur={() => { pausedRef.current = false; }}
    >
      <button
        type="button"
        className="bws-gallery-arrow bws-gallery-arrow-prev"
        aria-label="Previous photo"
        onClick={() => { setAutoAdvanceOn(false); scrollToIndex(Math.max(0, activeIndex - 1)); }}
      >
        ‹
      </button>
      <div
        ref={trackRef}
        className="bws-gallery-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {images.map((image, i) => (
          <button
            type="button"
            key={image.id}
            className="bws-gallery-item"
            onClick={() => { if (dragDistanceRef.current <= DRAG_CLICK_THRESHOLD_PX) setLightboxIndex(i); }}
            aria-label={`Open photo: ${image.caption ?? "A Bahamas Weddings By The Sea photo"}`}
          >
            <img src={image.imageUrl} alt={image.caption ?? "A Bahamas Weddings By The Sea photo"} loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
      <button
        type="button"
        className="bws-gallery-arrow bws-gallery-arrow-next"
        aria-label="Next photo"
        onClick={() => { setAutoAdvanceOn(false); scrollToIndex(Math.min(images.length - 1, activeIndex + 1)); }}
      >
        ›
      </button>
      <div className="bws-gallery-dots" role="group" aria-label="Choose a photo">
        {images.map((image, i) => (
          <button
            type="button"
            key={image.id}
            className={`bws-gallery-dot${i === activeIndex ? " bws-gallery-dot-active" : ""}`}
            aria-label={`Go to photo ${i + 1}`}
            aria-current={i === activeIndex}
            onClick={() => { setAutoAdvanceOn(false); scrollToIndex(i); }}
          />
        ))}
      </div>
      {lightboxIndex !== null && (
        <div className="bws-lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={() => setLightboxIndex(null)}>
          <img src={images[lightboxIndex].imageUrl} alt={images[lightboxIndex].caption ?? ""} />
          <button type="button" className="bws-lightbox-close" aria-label="Close photo viewer" onClick={() => setLightboxIndex(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
