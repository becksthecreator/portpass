import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FUTPREP_TERM,
  activeSessionDates,
  formatMoney,
  programTimeRange,
} from "../config";
import { getFutprepAvailability } from "@/db/registrations";

// force-dynamic (not ISR/revalidate) because this repo's CI build has no
// Supabase credentials available at build time, and a numeric revalidate
// makes Next try to prerender this page's DB-backed data during `next build`.
export const dynamic = "force-dynamic";

// One route for every program (driven by programs.slug) instead of a
// hand-built page per program — see the go-live brief, section 1b.
// Photos are shared across programs for now (same field, same coaches,
// just a different Saturday time slot); swap to per-program photography
// if/when it exists.
const futprepPhotos = {
  hero: "/futprep/lil-kickers/lil-kickers-group.jpg",
  training: "/futprep/lil-kickers/lil-kickers-training.jpg",
  player: "/futprep/lil-kickers/lil-kickers-player.jpg",
  coach: "/futprep/lil-kickers/lil-kickers-coach.jpg",
};

const lyfordCayDirections =
  "https://www.google.com/maps/search/?api=1&query=Lyford+Cay+Lower+Campus+Soccer+Field+Nassau+Bahamas";

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en-BS", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export async function generateMetadata({ params }: { params: Promise<{ program: string }> }) {
  const { program: slug } = await params;
  const availability = await getFutprepAvailability();
  const program = availability.find((p) => p.slug === slug);
  if (!program) return { title: "Futprep Athletics | PortPass" };
  return {
    title: `${program.name} | PortPass`,
    description: `Register for ${program.name} Term 1 through PortPass.`,
  };
}

