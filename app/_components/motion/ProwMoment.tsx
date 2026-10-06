"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motionEnabled } from "@/lib/motion/client";

// The Prow moment (brief 22, M2). On the first load of the homepage in a
// session, a copy of the mark sits exactly over the header logo's mark and
// its two red stripes slide in behind the hull, like a ship cutting the
// water; then it fades and the ordinary logo underneath is what was there
// all along. It is a layer over one 36 px mark, never over content, and
// it never replays: once per session (sessionStorage, read inside
// try/catch) and once per page load whatever storage says.
//
// The markup is the supplied file public/brand/logo/portpass-mark-light.svg
// as delivered, with one extra group around the stripes to carry the
// slide (the clip stays on the outer group, so the hull always clips
// them). Nothing is redrawn and no colour is changed.
const SESSION_KEY = "portpass_prow_seen";
// The mark's own box, from its viewBox.
const MARK_W = 101;
const MARK_H = 95;
// The slide (--dur-slow), the fade after it (--dur-fast), and a little slack.
const TOTAL_MS = 600 + 150 + 80;

let shownThisLoad = false;

type Box = { left: number; top: number; width: number; height: number };

// Where the mark is drawn inside the header's logo. The horizontal logo
// draws the mark at its left edge, as tall as the logo; the standalone
// mark (phones) is letterboxed in its square box.
function markBox(brand: HTMLElement): Box | null {
  const images = Array.from(brand.querySelectorAll<HTMLImageElement>("img.brand-logo"));
  const img = images.find((candidate) => candidate.getBoundingClientRect().width > 0);
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  const home = brand.getBoundingClientRect();
  const ratio = MARK_W / MARK_H;
  if ((img.currentSrc || img.src).includes("portpass-mark")) {
    const width = Math.min(rect.width, rect.height * ratio);
    const height = width / ratio;
    return { left: rect.left - home.left + (rect.width - width) / 2, top: rect.top - home.top + (rect.height - height) / 2, width, height };
  }
  return { left: rect.left - home.left, top: rect.top - home.top, width: rect.height * ratio, height: rect.height };
}

export function ProwMoment() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (shownThisLoad || !motionEnabled()) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private browsing can refuse storage: the once-per-load guard above
      // still stops a replay on navigation.
    }
    const brand = document.querySelector<HTMLElement>(".site-shell-header .site-shell-brand");
    if (!brand) return;
    const place = markBox(brand);
    if (!place) return;
    shownThisLoad = true;
    setHost(brand);
    setBox(place);
    const timer = window.setTimeout(() => setHost(null), TOTAL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!host || !box) return null;
  return createPortal(
    <span className="prow-moment" aria-hidden="true" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 101.00 95.00" width="101" height="95" role="presentation" focusable="false">
        <g transform="translate(0.000 0.000) scale(1.00000) translate(-12 -11)">
          <defs>
            <clipPath id="prow-moment-clip">
              <path d="M12 106 L12 36 L113 11 Q76 40 77 106 Z" />
            </clipPath>
          </defs>
          <path d="M12 106 L12 36 L113 11 Q76 40 77 106 Z" fill="#0D1B3D" />
          <g clipPath="url(#prow-moment-clip)">
            <g className="prow-moment-stripes">
              <path d="M58 106 Q57 58 100 22" stroke="#D7232B" strokeWidth="5.5" fill="none" />
              <path d="M67.5 106 Q66.5 52 112 8" stroke="#D7232B" strokeWidth="5.5" fill="none" />
            </g>
          </g>
          <path d="M27 94 V50" stroke="#FFFFFF" strokeWidth="10" fill="none" />
          <path d="M22 50 H35 A11.5 11.5 0 0 1 35 73 H27" stroke="#FFFFFF" strokeWidth="9" fill="none" strokeLinejoin="round" />
        </g>
      </svg>
    </span>,
    host,
  );
}
