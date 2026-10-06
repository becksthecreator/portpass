"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { motionEnabled, tokenMs } from "@/lib/motion/client";
import { isQuietPath } from "@/lib/motion/neverList";

// The Ferry Route (brief 22, M5): a slim rule of --signal at the very top
// of the screen for a navigation that takes longer than --dur-fast, with a
// tiny red ferry riding its leading edge. Transform and opacity only
// (lib/motion/public.css); it never takes space and never loops: the
// ferry sails only while a page is on its way and leaves with the rule.
//
// It runs only for a link followed from one of the main public pages (the
// ones the header marks with the Tide Wipe's panel: home, the sections,
// pricing, about) to another page, and never for a link into the places
// the rules keep still (lib/motion/neverList.ts). Arriving anywhere but a
// main page, it simply goes, with no transition. A link to the same path
// (another query or hash) is not a new page and starts nothing. Reduced
// motion and the kill switch leave it out altogether, and it never
// replaces the browser's own loading indicator.

// A main public page renders the Tide Wipe's panel (SiteHeader tide).
const onMainPage = () => Boolean(document.querySelector(".tide-panel"));

// However a navigation ends, the bar never outstays this: a move that was
// prevented, cancelled or replaced without the address changing would
// otherwise leave it up. Not a motion duration, a safety limit; the
// browser's own loading indicator carries on.
const GIVE_UP_MS = 10_000;

function clearTimer(timer: MutableRefObject<number | null>) {
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"off" | "on" | "done">("off");
  const pending = useRef<number | null>(null);

  // The address changed: whatever was pending has arrived.
  useEffect(() => {
    clearTimer(pending);
    setState((current) => (current === "on" && onMainPage() ? "done" : "off"));
  }, [pathname]);

  useEffect(() => {
    if (state === "off") return;
    const timer = window.setTimeout(() => setState("off"), state === "done" ? tokenMs("--dur-slow", 600) : GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!motionEnabled()) return;
    const onClick = (event: MouseEvent) => {
      // A new click supersedes whatever was pending, whether or not it
      // starts a bar of its own (a section link, then quickly "Sign in").
      clearTimer(pending);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const to = new URL(anchor.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname || !onMainPage() || isQuietPath(to.pathname)) return;
      const from = window.location.pathname;
      pending.current = window.setTimeout(() => {
        pending.current = null;
        if (window.location.pathname === from) setState("on");
      }, tokenMs("--dur-fast", 150));
    };
    // Back, Forward, or a page restored from the browser's cache: nothing
    // that was pending is still on its way.
    const reset = () => {
      clearTimer(pending);
      setState("off");
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", reset);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", reset);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <div className="route-progress" data-state={state} aria-hidden="true">
      <span className="route-progress-bar" />
      <span className="route-ferry-track">
        {/* The ferry, facing forward: hull, cabin and funnel. */}
        <svg className="route-ferry" viewBox="0 0 16 10" width="14" height="9" focusable="false">
          <path d="M0 6H16L13.5 10H2.5Z" />
          <path d="M3 3H11V6H3Z" />
          <path d="M8 0H10V3H8Z" />
        </svg>
      </span>
    </div>
  );
}
