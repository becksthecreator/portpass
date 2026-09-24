"use client";

import { useEffect, useRef } from "react";
import { initCarousel } from "./carouselEngine";

// A generic tpl-carousel instance for a known, fixed set of items (photos,
// cards, anything rendered as children up front) -- the gallery uses this
// directly. The reviews carousel doesn't: its content arrives
// asynchronously from a third-party widget, so it defers starting the
// engine itself (see ReviewsCarousel) instead of auto-initialising on
// mount like this one does.
export function Carousel({
  variant,
  speed,
  prevLabel,
  nextLabel,
  children,
}: {
  variant: "gallery" | "reviews";
  speed: number;
  prevLabel: string;
  nextLabel: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return initCarousel(rootRef.current, { speed });
  }, [speed]);

  return (
    <div ref={rootRef} className={`tpl-carousel tpl-carousel-${variant}`}>
      <button type="button" className="tpl-carousel-btn tpl-carousel-prev" aria-label={prevLabel}>‹</button>
      <div className="tpl-carousel-track">{children}</div>
      <button type="button" className="tpl-carousel-btn tpl-carousel-next" aria-label={nextLabel}>›</button>
      <button type="button" className="tpl-carousel-pause" aria-label="Pause or play this carousel" />
    </div>
  );
}
