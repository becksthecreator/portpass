import Image from "next/image";
import Link from "next/link";
import "./front-door.css";

// Home page Section 1, "The front door" (Site Design, 23 Nov 2026: "The
// website is the doorway to the app"). Bex picked option B, "more realism"
// (24 Nov): the words beside real photographs and a real PortPass screen.
//
// The line under the headline must be true on launch day, so it names no
// category that isn't live. The pictures are both Futprep (approved set):
// a training session and the whole squad at a distance, so no child's face
// is prominent. The Bahamas Weddings couple photo waits for the client's OK.
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
      <p className="fd-lede">Bookings and payments for Bahamian businesses. Starting with sports and fitness, opening to every business. You pay the business directly, by cash or bank transfer.</p>
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
        <Image src="/futprep/lil-kickers/lil-kickers-training.jpg" alt="" fill priority sizes="(max-width: 900px) 60vw, 360px" quality={72} />
      </div>
      <div className="fd-photo fd-photo-b">
        <Image src="/futprep/lil-kickers/lil-kickers-coach.jpg" alt="" fill sizes="(max-width: 900px) 50vw, 300px" quality={72} />
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
