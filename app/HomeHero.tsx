"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type HeroFrame = {
  world: "futprep" | "portpass";
  chip: string;
  name: string;
  meta: string;
  cta: string;
  href: string;
};

const CYCLE_MS = 4000;
const FADE_MS = 1200;

export function HomeHero({ frames }: { frames: HeroFrame[] }) {
  const [index, setIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const reducedRef = useRef(false);

  useEffect(() => {
    try {
      reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // ignore
    }
  }, []);

  // Never animate in a background tab.
  useEffect(() => {
    function onVisibility() {
      setTabHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (reducedRef.current || hoverPaused || tabHidden || frames.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [hoverPaused, tabHidden, frames.length]);

  if (frames.length === 0) return null;
  const active = frames[index];

  return (
    <section
      className="pp-hero"
      data-world={active.world}
      aria-roledescription="carousel"
      aria-label="Featured on PortPass"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
    >
      {frames.map((frame, i) => (
        <div
          key={frame.world + frame.name}
          className={`pp-hero-frame${i === index ? " pp-hero-frame-on" : ""}`}
          data-frame-world={frame.world}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          aria-hidden={i !== index}
        />
      ))}
      <div className="pp-hero-scrim" />

      <div className="pp-hero-centre">
        <p className="pp-hero-kicker">The Bahamas, one pass at a time</p>
        <h1>Everything worth booking in The Bahamas.</h1>
        <p className="pp-hero-lede">Sports sessions, weddings, venues and events — found, booked and paid for in one place. Two are open right now.</p>
      </div>

      <div className="pp-hero-bottom">
        <span className="pp-hero-chip">{active.chip}</span>
        <span className="pp-hero-name">{active.name}</span>
        <span className="pp-hero-meta">{active.meta}</span>
        <Link className="pp-hero-go" href={active.href}>{active.cta} <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  );
}