export default async function FutprepProgramPage({ params }: { params: Promise<{ program: string }> }) {
  const { program: slug } = await params;
  const availability = await getFutprepAvailability();
  const program = availability.find((p) => p.slug === slug);
  if (!program) notFound();

  const otherPrograms = availability.filter((p) => p.slug !== slug);
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
          <Link href="/futprep/programs">Programs</Link>
          <Link href="/futprep/coaches">Coaches</Link>
          <Link className="fp-home-login" href="/futprep/staff/login">Staff login</Link>
        </nav>
      </header>

      <section className="lk-hero">
        <Image className="lk-hero-image" src={futprepPhotos.hero} alt="Futprep players and coaches together on the football field" fill priority sizes="100vw" />
        <div className="lk-hero-shade" aria-hidden="true" />

        <div className="lk-hero-play" aria-hidden="true">
          <span>PLAY.</span><span>KICK.</span><span>SMILE.</span><span>GROW.</span>
        </div>

        <div className="lk-hero-content">
          <span className="lk-eyebrow">Futprep · {FUTPREP_TERM.name}</span>
          <h1>{program.name}.<br /><em>Ages {program.ageMin}–{program.ageMax}.</em></h1>
          <p>{program.day}s at {programTimeRange(program)} — built around play, first touches and the confidence to keep trying.</p>
          <div className="lk-hero-actions">
            <Link className="lk-button lk-button-pink" href={`/futprep/register?program=${program.slug}`}>Register a child →</Link>
            <a className="lk-ghost-link" href="#classes">See the details ↓</a>
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
            <strong>{program.location}</strong>
            <span>Directions ↗</span>
          </a>
        </aside>
      </section>

      <section className="lk-kickoff">
        <div className="lk-kickoff-title">
          <span>Saturday energy</span>
          <h2>The cutest kickoff<br /><em>of the week.</em></h2>
          <p>{program.name} is where Saturdays start with smiles and big energy. We keep it fun, age-appropriate and packed with good vibes.</p>
          <a href="#classes" className="lk-kickoff-link">More about {program.name} →</a>
        </div>
        <div className="lk-kickoff-gallery" aria-label={`${program.name} sessions`}>
          <figure><Image src={futprepPhotos.training} alt="Young Futprep player enjoying a football session" fill sizes="(max-width: 720px) 50vw, 25vw" /></figure>
          <figure><Image src={futprepPhotos.player} alt="Young Futprep player practicing" fill sizes="(max-width: 720px) 50vw, 25vw" /></figure>
          <figure><Image src={futprepPhotos.hero} alt="Futprep group on the field" fill sizes="(max-width: 720px) 100vw, 25vw" /></figure>
        </div>
      </section>

      <section className="lk-photo-story">
        <figure className="lk-photo-story-main">
          <Image src={futprepPhotos.training} alt="Young Futprep players training" fill sizes="(max-width: 1000px) 100vw, 55vw" />
        </figure>
        <div className="lk-photo-story-copy">
          <span className="lk-section-label">What Saturdays feel like</span>
          <h2>Kick.<br />Play.<br /><em>Laugh.</em></h2>
          <p>Ball control, balance, movement and confidence — taught through games that feel like play, because at this age that is exactly how learning should feel.</p>
          <div className="lk-feeling-list">
            <div><span>01</span><strong>Move</strong><small>Simple activities that keep bodies active.</small></div>
            <div><span>02</span><strong>Try</strong><small>Small challenges that make trying feel safe and fun.</small></div>
            <div><span>03</span><strong>Smile</strong><small>Plenty of room to laugh, reset and go again.</small></div>
          </div>
        </div>
      </section>

      <section className="lk-classes" id="classes">
        <div className="lk-classes-heading">
          <span className="lk-section-label">The details</span>
          <h2>{program.name}<em>, ages {program.ageMin}–{program.ageMax}.</em></h2>
          <p>One Saturday morning class, capped at {program.capacity} players so the session can still feel personal.</p>
        </div>

        <div className="lk-class-grid">
          <article className="lk-class-card">
            <div className="lk-class-number">01</div>
            <div className="lk-class-top">
              <span>Ages {program.ageMin}–{program.ageMax}</span>
              <h3>{program.name}</h3>
              <p>{program.day}s · <strong>{programTimeRange(program)}</strong></p>
            </div>
            <div className="lk-class-price">
              <div><small>Weekly</small><strong>{formatMoney(program.weeklyFeeCents)}</strong><span>per class</span></div>
              <div><small>Full term</small><strong>{formatMoney(program.termFeeCents)}</strong><span>one payment</span></div>
            </div>
            <div className="lk-class-bottom">
              <span>{program.spotsRemaining} of {program.capacity} spots</span>
              <Link href={`/futprep/register?program=${program.slug}`}>Choose this class →</Link>
            </div>
          </article>
        </div>

        {otherPrograms.length > 0 && (
          <p className="form-hint">
            Looking for a different age group?{" "}
            {otherPrograms.map((other, i) => (
              <span key={other.slug}>
                {i > 0 && " · "}
                <Link href={`/futprep/${other.slug}`}>{other.name} →</Link>
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="lk-coaching">
        <div className="lk-coaching-copy">
          <span className="lk-section-label">Meet Coach Becks</span>
          <h2>Coach Becks.<br />The coach behind the smiles.</h2>
          <p>Coach Becks builds more than skills — he builds confidence. Every child is seen, encouraged and celebrated. Connection first. Football follows.</p>
          <Link className="lk-coach-link" href="/futprep/coaches">Meet the team + private lessons →</Link>
        </div>
        <figure className="lk-coaching-image">
          <Image src={futprepPhotos.coach} alt="Futprep coach working with young players" fill sizes="(max-width: 1000px) 100vw, 45vw" />
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
          <h2>{program.name} <em>is just the beginning.</em></h2>
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
            <strong>Cash, bank transfer or online banking</strong>
            <p>Choose your payment method during registration. Online card payments are coming soon.</p>
          </div>
          <div>
            <small>Registration</small>
            <strong>Free to register</strong>
            <p>Complete the form once, choose a class and receive your registration confirmation. Already registered? <Link href="/futprep/my">Check your status →</Link></p>
          </div>
          <div>
            <small>Location</small>
            <strong>{program.location}</strong>
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
        <h2>Ready to join<br />the fun?</h2>
        <p>Pick a class, register your child and get their Saturday football journey started.</p>
        <Link className="lk-button lk-button-white" href={`/futprep/register?program=${program.slug}`}>Start registration →</Link>
      </section>

      <footer className="lk-footer">
        <Link className="lk-portpass-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <p>Registration powered by PortPass.</p>
        <div className="lk-footer-futprep"><img src="/futprep-logo.png" alt="" /><span>Futprep Athletics</span></div>
      </footer>
    </main>
  );
}
