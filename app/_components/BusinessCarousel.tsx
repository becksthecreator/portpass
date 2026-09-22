"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BusinessLogo } from "./blocks/BusinessLogo";
import { categoryLabel } from "./blocks/categoryLabel";
import { directoryHref } from "./blocks/directoryHref";
import type { OrganizationDirectoryEntry } from "@/db/organizations";

const AUTO_ADVANCE_MS = 4000;
// Below this count a carousel of its own looks broken -- render a static
// row instead (no cycling, arrows or dots) until a fourth business joins.
const MIN_TO_CYCLE = 4;

export function BusinessCarousel({ businesses }: { businesses: OrganizationDirectoryEntry[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  const cycles = businesses.length >= MIN_TO_CYCLE;

  const scrollToIndex = useCallback(
    (i: number) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = ((i % businesses.length) + businesses.length) % businesses.length;
      const tile = track.children[clamped] as HTMLElement | undefined;
      if (tile) track.scrollTo({ left: tile.offsetLeft, behavior: "smooth" });
      setIndex(clamped);
    },
    [businesses.length]
  );

  // Auto-cycle when idle. Paused on hover/touch (see the section handlers
  // below) and stopped entirely below the static-row threshold.
  useEffect(() => {
    if (!cycles || paused) return;
    const id = setInterval(() => scrollToIndex(index + 1), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [cycles, paused, index, scrollToIndex]);

  // Keeps the dots/arrows in sync no matter how the scroll happened --
  // auto-advance, a drag, or a native touch swipe.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const children = Array.from(track.children) as HTMLElement[];
        let closest = 0;
        let closestDist = Infinity;
        children.forEach((child, i) => {
          const dist = Math.abs(child.offsetLeft - track.scrollLeft);
          if (dist < closestDist) {
            closestDist = dist;
            closest = i;
          }
        });
        setIndex(closest);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Touch swiping is native (the track scrolls); this only handles mouse
  // click-and-drag, which browsers don't give a scroll container for free.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const track = trackRef.current;
    if (!track) return;
    isDragging.current = true;
    dragMoved.current = false;
    dragStartX.current = e.clientX;
    dragStartScroll.current = track.scrollLeft;
    track.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const track = trackRef.current;
    if (!track) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 4) dragMoved.current = true;
    track.scrollLeft = dragStartScroll.current - dx;
  };
  const endDrag = () => {
    isDragging.current = false;
  };
  // A drag that moved the track shouldn't also fire the tile's link.
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      dragMoved.current = false;
    }
  };

  if (businesses.length === 0) return null;

  return (
    <section
      className="carousel"
      aria-label="Open now on PortPass"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div className="carousel-header">
        <h2>Open now on PortPass.</h2>
        {cycles && (
          <div className="carousel-arrows">
            <button type="button" aria-label="Previous business" onClick={() => scrollToIndex(index - 1)}>‹</button>
            <button type="button" aria-label="Next business" onClick={() => scrollToIndex(index + 1)}>›</button>
          </div>
        )}
      </div>
      <div
        className={`carousel-track${cycles ? "" : " carousel-track-static"}`}
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        {businesses.map((biz) => (
          <Link key={biz.slug} href={directoryHref(biz.slug, biz.primaryCategory)} className="carousel-tile">
            <BusinessLogo logoUrl={biz.logoUrl} name={biz.name} brand={biz.brandColor ?? "#e8794a"} size="lg" />
            <span className="carousel-tile-name">{biz.name}</span>
            {biz.primaryCategory && <span className="carousel-tile-category">{categoryLabel(biz.primaryCategory)}</span>}
          </Link>
        ))}
      </div>
      {cycles && (
        <div className="carousel-dots">
          {businesses.map((biz, i) => (
            <button
              key={biz.slug}
              type="button"
              aria-label={`Go to ${biz.name}`}
              className={i === index ? "is-active" : ""}
              onClick={() => scrollToIndex(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
