"use client";

import { useEffect } from "react";

// The hero photo's slow drift (lib/motion/public.css) is the one animation
// on the site that loops. It runs only while the hero is on screen: once
// the visitor has scrolled past, data-offscreen on .pp-hero pauses it and
// drops its compositor layer (brief 22, M2: "will-change only while
// visible", "pause anything off-screen"). Renders nothing; without script
// the drift simply keeps running, as the hero is at the top of the page.
export function HeroMotion() {
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(".pp-hero");
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) hero.removeAttribute("data-offscreen");
          else hero.setAttribute("data-offscreen", "");
        }
      },
      { threshold: 0 },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  return null;
}
