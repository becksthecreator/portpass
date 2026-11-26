import Image from "next/image";
import Link from "next/link";
import "./front-door.css";

// Home page Section 1, "The front door" (Site Design, 23 Nov 2026: "The
// website is the doorway to the app"). Bex picked option B, "more realism"
// (24 Nov): the words beside real photographs and a real PortPass screen.
//
// The pictures: Futprep training (the photo the old hero used) and a
// Bahamas Weddings By The Sea ceremony (Bex approved, 24 Nov: we
// advertise that client's site too). The line under the headline is
// option B's every-business line, which Bex accepts as true.
// The screen is the demo business's payment request page, which carries its
// own "Demo business: example data" banner.

function Words() {
  return (
    <div className="fd-words">
      <p className="fd-kicker">PortPass Bahamas</p>
      <h1 className="fd-title" id="fd-title">
        <span className="fd-phrase">Find it,</span> <span className="fd-phrase">book it,</span> <span className="fd-phrase">pay it.</span>{" "}
        <span className="fd-phrase fd-one">One app.</span>
      </h1>
      <p className="fd-lede">Classes, tours, tables, appointments and events from businesses across The Bahamas. Book in a few taps, pay the way you already do, and keep it all on your phone.</p>
      <form className="fd-search" action="/search" method="get" role="search">
        <label className="fd-search-label" htmlFor="fd-q">What are you looking for?</label>
        <div className="fd-search-row">
          <input id="fd-q" name="q" type="search" placeholder="What are you looking for?" autoComplete="off" maxLength={80} />
          <button type="submit">Search</button>
        </div>
      </form>
      <div className="fd-actions">
        <Link className="home-button" href="/app">Get the app</Link>
        <Link className="fd-owner" href="/apply">Run a business? Put it on PortPass →</Link>
      </div>
    </div>
  );
}

function RealPictures() {
  return (
    <div className="fd-real" aria-hidden="true">
      <div className="fd-photo fd-photo-a">
        {/* Eager, but no `priority` preload: on a phone this photo sits
            under the words, and the page's largest paint is the line under
            the headline. A high-priority image preload competed with the
            stylesheet that paint waits for (motion check, Lighthouse LCP). */}
        <Image src="/futprep/lil-kickers/lil-kickers-training.jpg" alt="" fill loading="eager" sizes="(max-width: 900px) 60vw, 360px" quality={72} />
      </div>
      <div className="fd-photo fd-photo-b">
        <Image src="/weddings/bahamas-by-the-sea/bws-12.webp" alt="" fill sizes="(max-width: 900px) 50vw, 300px" quality={72} />
      </div>
      <div className="fd-device">
        <Image src="/brand/product/shot-pay.png" alt="" fill sizes="(max-width: 900px) 45vw, 240px" />
      </div>
    </div>
  );
}

export function FrontDoor() {
  return (
    <section className="fd" aria-labelledby="fd-title">
      <div className="fd-inner">
        <Words />
        <RealPictures />
      </div>
    </section>
  );
}
