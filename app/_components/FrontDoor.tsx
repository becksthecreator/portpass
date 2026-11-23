import Image from "next/image";
import Link from "next/link";
import "./front-door.css";

// Home page Section 1, "The front door" (Site Design, 23 Nov 2026: "The
// website is the doorway to the app"), built for Bex to choose between two
// treatments of the same words (PREVIEW, not merged):
//   motion: the headline arrives phrase by phrase, and a drawn phone shows
//           the app at work (chips cycle, bookings slide in, a booking is
//           stamped paid, the Member Pass shimmers). All CSS; everything
//           sits still at its final state under reduced motion.
//   real:   the same words beside real photographs (Futprep training, a
//           Bahamas Weddings By The Sea ceremony) and a real PortPass
//           screen from the demo business, which carries its own "Demo
//           business: example data" banner.
// The words are Site Design's Headline A and its line under. Every link goes
// somewhere real: /search, /app (add PortPass to the home screen) and
// /business.

type Variant = "motion" | "real";

const CHIPS = ["Classes", "Tours", "Food", "Beauty", "Events"];

function Words({ variant }: { variant: Variant }) {
  return (
    <div className="fd-words">
      <p className="fd-kicker">PortPass Bahamas</p>
      <h1 className="fd-title" id="fd-title">
        <span className="fd-phrase">Find it,</span> <span className="fd-phrase">book it,</span> <span className="fd-phrase">pay it.</span>{" "}
        <span className="fd-phrase fd-one">One app.</span>
      </h1>
      <p className="fd-lede">Classes, tours, tables, appointments and events from businesses across The Bahamas. Book in a few taps, pay the way you already do, and keep it all on your phone.</p>
      <form className="fd-search" action="/search" method="get" role="search">
        <label className="fd-search-label" htmlFor={`fd-q-${variant}`}>What are you looking for?</label>
        <div className="fd-search-row">
          <input id={`fd-q-${variant}`} name="q" type="search" placeholder="What are you looking for?" autoComplete="off" maxLength={80} />
          <button type="submit">Search</button>
        </div>
      </form>
      <div className="fd-actions">
        <Link className="home-button" href="/app">Get the app</Link>
        <Link className="fd-owner" href="/business">Run a business? Put it on PortPass →</Link>
      </div>
    </div>
  );
}

// The drawn phone (motion): what the app looks like in use, with the same
// examples Site Design drew. Decorative: the words beside it say it all.
function DrawnPhone() {
  return (
    <div className="fd-phone" aria-hidden="true">
      <div className="fd-screen">
        <p className="fd-hello">Good afternoon</p>
        <div className="fd-fakesearch">Search Nassau</div>
        <div className="fd-chips">
          {CHIPS.map((chip, i) => (
            <span className="fd-chip" style={{ animationDelay: `${2.2 + i * 1.4}s` }} key={chip}>{chip}</span>
          ))}
        </div>
        <div className="fd-card fd-card-1">
          <div><b>Saturday class</b><small>9:00</small></div>
          <span className="fd-stamp">Booked · paid</span>
        </div>
        <div className="fd-card fd-card-2">
          <div><b>Harbour tour</b><small>Fri · 2 people</small></div>
          <span className="fd-due">$90 to pay</span>
        </div>
        <div className="fd-pass">
          <b>Member Pass</b>
          <span>Show</span>
        </div>
      </div>
    </div>
  );
}

// Real photographs and a real screen (real). The screen is the demo
// business's payment request page; its banner says it is example data.
function RealPictures() {
  return (
    <div className="fd-real" aria-hidden="true">
      <div className="fd-photo fd-photo-a">
        <Image src="/futprep/lil-kickers/lil-kickers-training.jpg" alt="" fill priority sizes="(max-width: 900px) 60vw, 360px" quality={72} />
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

export function FrontDoor({ variant }: { variant: Variant }) {
  return (
    <section className={`fd fd-${variant}`} aria-labelledby="fd-title">
      <div className="fd-inner">
        <Words variant={variant} />
        {variant === "motion" ? <DrawnPhone /> : <RealPictures />}
      </div>
    </section>
  );
}
