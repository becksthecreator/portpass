"use client";

import { useEffect } from "react";

// The header condenses once the page has scrolled 24 px (brief 22, M2):
// data-condensed on .site-shell-header, and lib/motion/public.css does the
// rest with a transform on the logo and a rule that fades in. One passive
// scroll listener, one frame at a time. Not gated on the motion switches:
// the condensed state is a final state too, and with motion off the
// stylesheet simply applies it at once.
const CONDENSE_AT = 24;

export function HeaderMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-shell-header");
    if (!header) return;
    let condensed = false;
    let waiting = false;
    const update = () => {
      waiting = false;
      const next = window.scrollY > CONDENSE_AT;
      if (next === condensed) return;
      condensed = next;
      if (next) header.setAttribute("data-condensed", "");
      else header.removeAttribute("data-condensed");
    };
    const onScroll = () => {
      if (waiting) return;
      waiting = true;
      window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      header.removeAttribute("data-condensed");
    };
  }, []);
  return null;
}
