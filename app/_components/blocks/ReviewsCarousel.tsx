"use client";

import { useEffect, useRef, useState } from "react";
import { initCarousel } from "./carouselEngine";

const WIDGET_TARGET_ID = "wp-widget-reviews";
const CONTENT_TIMEOUT_MS = 6000;

// Wraps a WeddingWire-style reviews widget in the same tpl-carousel engine
// the gallery uses -- but the widget injects its own DOM asynchronously
// into #wp-widget-reviews (the loader script fetches and renders after
// mount), so this can't just render children and start the engine like
// Carousel does. Three things have to happen in order:
//   1. Run the widget's own <script> tags -- in sequence, since a
//      dynamically created <script src> loads async and an inline script
//      calling its function immediately after would otherwise throw
//      "X is not defined" (a real bug found and fixed in an earlier round).
//   2. Wait for the widget to actually replace its own static placeholder
//      with real content -- a MutationObserver, not a fixed delay, since
//      there's no reliable timing guarantee on a third-party fetch.
//   3. Only once real content exists, tag it as carousel items and start
//      initCarousel -- starting it on the empty placeholder would just
//      drift a single static div.
// If nothing arrives within 6s, the whole section removes itself rather
// than leave a hole where reviews should be -- a third-party outage (or,
// as found last round, a widget domain-locked to a different hostname)
// must not look broken.
export function ReviewsCarousel({ html, speed }: { html: string; speed: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [removed, setRemoved] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  // Deferred load, same as the trust-strip badges: three third-party
  // scripts loading eagerly would cost first paint on mobile. A
  // setTimeout fallback exists alongside the IntersectionObserver because
  // that observer can be throttled or never fire on a backgrounded tab.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    const fallback = window.setTimeout(() => setShouldLoad(true), 4000);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !shouldLoad) return;
    let cancelled = false;

    async function runScriptsInOrder() {
      for (const oldScript of Array.from(track!.querySelectorAll("script"))) {
        if (cancelled) return;
        const newScript = document.createElement("script");
        for (const attr of Array.from(oldScript.attributes)) newScript.setAttribute(attr.name, attr.value);
        newScript.textContent = oldScript.textContent;
        if (newScript.src) {
          await new Promise<void>((resolve) => {
            newScript.onload = () => resolve();
            newScript.onerror = () => resolve();
            oldScript.replaceWith(newScript);
          });
        } else {
          oldScript.replaceWith(newScript);
        }
      }
    }
    runScriptsInOrder();

    return () => {
      cancelled = true;
    };
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    const track = trackRef.current;
    const root = rootRef.current;
    if (!track || !root) return;

    let settled = false;
    let cleanupEngine: (() => void) | null = null;

    function start() {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeoutId);
      const preview = track!.querySelector("#wp-widget-preview");
      Array.from(track!.children).forEach((child) => {
        if (child.tagName === "SCRIPT") {
          // initCarousel clones whatever's left in the track -- a leftover
          // <script> element re-executes every time cloneNode+appendChild
          // runs on it, which would call wpShowReviews() again on every
          // loop clone. It already ran; it has no reason to still be here.
          child.remove();
        } else if (child !== preview) {
          child.classList.add("tpl-carousel-item");
        }
      });
      preview?.remove();
      cleanupEngine = initCarousel(root!, { speed });
    }

    function onTimeout() {
      if (settled) return;
      settled = true;
      observer.disconnect();
      setRemoved(true);
    }

    const observer = new MutationObserver(() => {
      // More than just the static #wp-widget-preview placeholder -- and
      // not counting <script> tags themselves, which get removed and
      // re-inserted by the sequential script-loading effect above and
      // would otherwise look like "real content" the instant that runs,
      // long before the widget has actually rendered anything.
      const preview = track!.querySelector("#wp-widget-preview");
      const realChildren = Array.from(track!.children).filter((c) => c !== preview && c.tagName !== "SCRIPT");
      if (realChildren.length > 0) start();
    });
    observer.observe(track, { childList: true });
    const timeoutId = window.setTimeout(onTimeout, CONTENT_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
      cleanupEngine?.();
    };
  }, [shouldLoad, speed]);

  if (removed) return null;

  return (
    <div ref={rootRef} className="tpl-carousel tpl-carousel-reviews">
      <button type="button" className="tpl-carousel-btn tpl-carousel-prev" aria-label="Previous reviews">‹</button>
      <div ref={trackRef} id={WIDGET_TARGET_ID} className="tpl-carousel-track" dangerouslySetInnerHTML={shouldLoad ? { __html: html } : undefined} />
      <button type="button" className="tpl-carousel-btn tpl-carousel-next" aria-label="Next reviews">›</button>
      <button type="button" className="tpl-carousel-pause" aria-label="Pause or play this carousel" />
    </div>
  );
}
