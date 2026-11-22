import Image from "next/image";
import Link from "next/link";
import { HeroMotion } from "./_components/motion/HeroMotion";

// One static hero, no client JavaScript in the way of it. It used to cycle
// between a Futprep frame and a PortPass frame with a rotating "Register a
// child" block; a conference crowd is mostly business owners and adults,
// so the hero now just says what PortPass is and offers the two doors
// (round 4, item 5). The featured businesses moved to the "Open now" cards
// below.
//
// 19 Nov 2026 (Antonio): the hero speaks to business owners. PortPass is
// "a new set of eyes plus the tools": we diagnose what is stuck, fix it
// and run it with them (Business Ops' business plan uses the same words).
// Parents keep a door to the classes ("Find a class").
//
// Brief 22 (M2): the kicker, the headline's two lines, the lede and the
// buttons rise in 60 ms apart, and the photo drifts slowly. All of it is
// CSS (lib/motion/public.css) on text that is in the HTML at its final
// size, so the first screen is visible without any script; HeroMotion
// only pauses the drift while the hero is off-screen.
export function HomeHero() {
  return (
    // Signal (22 Nov 2026): palette A, and still (signal.css). Motions 01
    // to 04 are out, so the hero's rise, drift and Sun Drift are off here.
    <section className="pp-hero sg-hero" data-world="portpass" aria-label="PortPass">
      {/* The photo is a real, preloaded image (next/image, priority) rather
          than a CSS background, so the browser finds it in the HTML and
          fetches an AVIF sized to the screen straight away -- it is the
          page's largest paint. The gradient blend lives in CSS (::after). */}
      <div className="pp-hero-frame pp-hero-frame-on" data-frame-world="portpass" aria-hidden="true">
        <Image src="/futprep/lil-kickers/lil-kickers-training.jpg" alt="" fill priority sizes="100vw" quality={70} />
      </div>
      {/* Sun Drift (brief 22, M2 step 4): a glow that rises behind the
          words once, in CSS (lib/motion/public.css). Decorative. */}
      <div className="pp-hero-sun" aria-hidden="true" />
      <div className="pp-hero-scrim" />
      <div className="pp-hero-centre">
        <p className="pp-hero-kicker">For Bahamian businesses</p>
        <h1>
          <span className="pp-hero-line">A new set of eyes</span>
          <span className="pp-hero-line">for your business.</span>
        </h1>
        <p className="pp-hero-lede">We sit with you in Nassau, find what&rsquo;s been stuck for years, and fix it with tools built for cash, bank transfer and Kanoo. Then we run it with you. <strong>The first look is free.</strong></p>
        <div className="pp-hero-actions">
          <Link className="home-button" href="/apply?utm_source=home_hero">Book a free first look</Link>
          {/* Solid deck-white with navy text: readable on any photo (A3). */}
          <a className="home-button home-button-deck" href="#open-now">Find a class</a>
        </div>
      </div>
      <HeroMotion />
    </section>
  );
}
