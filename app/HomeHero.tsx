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
// Brief 22 (M2): the kicker, the headline's two lines, the lede and the
// buttons rise in 60 ms apart, and the photo drifts slowly. All of it is
// CSS (lib/motion/public.css) on text that is in the HTML at its final
// size, so the first screen is visible without any script; HeroMotion
// only pauses the drift while the hero is off-screen.
export function HomeHero({ openSentence = "" }: { openSentence?: string }) {
  return (
    <section className="pp-hero" data-world="portpass" aria-label="PortPass">
      {/* The photo is a real, preloaded image (next/image, priority) rather
          than a CSS background, so the browser finds it in the HTML and
          fetches an AVIF sized to the screen straight away -- it is the
          page's largest paint. The gradient blend lives in CSS (::after). */}
      <div className="pp-hero-frame pp-hero-frame-on" data-frame-world="portpass" aria-hidden="true">
        <Image src="/weddings/bahamas-by-the-sea/hero.jpg" alt="" fill priority sizes="100vw" quality={70} />
      </div>
      <div className="pp-hero-scrim" />
      <div className="pp-hero-centre">
        <p className="pp-hero-kicker">The Bahamas, one pass at a time</p>
        <h1>
          <span className="pp-hero-line">Everything worth booking</span>
          <span className="pp-hero-line">in The Bahamas.</span>
        </h1>
        <p className="pp-hero-lede">Sports sessions, weddings, venues and events — found and booked in one place.{openSentence ? ` ${openSentence}` : ""}</p>
        <div className="pp-hero-actions">
          <a className="home-button" href="#open-now">Browse what&rsquo;s on</a>
          {/* Solid deck-white with navy text: readable on any photo (A3). */}
          <Link className="home-button home-button-deck" href="/business">List your business</Link>
        </div>
      </div>
      <HeroMotion />
    </section>
  );
}
