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

      <div className="pp-hero-top">
        <Link className="pp-hero-brand" href="/" aria-label="PortPass home"><span className="pp-hero-mark">P</span><span>PORTPASS</span></Link>
        <nav className="pp-hero-nav" aria-label="Primary">
          <a href="#chooser">Browse</a>
          <a href="#chooser">Live now</a>
          <Link href="/apply">For business</Link>
        </nav>
      </div>

      <Link className="pp-hero-clickzone" href={active.href} aria-label={`${active.cta} — ${active.name}`}>
        <div className="pp-hero-centre">
          <p className="pp-hero-kicker">The Bahamas, one pass at a time</p>
          <h1>Your way in,<br /><em>wherever you&rsquo;re headed.</em></h1>
        </div>

        <div className="pp-hero-bottom">
          <div className="pp-hero-who">
            <span className="pp-hero-chip">{active.chip}</span>
            <b>{active.name}</b>
            <span className="pp-hero-meta">{active.meta}</span>
          </div>
          <span className="pp-hero-go">{active.cta}</span>
        </div>
      </Link>
    </section>
  );
}
