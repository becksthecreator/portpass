"use client";

import { useEffect, useRef, useState } from "react";

// Carried over verbatim from the old bahamas-by-the-sea bespoke page
// (BwsArrival.tsx, deleted in the 25 Sept Part 2 cleanup) -- same session
// key, same attribute, same timings (900ms hold, 700ms fade). Only
// mounts today via app/sites/[slug]/page.tsx for the bahamas-weddings
// slug, which nothing reaches by direct navigation now that /sites/
// bahamas-weddings redirects -- it stays dormant, ready for the day that
// business gets a real custom_domain. The beforeInteractive no-flash
// guard that used to hold the page invisible until this component's
// timers cleared it was deleted along with the two routes it checked
// for by path; a real custom-domain launch should add path-independent
// no-flash handling back (e.g. gated on host, not pathname) rather than
// relying on this comment.
const SESSION_KEY = "bws_arrival_seen"; // deliberately NOT portpass_arrival_seen

export function BusinessArrivalPlate({ mark, word, sub }: { mark: string; word: string; sub: string }) {
  const [state, setState] = useState<"playing" | "gone">("playing");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      seen = false;
    }

    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // ignore
    }

    if (seen || reduced) {
      document.documentElement.removeAttribute("data-bws-arriving");
      setState("gone");
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // ignore
      }
      return;
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }

    timers.current.push(
      setTimeout(() => {
        document.documentElement.setAttribute("data-bws-arriving", "leaving");
      }, 900),
      setTimeout(() => {
        document.documentElement.removeAttribute("data-bws-arriving");
        setState("gone");
      }, 1700)
    );

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      document.documentElement.removeAttribute("data-bws-arriving");
    };
  }, []);

  if (state === "gone") return null;

  return (
    <div className="bws-plate" aria-hidden="true">
      <span className="bws-plate-mark">{mark}</span>
      <span className="bws-plate-word">{word}</span>
      <span className="bws-plate-rule" />
      <span className="bws-plate-sub">{sub}</span>
    </div>
  );
}
