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

const transparentFutprepLogo = "data:image/png;base64,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";

const futprepPhotos = {
  hero: "https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/d69eda54-1539-434e-bb0c-7e122dd03eab/IMG_5805.jpg",
  training: "https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/1610225610514-4OBCNDHLPNXEFD1ESC0B/IMG-1321.jpg",
  player: "https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/1610225759604-TDXFWZT2SGY2L9L0WHXO/IMG-4915.jpg",
};

export default function FutprepLilKickersPage() {
  const sessions = activeSessionDates();

  return (
    <main className="lilkickers-page futprep-theme">
      <section className="lk-hero">
        <img className="lk-hero-image" src={futprepPhotos.hero} alt="Young Futprep players together on the football field" />
        <div className="lk-hero-shade" aria-hidden="true" />

        <header className="lk-nav">
          <Link className="lk-portpass-brand" href="/" aria-label="Back to PortPass">
            <span className="brand-mark">P</span><span>PORTPASS</span>
          </Link>
          <div className="lk-program-brand">
            <img className="lk-header-crest" src={transparentFutprepLogo} alt="Futprep Athletics" />
            <span><b>LIL KICKERS</b><small>by Futprep Athletics</small></span>
          </div>
          <div className="lk-nav-actions">
            <Link className="lk-staff-login-link" href="/futprep/lil-kickers/staff/login">Staff login</Link>
            <Link className="lk-nav-register" href="/futprep/lil-kickers/register">Register →</Link>
          </div>
        </header>

        <div className="lk-hero-play" aria-hidden="true">
          <span>PLAY.</span><span>KICK.</span><span>SMILE.</span><span>GROW.</span>
        </div>

        <div className="lk-hero-content">
          <span className="lk-eyebrow">Futprep · {FUTPREP_TERM.name}</span>
          <h1>Little ballers.<br/><em>Big beginnings.</em></h1>
          <p>Saturday football built around play, laughter, first touches and the confidence to keep trying.</p>
          <div className="lk-hero-actions">
            <Link className="lk-button lk-button-pink" href="/futprep/lil-kickers/register">Register a child →</Link>
            <a className="lk-ghost-link" href="#classes">See the classes ↓</a>
          </div>
        </div>

        <aside className="lk-term-panel">
          <span className="lk-term-count">{sessions.length} Saturdays</span>
          <div>
            <small>Term dates</small>
            <strong>{readableDate(FUTPREP_TERM.startDate)} — {readableDate(FUTPREP_TERM.endDate)}</strong>
          </div>
          <div>
            <small>Breaks</small>
            <strong>Oct 10 & Oct 17</strong>
          </div>
          <a href={lyfordCayDirections} target="_blank" rel="noreferrer">
            <small>Where we play</small>
            <strong>Lyford Cay Lower Campus Soccer Field</strong>
            <span>Directions ↗</span>
          </a>
        </aside>
      </section>

      <section className="lk-kickoff">
        <div className="lk-kickoff-title">
          <span>Saturday energy</span>
          <h2>The cutest kickoff<br/><em>of the week.</em></h2>
          <p>Lil Kickers is where Saturdays start with smiles, tiny boots and big energy. We keep it fun, age-appropriate and packed with good vibes.</p>
          <a href="#classes" className="lk-kickoff-link">More about Lil Kickers →</a>
        </div>
        <div className="lk-kickoff-gallery" aria-label="Futprep Lil Kickers sessions">
          <figure><img src={futprepPhotos.training} alt="Young Futprep player enjoying a football session" loading="lazy" /></figure>
          <figure><img src={futprepPhotos.player} alt="Young Futprep player practicing with the ball" loading="lazy" /></figure>
          <figure><img src={futprepPhotos.hero} alt="Futprep players together on the field" loading="lazy" /></figure>
        </div>
      </section>

      <section className="lk-photo-story">
        <figure className="lk-photo-story-main">
          <img src={futprepPhotos.training} alt="Futprep coaching during a football session" loading="lazy" />
        </figure>
        <div className="lk-photo-story-copy">
          <span className="lk-section-label">What Saturdays feel like</span>
          <h2>Kick.<br/>Play.<br/><em>Laugh.</em></h2>
          <p>Ball control, balance, movement and confidence — taught through games that feel like play, because at this age that is exactly how learning should feel.</p>
          <div className="lk-feeling-list">
            <div><span>01</span><strong>Move</strong><small>Simple activities that keep little bodies active.</small></div>
            <div><span>02</span><strong>Try</strong><small>Small challenges that make trying feel safe and fun.</small></div>
            <div><span>03</span><strong>Smile</strong><small>Plenty of room to laugh, reset and go again.</small></div>
          </div>
        </div>
      </section>

      <section className="lk-classes" id="classes">
        <div className="lk-classes-heading">
          <span className="lk-section-label">Choose their Saturday</span>
          <h2>Pick the class <em>that fits your child.</em></h2>
          <p>Two classes, one fun morning. Each class is capped at {FUTPREP_PROGRAMS[0]?.capacity ?? 20} players so the session can still feel personal.</p>
        </div>

        <div className="lk-class-grid">
          {FUTPREP_PROGRAMS.map((program, index) => (
            <article className="lk-class-card" key={program.slug}>
              <div className="lk-class-number">0{index + 1}</div>
              <div className="lk-class-top">
                <span>Ages {program.ageMin}–{program.ageMax}</span>
                <h3>{program.name}</h3>
                <p>{program.day}s · <strong>{program.time}</strong></p>
              </div>
              <div className="lk-class-price">
                <div><small>Weekly</small><strong>{formatMoney(program.weeklyFeeCents)}</strong><span>per class</span></div>
                <div><small>Full term</small><strong>{formatMoney(program.termFeeCents)}</strong><span>one payment</span></div>
              </div>
              <div className="lk-class-bottom">
                <span>{program.capacity} spots</span>
                <Link href="/futprep/lil-kickers/register">Choose this class →</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lk-coaching">
        <div className="lk-coaching-copy">
          <span className="lk-section-label">Meet Coach Becks</span>
          <h2>Coach Becks.<br/>The coach behind the smiles.</h2>
          <p>Coach Becks builds more than skills — he builds confidence. Every child is seen, encouraged and celebrated. Connection first. Football follows.</p>
          <Link className="lk-coach-link" href="/futprep/coaches">Meet the team + private lessons →</Link>
        </div>
        <figure className="lk-coaching-image">
          <img src={futprepPhotos.player} alt="Futprep coaching and young players during a football session" loading="lazy" />
          <figcaption className="lk-coaching-caption">
            <span>Coach + kids</span>
            <strong>Connection first. Football follows.</strong>
          </figcaption>
        </figure>
      </section>

      <section className="lk-journey">
        <div className="lk-journey-mark">
          <img src="/futprep-logo.png" alt="" />
        </div>
        <div className="lk-journey-copy">
          <span className="lk-section-label">More than one term</span>
          <h2>Lil Kickers <em>is just the beginning.</em></h2>
          <p>As confidence grows, young players can keep developing inside the wider Futprep environment and move into the next challenge when the time is right.</p>
        </div>
        <div className="lk-journey-steps">
          <div><span>01</span><strong>First touches</strong><small>Meet the ball. Learn the space. Have fun.</small></div>
          <i />
          <div><span>02</span><strong>Confidence</strong><small>Move, listen, try again and start owning the game.</small></div>
          <i />
          <div><span>03</span><strong>What comes next</strong><small>Grow into the next Futprep experience when the time is right.</small></div>
        </div>
      </section>

      <section className="lk-clarity">
        <div className="lk-clarity-heading">
          <span className="lk-section-label">The practical stuff</span>
          <h2>Easy for parents.</h2>
        </div>
        <div className="lk-clarity-card">
          <div>
            <small>Payment</small>
            <strong>Cash or bank transfer</strong>
            <p>Choose your payment method during registration. Online card payments are coming soon.</p>
          </div>
          <div>
            <small>Registration</small>
            <strong>Free to register</strong>
            <p>Complete the form once, choose a class and receive your registration confirmation.</p>
          </div>
          <div>
            <small>Location</small>
            <strong>Lyford Cay Lower Campus</strong>
            <a href={lyfordCayDirections} target="_blank" rel="noreferrer">Open directions ↗</a>
          </div>
        </div>
      </section>

      <section className="lk-partners">
        <div>
          <span className="lk-section-label">Futprep partners</span>
          <h2>Backed by community.</h2>
        </div>
        <div className="lk-partner-grid">
          <article><img src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/8805b0c9-5021-4328-9c5d-934e36e38298/BBD%2BLOGO_3%2B%281%29.png" alt="Bahamas Builders & Development" loading="lazy" /><span>Bahamas Builders & Development</span></article>
          <article><img src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/4e9519a5-1dd1-4f3c-b2ef-8fa259b36e31/WhatsApp%2BImage%2B2021-01-31%2Bat%2B9.37.56%2BPM.jpeg" alt="Shenanigans Bahamas" loading="lazy" /><span>Shenanigans Bahamas</span></article>
          <article><img src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/415adee4-afb4-42f9-9383-d5c9aecce953/HAPPY_PETS_FINAL_LOGO.png" alt="Happy Pets Animal Hospital" loading="lazy" /><span>Happy Pets Animal Hospital</span></article>
        </div>
      </section>

      <section className="lk-final">
        <span>See you on the field.</span>
        <h2>Ready to join<br/>the fun?</h2>
        <p>Pick a class, register your child and get their Saturday football journey started.</p>
        <Link className="lk-button lk-button-white" href="/futprep/lil-kickers/register">Start registration →</Link>
      </section>

      <footer className="lk-footer">
        <Link className="lk-portpass-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <p>Registration powered by PortPass.</p>
        <div className="lk-footer-futprep"><img src="/futprep-logo.png" alt="" /><span>Futprep Athletics</span></div>
      </footer>
    </main>
  );
}
