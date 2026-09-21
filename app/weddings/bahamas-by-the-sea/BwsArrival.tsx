"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "bws_arrival_seen"; // deliberately NOT portpass_arrival_seen

// A separate brand moment from the PortPass homepage's plate. Landing here
// should feel like arriving on Antonio's own business, not a sub-page of a
// sports platform -- see the no-flash guard (next/script, beforeInteractive)
// in page.tsx, which sets data-bws-arriving="holding" on <html> before any
// stylesheet paints, and app/globals.css's [data-bws-arriving] rules.
export function BwsArrival() {
  const [state, setState] = useState<"playing" | "gone">("playing");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      seen = false; // private mode / blocked storage -- just play it
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
      }, 1700),
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
      <span className="bws-plate-mark">🌴</span>
      <span className="bws-plate-word">Bahamas</span>
      <span className="bws-plate-rule" />
      <span className="bws-plate-sub">Weddings by the sea</span>
    </div>
  );
}
