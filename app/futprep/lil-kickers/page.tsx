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

const futprepPhotos = {
  hero: "/futprep/lil-kickers/lil-kickers-group.webp",
  training: "/futprep/lil-kickers/lil-kickers-training.webp",
  player: "/futprep/lil-kickers/lil-kickers-player.webp",
  coach: "/futprep/lil-kickers/lil-kickers-coach.webp",
};

export default function FutprepLilKickersPage() {
  const sessions = activeSessionDates();

  return (
    <main className="lilkickers-page futprep-theme">
      <header className="fp-home-nav fp-lk-nav">
        <Link className="fp-home-portpass" href="/" aria-label="Back to PortPass">
          <span className="brand-mark">P</span>
          <span>PORTPASS</span>
        </Link>

        <Link className="fp-home-brand" href="/futprep" aria-label="Futprep home">
          <img src="/futprep-logo.png" alt="Futprep Athletics" />
          <span>FUTPREP ATHLETICS</span>
        </Link>

        <nav>
          <Link href="/futprep/messy-tots">Programs</Link>
          <Link href="/futprep/coaches">Coaches</Link>
          <Link className="fp-home-login" href="/futprep/lil-kickers/staff/login">Staff login</Link>
        </nav>
      </header>

      <section className="lk-hero">
        <img className="lk-hero-image" src={futprepPhotos.hero} alt="Futprep Lil Kickers players and coaches together on the football field" />
        <div className="lk-hero-shade" aria-hidden="true" />

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
          <figure><img src={futprepPhotos.player} alt="Young Futprep player practicing during Lil Kickers" loading="lazy" /></figure>
          <figure><img src={futprepPhotos.hero} alt="Futprep Lil Kickers group on the field" loading="lazy" /></figure>
        </div>
      </section>

      <section className="lk-photo-story">
        <figure className="lk-photo-story-main">
          <img src={futprepPhotos.training} alt="Young Futprep players training during a Lil Kickers session" loading="lazy" />
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
          <img src={futprepPhotos.coach} alt="Futprep coach working with young players during a Lil Kickers session" loading="lazy" />
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
