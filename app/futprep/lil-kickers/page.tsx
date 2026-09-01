import Link from "next/link";
import {
  FUTPREP_PROGRAMS,
  FUTPREP_TERM,
  activeSessionDates,
  formatMoney,
} from "./config";

export const metadata = {
  title: "Futprep Lil Kickers | PortPass",
  description: "Register for Futprep Lil Kickers and Rookies Term 1 through PortPass.",
};

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en-BS", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

const lyfordCayDirections =
  "https://www.google.com/maps/search/?api=1&query=Lyford+Cay+Lower+Campus+Soccer+Field+Nassau+Bahamas";

export default function FutprepLilKickersPage() {
  const sessions = activeSessionDates();

  return (
    <main className="pilot-page futprep-theme">
      <header className="site-header pilot-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="futprep-program-brand"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>LIL KICKERS</b><small>by Futprep Athletics</small></span></div>
      </header>

      <section className="pilot-hero">
        <div className="pilot-hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" />Futprep · {FUTPREP_TERM.name}</div>
          <h1 className="dramatic-headline" aria-label="Saturday football... starts here.">
            <span className="headline-first">Saturday football<span className="headline-ellipsis">...</span></span>
            <span className="headline-second">starts here.</span>
          </h1>
          <p>A fun, age-appropriate introduction to football for young players. Choose the class that fits your child and register in a few minutes.</p>
          <Link className="primary-button" href="/futprep/lil-kickers/register">Register a child →</Link>
        </div>

        <aside className="pilot-term-card">
          <div className="session-float">{sessions.length} Fun Sessions!</div>
          <div className="term-date-line">
            {readableDate(FUTPREP_TERM.startDate)} — {readableDate(FUTPREP_TERM.endDate)}
          </div>
          <div className="term-break-line">
            <span>Breaks</span>
            <strong>Oct 10 & Oct 17</strong>
          </div>
          <a
            className="term-location-link"
            href={lyfordCayDirections}
            target="_blank"
            rel="noreferrer"
          >
            <span>Location</span>
            <strong>Lyford Cay Lower Campus Soccer Field</strong>
            <small>Get directions ↗</small>
          </a>
        </aside>
      </section>

      <section className="pilot-classes">
        <div className="section-kicker">Choose a class</div>
        <h2>Two classes. Twenty spots each.</h2>
        <div className="pilot-class-grid">
          {FUTPREP_PROGRAMS.map((program) => (
            <article className="pilot-class-card" key={program.slug}>
              <div>
                <span className="class-age">Ages {program.ageMin}–{program.ageMax}</span>
                <h3>{program.name}</h3>
                <p>{program.day}s · <strong>{program.time}</strong></p>
              </div>
              <div className="class-pricing">
                <div><span>Weekly</span><strong>{formatMoney(program.weeklyFeeCents)}</strong><small>per class</small></div>
                <div><span>Full term</span><strong>{formatMoney(program.termFeeCents)}</strong><small>one payment</small></div>
              </div>
              <p className="class-capacity">{program.capacity} spots</p>
            </article>
          ))}
        </div>
      </section>


      <section className="futprep-story">
        <div className="futprep-story-copy">
          <span className="section-kicker">Futprep in motion</span>
          <h2>Real sessions.<br/><em>Real confidence.</em></h2>
          <p>Football should feel exciting from the first touch. Lil Kickers is built around movement, confidence, repetition, and fun — with coaching that meets young players where they are.</p>
          <div className="futprep-story-tags">
            <span>Fun first</span>
            <span>Age appropriate</span>
            <span>Skill building</span>
          </div>
        </div>
        <div className="futprep-gallery" aria-label="Futprep Athletics gallery">
          <figure className="gallery-main">
            <img
              src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/d69eda54-1539-434e-bb0c-7e122dd03eab/IMG_5805.jpg"
              alt="Futprep Athletics players together on the field in Nassau"
              loading="lazy"
            />
          </figure>
          <figure className="gallery-side gallery-side-one">
            <img
              src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/1610225610514-4OBCNDHLPNXEFD1ESC0B/IMG-1321.jpg"
              alt="Futprep Athletics football training in Nassau"
              loading="lazy"
            />
          </figure>
          <figure className="gallery-side gallery-side-two">
            <img
              src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/1610225759604-TDXFWZT2SGY2L9L0WHXO/IMG-4915.jpg"
              alt="Young Futprep players during a football session"
              loading="lazy"
            />
          </figure>
        </div>
      </section>

      <section className="pilot-payment-strip">
        <div><span className="section-kicker">Payment</span><h2>Simple for now.</h2></div>
        <p>Choose cash or bank transfer when you register. Online card payments are coming soon.</p>
      </section>


      <section className="futprep-sponsors">
        <div className="sponsor-heading">
          <span className="section-kicker">Futprep partners</span>
          <p>Supported by organizations that help Futprep keep young players learning, competing, and growing.</p>
        </div>
        <div className="sponsor-grid">
          <div className="sponsor-card">
            <img
              src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/8805b0c9-5021-4328-9c5d-934e36e38298/BBD%2BLOGO_3%2B%281%29.png"
              alt="Bahamas Builders & Development"
              loading="lazy"
            />
            <span>Bahamas Builders & Development</span>
          </div>
          <div className="sponsor-card">
            <img
              src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/4e9519a5-1dd1-4f3c-b2ef-8fa259b36e31/WhatsApp%2BImage%2B2021-01-31%2Bat%2B9.37.56%2BPM.jpeg"
              alt="Shenanigans Bahamas"
              loading="lazy"
            />
            <span>Shenanigans Bahamas</span>
          </div>
          <div className="sponsor-card">
            <img
              src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/415adee4-afb4-42f9-9383-d5c9aecce953/HAPPY_PETS_FINAL_LOGO.png"
              alt="Happy Pets Animal Hospital"
              loading="lazy"
            />
            <span>Happy Pets Animal Hospital</span>
          </div>
        </div>
      </section>

      <section className="closing-cta pilot-cta">
        <p>Registration is free.</p>
        <h2>Ready for Saturday?</h2>
        <Link className="light-button" href="/futprep/lil-kickers/register">Start registration →</Link>
      </section>

      <footer>
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <p>Registration powered by PortPass.</p>
        <div className="futprep-footer-brand"><img src="/futprep-logo.png" alt="" /><span>Futprep Athletics</span></div>
      </footer>
    </main>
  );
}
