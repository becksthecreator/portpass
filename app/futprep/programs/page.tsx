import Link from "next/link";
import { getFutprepAvailability } from "@/db/registrations";
import { formatMoney, programTimeRange } from "../lil-kickers/config";

// Spot-availability doesn't need to be millisecond-fresh, so this page is
// cached and re-rendered at most every 30s instead of forcing a fresh
// render (and DB round trip) on every single visitor.
export const revalidate = 30;

export const metadata = {
  title: "Programs | Futprep Athletics",
  description: "See every active Futprep program and register your child.",
};

export default async function FutprepProgramsPage() {
  const availability = await getFutprepAvailability();

  const byLocation = new Map<string, typeof availability>();
  for (const program of availability) {
    const list = byLocation.get(program.location) ?? [];
    list.push(program);
    byLocation.set(program.location, list);
  }

  return (
    <main className="lilkickers-page futprep-programs-page futprep-theme">
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
          <Link className="fp-home-login" href="/futprep/lil-kickers/staff/login">Staff login</Link>
        </nav>
      </header>

      <section className="fpp-hero">
        <span className="lk-eyebrow">Futprep · All programs</span>
        <h1>Find their <em>Saturday.</em></h1>
        <p>Every active Futprep class, wherever it runs. Pick one and registration takes about two minutes.</p>
      </section>

      <section className="fpp-body">
        {availability.length === 0 && (
          <div className="fpp-empty">
            <h2>No open classes right now.</h2>
            <p>Check back soon, or contact Futprep directly for the next term's dates.</p>
          </div>
        )}

        {Array.from(byLocation.entries()).map(([location, programs]) => (
          <div className="fpp-location-group" key={location}>
            <div className="fpp-location-heading">
              <span className="lk-section-label">Location</span>
              <h2>{location}</h2>
            </div>
            <div className="fpp-program-grid">
              {programs.map((program) => (
                <article className="fpp-card" key={program.slug}>
                  <div className="fpp-card-top">
                    <span>Ages {program.ageMin}–{program.ageMax}</span>
                    <h3>{program.name}</h3>
                    <p>{program.day}s · <strong>{programTimeRange(program)}</strong></p>
                  </div>
                  <div className="fpp-card-price">
                    <div><small>Weekly</small><strong>{formatMoney(program.weeklyFeeCents)}</strong></div>
                    <div><small>Full term</small><strong>{formatMoney(program.termFeeCents)}</strong></div>
                  </div>
                  <div className="fpp-card-bottom">
                    <span>{program.spotsRemaining} of {program.capacity} spots left</span>
                    <Link href={`/futprep/lil-kickers/register?program=${program.slug}`}>Register →</Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <footer className="lk-footer">
        <Link className="lk-portpass-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <p>Registration powered by PortPass.</p>
        <div className="lk-footer-futprep"><img src="/futprep-logo.png" alt="" /><span>Futprep Athletics</span></div>
      </footer>
    </main>
  );
}
