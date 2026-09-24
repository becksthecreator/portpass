"use client";

import { useEffect, useRef, useState } from "react";

const WIDGET_TARGET_ID = "wp-widget-reviews";
const CONTENT_TIMEOUT_MS = 6000;

// Deliberately not a carousel, unlike the gallery: reviews are read, and
// moving text is the enemy of reading -- a fixed panel a bride scrolls at
// her own pace is calmer and still shows there are a hundred of them. This
// is styling on the WeddingWire widget's own injected DOM, never copied
// text (the PR #26 rule, untouched).
//
// The widget renders asynchronously -- and, live-checked, appears to go
// through a bot-verification step (DataDome) that inserts its own
// intermediate DOM nodes before the actual reviews settle. That's fine
// here in a way it wasn't for a carousel: this component doesn't clone or
// snapshot anything, so removing the static placeholder a little early
// (on the first sign of real content, rather than waiting for mutations
// to go quiet) is harmless -- whatever the widget adds afterward just
// continues to render inside the same scrollable div.
export function ReviewsPanel({ html }: { html: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [removed, setRemoved] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  // Deferred load: a third-party script loading eagerly would cost first
  // paint on mobile. The setTimeout fallback exists alongside the
  // IntersectionObserver because that observer can be throttled or never
  // fire on a backgrounded tab.
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

  // dangerouslySetInnerHTML never executes embedded <script> tags (a
  // browser security behavior). WeddingWire's widget is markup plus a
  // loader script that populates it, so scripts have to be re-created as
  // real DOM nodes -- in sequence, since a dynamically created
  // <script src> loads asynchronously and the inline script calling its
  // function immediately after would otherwise throw "X is not defined"
  // (a real bug found and fixed in an earlier round of this exact widget).
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
    if (!track) return;

    let settled = false;

    const observer = new MutationObserver(() => {
      const preview = track.querySelector("#wp-widget-preview");
      const realChildren = Array.from(track.children).filter((c) => c !== preview && c.tagName !== "SCRIPT");
      if (realChildren.length === 0 || settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeoutId);
      preview?.remove();
      track.dataset.ready = "1";
    });
    observer.observe(track, { childList: true, subtree: true });

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      setRemoved(true);
    }, CONTENT_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [shouldLoad]);

  if (removed) return null;

  return (
    <div ref={rootRef} className="tpl-reviews-panel">
      <div
        ref={trackRef}
        id={WIDGET_TARGET_ID}
        className="tpl-reviews-scroll"
        tabIndex={0}
        role="region"
        aria-label="Reviews from WeddingWire, scrollable"
        dangerouslySetInnerHTML={shouldLoad ? { __html: html } : undefined}
      />
    </div>
  );
}
