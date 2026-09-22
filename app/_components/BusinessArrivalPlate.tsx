"use client";

import { useEffect, useRef, useState } from "react";

// Carried over verbatim from the old bahamas-by-the-sea bespoke page
// (BwsArrival.tsx) -- same session key, same attribute, same timings
// (900ms hold, 700ms fade) -- just no longer tied to that one route.
// The no-flash guard that sets data-bws-arriving="holding" on <html>
// before first paint lives in app/layout.tsx (BWS_ARRIVAL_GUARD,
// beforeInteractive) and is unaffected by this component's move.
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
