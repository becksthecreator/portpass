import Link from "next/link";

// One static hero, no client JavaScript. It used to cycle between a
// Futprep frame and a PortPass frame with a rotating "Register a child"
// block; a conference crowd is mostly business owners and adults, so the
// hero now just says what PortPass is and offers the two doors (round 4,
// item 5). The featured businesses moved to the "Open now" cards below.
export function HomeHero() {
  return (
    <section className="pp-hero" data-world="portpass" aria-label="PortPass">
      <div className="pp-hero-frame pp-hero-frame-on" data-frame-world="portpass" aria-hidden="true" />
      <div className="pp-hero-scrim" />
      <div className="pp-hero-centre">
        <p className="pp-hero-kicker">The Bahamas, one pass at a time</p>
        <h1>Everything worth booking in The Bahamas.</h1>
        <p className="pp-hero-lede">Sports sessions, weddings, venues and events — found and booked in one place. Two are open right now.</p>
        <div className="pp-hero-actions">
          <a className="home-button" href="#open-now">Browse what&rsquo;s on</a>
          <Link className="home-button home-button-light" href="/business">List your business</Link>
        </div>
      </div>
    </section>
  );
}
