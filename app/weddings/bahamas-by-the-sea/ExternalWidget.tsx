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
    let cancelled = false;
    el.innerHTML = html;

    // Each widget is an external loader script followed by an inline script
    // that immediately calls a function the loader defines (e.g.
    // wpShowReviews(946150, "red")). A dynamically created <script src>
    // loads asynchronously by default, so replacing every <script> in the
    // same pass -- as this used to -- ran the inline call before the
    // loader had actually defined anything: it threw
    // "wpShowReviews is not defined" every time, and the widget never
    // populated past WeddingWire's own static placeholder. Scripts here run
    // strictly in order instead, awaiting each external one's load event
    // before moving to the next.
    async function runScriptsInOrder() {
      for (const oldScript of Array.from(el!.querySelectorAll("script"))) {
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
  }, [shouldLoad, html]);

  // Empty until it loads, then whatever WeddingWire's own markup renders --
  // its static fallback content if the script never runs, so a third-party
  // outage never leaves a visible hole in the page.
  return <div ref={containerRef} className={className} />;
}
