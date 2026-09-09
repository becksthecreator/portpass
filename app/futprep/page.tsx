import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Futprep Athletics | PortPass",
  description: "Explore Futprep programs, coaches, private sessions, and the Futprep staff portal powered by PortPass.",
};

const heroPhoto = "https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/d69eda54-1539-434e-bb0c-7e122dd03eab/IMG_5805.jpg";
const trainingPhoto = "https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/1610225610514-4OBCNDHLPNXEFD1ESC0B/IMG-1321.jpg";
const playerPhoto = "https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/1610225759604-TDXFWZT2SGY2L9L0WHXO/IMG-4915.jpg";

export default function FutprepHomePage() {
  return (
    <main className="futprep-home">
      <header className="fp-home-nav">
        <Link className="fp-home-portpass" href="/" aria-label="Back to PortPass">
          <span className="brand-mark">P</span>
          <span>PORTPASS</span>
        </Link>

        <Link className="fp-home-brand" href="/futprep" aria-label="Futprep home">
          <img src="/futprep-logo.png" alt="Futprep Athletics" />
          <span>FUTPREP ATHLETICS</span>
        </Link>

        <nav>
          <Link href="/futprep/programs">Programs</Link>
          <Link href="/futprep/coaches">Coaches</Link>
          <Link className="fp-home-login" href="/futprep/lil-kickers/staff/login">Staff login</Link>
        </nav>
      </header>

      <section className="fp-home-hero">
        <Image src={heroPhoto} alt="Futprep players on the football field" fill priority sizes="100vw" />
        <div className="fp-home-hero-shade" aria-hidden="true" />
        <div className="fp-home-hero-copy">
          <span>Futprep Athletics · Nassau, Bahamas</span>
          <h1>Football starts here.<br/><em>Growth goes further.</em></h1>
          <p>Programs, coaches, private training and player development — all connected through one Futprep experience.</p>
          <div>
            <Link className="fp-home-primary" href="/futprep/programs">Explore programs →</Link>
            <Link className="fp-home-secondary" href="/futprep/coaches">Meet the team</Link>
          </div>
        </div>
        <div className="fp-home-hero-note">
          <span>Built around the player.</span>
          <strong>Play. Learn. Develop. Progress.</strong>
        </div>
      </section>

      <section className="fp-home-intro">
        <span>Inside Futprep</span>
        <h2>One home for the <em>whole journey.</em></h2>
        <p>This is now the main Futprep landing page. Programs live underneath Futprep, parents can meet and book coaches, and staff can enter the operational side of the platform without hunting for a hidden link.</p>
      </section>

      <section className="fp-home-feature-grid">
        <Link className="fp-home-feature fp-home-feature-program" href="/futprep/lil-kickers">
          <Image src={trainingPhoto} alt="Young Futprep player in a training session" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <div className="fp-home-feature-shade" aria-hidden="true" />
          <div className="fp-home-feature-copy">
            <small>Current program · Messy Tots × Futprep</small>
            <h2>Lil Kickers.</h2>
            <p>Saturday football for little ballers. Registration, class information, term dates and parent details all stay together.</p>
            <strong>Open Messy Tots / Lil Kickers →</strong>
          </div>
        </Link>

        <Link className="fp-home-feature fp-home-feature-team" href="/futprep/coaches">
          <Image src={playerPhoto} alt="Futprep coaching on the football field" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <div className="fp-home-feature-shade" aria-hidden="true" />
          <div className="fp-home-feature-copy">
            <small>Coaches + private training</small>
            <h2>Meet the team.</h2>
            <p>Coach profiles, experience, availability, testimonials and private-session requests — built to make the team visible and bookable.</p>
            <strong>Explore coaches →</strong>
          </div>
        </Link>
      </section>

      <section className="fp-home-private">
        <div className="fp-home-private-copy">
          <span>Private coaching</span>
          <h2>Need something more personal?</h2>
          <p>Parents can request one-on-one training or birthday football experiences without leaving the Futprep environment. Coaches can accept, decline with a reason, or refer the request to another coach.</p>
          <Link href="/futprep/coaches">Find a coach →</Link>
        </div>
        <div className="fp-home-private-steps">
          <div><span>01</span><strong>Choose a coach</strong><small>See the people behind Futprep.</small></div>
          <div><span>02</span><strong>Request a time</strong><small>Send the session details in one flow.</small></div>
          <div><span>03</span><strong>Get confirmed</strong><small>The coach accepts, refers or responds.</small></div>
        </div>
      </section>

      <section className="fp-home-staff">
        <div>
          <span>Futprep staff</span>
          <h2>The operational side now has a front door.</h2>
          <p>Coaches and staff can sign in to manage registrations, coaching operations, the team directory and private-session requests.</p>
        </div>
        <div className="fp-home-staff-actions">
          <Link className="fp-home-staff-primary" href="/futprep/lil-kickers/staff/login">Open staff portal →</Link>
          <p>Staff access opens the operational side of Futprep while the public homepage stays focused on families, players and programs.</p>
        </div>
      </section>

      <section className="fp-home-brand-story">
        <span>Where Futprep is going</span>
        <h2>More than registration.<br/><em>A visible development journey.</em></h2>
        <p>As the Futprep brand evolves, this homepage becomes the front door for the academy: programs, coaches, player development, private lessons, events, stories and everything families need to understand what Futprep stands for.</p>
      </section>

      <footer className="fp-home-footer">
        <Link className="fp-home-brand" href="/futprep">
          <img src="/futprep-logo.png" alt="" />
          <span>FUTPREP ATHLETICS</span>
        </Link>
        <p>Powered by PortPass.</p>
        <Link href="/">PortPass Bahamas →</Link>
      </footer>
    </main>
  );
}
