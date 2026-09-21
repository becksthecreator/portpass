import Link from "next/link";
import { getFutprepAvailability } from "@/db/registrations";
import { programTimeRange, formatMoney } from "@/app/futprep/config";

// force-dynamic: reads live program/pricing data at request time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sports & Fitness | PortPass",
  description: "Real Saturday sessions, ages and prices for sports and fitness programs on PortPass.",
};

export default async function SportsFitnessPage() {
  const availability = await getFutprepAvailability();

  return (
    <main className="form-page">
      <header className="site-header form-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <Link className="header-link" href="/">Back home</Link>
      </header>
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Sports & Fitness</div>
        <h1>Live on PortPass now.</h1>
        <p>Futprep Athletics runs its Saturday football programs through PortPass — real classes, real prices, real registration.</p>
      </section>

      <div className="application-form">
        <div className="form-grid">
          {availability.map((program) => (
            <div key={program.slug} className="full-field">
              <span>{program.name} · Ages {program.ageMin}–{program.ageMax}</span>
              <p>{program.day}s, {programTimeRange(program)} · {program.location}<br />
              {formatMoney(program.weeklyFeeCents)}/week or {formatMoney(program.termFeeCents)} for the term · {program.spotsRemaining} of {program.capacity} spots left</p>
            </div>
          ))}
        </div>
        <div className="form-submit">
          <p>More sports and fitness organizations join PortPass as they come on board.</p>
          <Link className="primary-button" href="/sports-fitness/futprep-athletics">Explore Futprep →</Link>
        </div>
      </div>
    </main>
  );
}
