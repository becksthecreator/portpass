"use client";

import { useEffect, useRef, useState } from "react";

// Setting .innerHTML (what dangerouslySetInnerHTML does under the hood)
// never executes embedded <script> tags -- a browser security behavior,
// not a framework quirk. WeddingWire's rating badge, award badge and
// reviews widget embeds are exactly this: static markup plus a loader
// script that populates it. Pasting the raw HTML into a plain div would
// render the static fallback (WeddingWire builds one into each snippet)
// but never actually run the widget.
//
// This re-creates each <script> tag as a real DOM node, which does
// execute, once the widget has scrolled near the viewport -- "load
// deferred, after page content" from the brief, since three third-party
// loaders in <head> would cost first paint on the mobile connections most
// of Antonio's couples are on.
export function ExternalWidget({ html, className }: { html: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
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
    // A fallback, not the primary path: IntersectionObserver callbacks are
    // throttled or suspended on a backgrounded/hidden tab in some browsers,
    // and could in principle never fire before a visitor switches back to
    // this tab. Same reasoning as the arrival-guard's CSS failsafe
    // elsewhere on this page -- a real widget must not depend on exactly
    // one signal to ever load.
    const fallback = window.setTimeout(() => setShouldLoad(true), 4000);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldLoad) return;
    el.innerHTML = html;
    for (const oldScript of Array.from(el.querySelectorAll("script"))) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) newScript.setAttribute(attr.name, attr.value);
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    }
  }, [shouldLoad, html]);

  // Empty until it loads, then whatever WeddingWire's own markup renders --
  // its static fallback content if the script never runs, so a third-party
  // outage never leaves a visible hole in the page.
  return <div ref={containerRef} className={className} />;
}
