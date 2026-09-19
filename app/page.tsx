import Link from "next/link";
import { ppDisplay, ppSans } from "./fonts";
import { getFutprepAvailability } from "@/db/registrations";
import { programTimeRange, formatMoney } from "./futprep/config";

export const metadata = {
  title: "PortPass | Find and book it in The Bahamas",
  description: "PortPass is where you find and book things in The Bahamas — sports programs, weddings, and more.",
};

// force-dynamic: the hero and Futprep panel read live program data.
export const dynamic = "force-dynamic";

const COMING_LANES = [
  { slug: "venues", title: "Venues", tag: "Coming soon", copy: "Beaches, halls, studios and private estates." },
  { slug: "events", title: "Events", tag: "Coming soon", copy: "Ticketed nights, with entry and door scanning." },
  { slug: "entertainment", title: "Entertainment", tag: "Coming soon", copy: "Tours, attractions and nightlife." },
] as const;

const HOW_IT_WORKS = [
  { step: "01", title: "Find it.", copy: "Browse what's actually happening — a class, a ceremony, a night out." },
  { step: "02", title: "Book or enquire.", copy: "Reserve a spot where that's open, or start a conversation where it isn't yet." },
  { step: "03", title: "Turn up.", copy: "Show your pass, and you're in." },
] as const;

export default async function Home() {
  const availability = await getFutprepAvailability();
  const lilKickers = availability.find((p) => p.slug === "lil-kickers") ?? availability[0];
  const kickers = availability.find((p) => p.slug === "kickers");

  const heroPasses = [
    lilKickers && { eyebrow: "Futprep Athletics", title: lilKickers.name, line: `${lilKickers.day}s ${programTimeRange(lilKickers)} · Lyford Cay`, tone: "green" as const },
    { eyebrow: "Bahamas Weddings By The Sea", title: "Island ceremony", line: "Nassau, The Bahamas · With Antonio Beckford", tone: "sand" as const },
    kickers && { eyebrow: "Futprep Athletics", title: kickers.name, line: `${kickers.day}s ${programTimeRange(kickers)} · Lyford Cay`, tone: "ocean" as const },
  ].filter((pass): pass is { eyebrow: string; title: string; line: string; tone: "green" | "sand" | "ocean" } => Boolean(pass));

  return (
    <main className={`home-theme ${ppDisplay.variable} ${ppSans.variable}`}>
      <a className="home-skip-link" href="#chooser">Skip to browse</a>
      <header className="home-header">
        <Link className="home-brand" href="/" aria-label="PortPass home"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <nav aria-label="Primary">
          <a href="#chooser">Browse</a>
          <a href="#live">Live now</a>
          <Link href="/apply">For business</Link>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">The Bahamas, one pass at a time</p>
          <h1>Your way in,<br /><em>wherever you're headed.</em></h1>
          <p className="home-hero-lead">A Saturday session. A ceremony by the sea. A night out. PortPass is how you find it and how you get in.</p>
          <a className="home-button" href="#chooser">Find your pass ↓</a>
        </div>
        <div className="home-pass-stack" aria-hidden="true">
          {heroPasses.map((pass, index) => (
            <article className={`home-pass home-pass-${pass.tone}`} key={pass.title} style={{ animationDelay: `${index * 0.15}s` }}>
              <span className="home-pass-eyebrow">{pass.eyebrow}</span>
              <strong>{pass.title}</strong>
              <span className="home-pass-line">{pass.line}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="home-chooser" id="chooser">
        <div className="home-section-heading">
          <span className="home-eyebrow">Where to start</span>
          <h2>Pick your lane.</h2>
        </div>
        <div className="home-lane-grid">
          <Link className="home-lane home-lane-live" href="/sports-fitness">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Sports &amp; Fitness</h3>
            <p>Real Saturday sessions, real prices, open now with Futprep Athletics.</p>
            <span className="home-lane-action">Explore →</span>
          </Link>
          <Link className="home-lane home-lane-live" href="/weddings">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Weddings</h3>
            <p>Plan an island ceremony with Bahamas Weddings By The Sea.</p>
            <span className="home-lane-action">Explore →</span>
          </Link>
          {COMING_LANES.map((lane) => (
            <Link className="home-lane home-lane-coming" href={`/${lane.slug}`} key={lane.slug}>
              <span className="home-lane-tag">{lane.tag}</span>
              <h3>{lane.title}</h3>
              <p>{lane.copy}</p>
              <span className="home-lane-action">Tell us what you need →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-live" id="live">
        <div className="home-section-heading">
          <span className="home-eyebrow">Live on PortPass</span>
          <h2>Not a mockup. Running right now.</h2>
        </div>
        <div className="home-live-grid">
          <article className="home-live-panel">
            <span className="home-live-panel-kicker">Sports &amp; Fitness</span>
            <h3>Futprep Athletics.</h3>
            <p>Saturday football for young players — real classes, real prices, straight from the database.</p>
            <ul className="home-live-list">
              {availability.map((program) => (
                <li key={program.slug}>
                  <strong>{program.name}</strong>
                  <span>Ages {program.ageMin}–{program.ageMax} · {program.day}s {programTimeRange(program)}</span>
                  <span>{formatMoney(program.weeklyFeeCents)}/week · {program.spotsRemaining} of {program.capacity} spots left</span>
                </li>
              ))}
            </ul>
            <Link className="home-live-cta" href="/futprep">Register a child →</Link>
          </article>
          <article className="home-live-panel">
            <span className="home-live-panel-kicker">Weddings</span>
            <h3>Bahamas Weddings By The Sea.</h3>
            <p>Weddings, intimate ceremonies and vow renewals with officiant Antonio Beckford — plus a guided planner and a real Wedding Desk behind it.</p>
            <ul className="home-live-list">
              <li><strong>Your wedding</strong><span>A personalized legal ceremony</span></li>
              <li><strong>Just the two of you</strong><span>An intimate island ceremony</span></li>
              <li><strong>Vow renewal</strong><span>Celebrate your story again</span></li>
            </ul>
            <Link className="home-live-cta" href="/weddings">Start planning →</Link>
          </article>
        </div>
        <p className="home-live-note">A children&rsquo;s football academy and a wedding service, running on the same system — that&rsquo;s PortPass.</p>
      </section>

      <section className="home-how">
        <div className="home-section-heading">
          <span className="home-eyebrow">How it works</span>
          <h2>Three steps. That&rsquo;s it.</h2>
        </div>
        <div className="home-how-grid">
          {HOW_IT_WORKS.map((item) => (
            <div className="home-how-step" key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-business">
        <div>
          <span className="home-eyebrow">Run a club or a business?</span>
          <h2>List with PortPass.</h2>
          <p>Bring your organization onto the same system powering Futprep and Bahamas Weddings By The Sea.</p>
        </div>
        <Link className="home-button home-button-light" href="/apply">Learn more →</Link>
      </section>

      <footer className="home-footer">
        <div className="home-footer-brand">
          <Link className="home-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <p>Made in The Bahamas.</p>
        </div>
        <div className="home-footer-links">
          <a href="tel:+12424241262">+1 (242) 424-1262</a>
          <Link href="/apply">Apply for early access →</Link>
        </div>
      </footer>
    </main>
  );
}
