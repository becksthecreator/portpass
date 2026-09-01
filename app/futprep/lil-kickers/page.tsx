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

export default function FutprepLilKickersPage() {
  const sessions = activeSessionDates();

  return (
    <main className="pilot-page">
      <header className="site-header pilot-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <span className="pilot-partner">FUTPREP</span>
      </header>

      <section className="pilot-hero">
        <div className="pilot-hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" />Futprep · {FUTPREP_TERM.name}</div>
          <h1>Saturday football<br/><em>starts here.</em></h1>
          <p>A fun, age-appropriate introduction to football for young players. Choose the class that fits your child and register in a few minutes.</p>
          <Link className="primary-button" href="/futprep/lil-kickers/register">Register a child →</Link>
        </div>

        <aside className="pilot-term-card">
          <span>Term 1 · 2026</span>
          <strong>{sessions.length} training Saturdays</strong>
          <dl>
            <div><dt>Dates</dt><dd>{readableDate(FUTPREP_TERM.startDate)} — {readableDate(FUTPREP_TERM.endDate)}</dd></div>
            <div><dt>Location</dt><dd>{FUTPREP_TERM.location}</dd></div>
            <div><dt>Break</dt><dd>Oct 10 & Oct 17</dd></div>
          </dl>
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

      <section className="pilot-payment-strip">
        <div><span className="section-kicker">Payment</span><h2>Simple for now.</h2></div>
        <p>Choose cash or bank transfer when you register. Online card payments are coming soon.</p>
      </section>

      <section className="closing-cta pilot-cta">
        <p>Registration is free.</p>
        <h2>Ready for Saturday?</h2>
        <Link className="light-button" href="/futprep/lil-kickers/register">Start registration →</Link>
      </section>

      <footer>
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <p>Registration powered by PortPass.</p>
        <span className="footer-partner">FUTPREP</span>
      </footer>
    </main>
  );
}
