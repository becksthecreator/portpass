"use client";

import { useEffect, useRef, useState } from "react";
import type { WeddingGalleryImage } from "@/db/weddingSite";

const CYCLE_MS = 4000;
const FADE_MS = 1200;

export function GalleryCycle({ images }: { images: WeddingGalleryImage[] }) {
  const [index, setIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const reducedRef = useRef(false);

  useEffect(() => {
    try {
      reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function onVisibility() {
      setTabHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (reducedRef.current || hoverPaused || tabHidden || images.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [hoverPaused, tabHidden, images.length]);

  if (images.length === 0) return null;
  const active = images[index];

  return (
    <div
      className="bws-gallery-cycle"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
    >
      {images.map((image, i) => (
        <img
          key={image.id}
          src={image.imageUrl}
          alt={image.caption ?? "A Bahamas Weddings By The Sea photo"}
          className={`bws-gallery-cycle-frame${i === index ? " bws-gallery-cycle-frame-on" : ""}`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          aria-hidden={i !== index}
        />
      ))}
      {active.photographerName && (
        <span className="bws-gallery-credit">
          📷 {active.photographerUrl ? <a href={active.photographerUrl} target="_blank" rel="noopener noreferrer">{active.photographerName}</a> : active.photographerName}
        </span>
      )}
    </div>
  );
}
