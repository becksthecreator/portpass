"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "portpass_arrival_seen";
// Mark scales in at 60ms (520ms), wordmark opens at 300ms (620ms), a brief
// hold, then lift. Total ~1.9s -- longer stops being a flourish and starts
// being a wait.
const HOLD_MS = 1120;
const LIFT_MS = 780;

// Homepage-only brand moment. Renders nothing during SSR/hydration -- the
// real page is already in the HTML underneath -- and nothing at all if
// reduced motion is requested or this session has already seen it. An
// overlay, never a gate: if this component never mounts (JS blocked/fails),
// the visitor simply sees the site.
export function ArrivalPlate() {
  const [visible, setVisible] = useState(false);
  const [lifting, setLifting] = useState(false);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // ignore
    }
    if (reduced) return;

    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // private browsing can throw on storage access -- treat as unseen
    }
    if (seen) return;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(true);

    let lifted = false;
    let hideTimer: number | undefined;

    // Idempotent: called either by the hold timer or by the first input
    // event, whichever comes first, so a click/keypress/scroll clears the
    // plate immediately instead of waiting out the hold.
    function lift() {
      if (lifted) return;
      lifted = true;
      setLifting(true);
      hideTimer = window.setTimeout(() => setVisible(false), LIFT_MS);
    }

    const holdTimer = window.setTimeout(lift, HOLD_MS);
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((event) => window.addEventListener(event, lift, { passive: true }));

    return () => {
      window.clearTimeout(holdTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      events.forEach((event) => window.removeEventListener(event, lift));
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`pp-arrival-plate${lifting ? " pp-arrival-lift" : ""}`}
      data-world="portpass"
      aria-hidden="true"
      role="presentation"
    >
      <span className="pp-arrival-mark">P</span>
      <span className="pp-arrival-wordmark">PORTPASS</span>
    </div>
  );
}
