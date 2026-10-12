import { BrandLogo } from "@/app/_components/BrandLogo";
import { formatPrice, formatPriceCents } from "@/app/_components/blocks/format";
import Link from "next/link";
import { loadOpsMap } from "@/db/opsMap";
import { costLabel, daysLabel, SURFACE_LABELS } from "@/lib/futprepLocations";
import { missingLines } from "@/lib/opsMissing";
import { requireFutprepStaff } from "../../staff-auth";
import { StaffLogoutButton } from "../StaffLogoutButton";
import "../coaches.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Operating map | Futprep staff",
  robots: { index: false, follow: false },
};

const rate = (cents: number | null) => (cents === null ? "Not set" : formatPriceCents(cents));

// Futprep's operating map (brief 31, B2): the CEO and admin logins. What
// runs where, at what price, with whom; what each place costs; private
// sessions and who takes them; pay rates; and what's still missing.
export default async function FutprepOpsPage() {
  const role = await requireFutprepStaff(["admin", "ceo"], "/futprep/staff/ops");
  const map = await loadOpsMap(role);
  const payByCoach = new Map((map.pay ?? []).map((coach) => [coach.id, coach]));
  const missing = missingLines({
    locations: map.locations,
    coaches: map.coaches.map((coach) => ({
      name: coach.display_name,
      active: coach.active,
      memberType: coach.member_type,
      photoUrl: coach.photo_url,
      workingDays: coach.working_days,
      login: coach.login ?? null,
      // Pay gaps are listed for the CEO only, who sees the rates.
      leadPayCents: map.pay ? payByCoach.get(coach.id)?.defaultLeadPayCents ?? null : 0,
    })),
  });
  const privateCoaches = map.coaches.filter((coach) => coach.active && coach.member_type === "coach" && coach.bookable);
  const activeLocations = map.locations.filter((location) => location.active);

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · Operating map</span></div>
        <nav>
          <Link href="/futprep/staff/locations">Locations</Link>
          <Link href="/futprep/staff/programs">Programs</Link>
          <Link href="/futprep/staff/team">Team</Link>
          {role === "ceo" && <Link href="/futprep/staff/pay">Coach pay</Link>}
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">{role === "ceo" ? "CEO" : "Admin"} · how Futprep runs</span><h1>Operating map.</h1></div>
          <p>Every program, place, private session and pay rate on one page, as Futprep has entered them. Anything still missing is listed first, with a link to the screen that fixes it.</p>
        </div>

        <section className="pay-section" aria-labelledby="ops-missing">
          <div className="pay-section-head"><h2 id="ops-missing">Missing{missing.length ? ` (${missing.length})` : ""}</h2></div>
          {missing.length === 0 ? (
            <p className="pay-note">Nothing missing.</p>
          ) : (
            <ul className="ops-missing">
              {missing.map((line) => (
                <li key={`${line.kind}:${line.who}`}><Link href={line.href}>{line.text} <span aria-hidden="true">→</span></Link></li>
              ))}
            </ul>
          )}
        </section>

        <section className="pay-section" aria-labelledby="ops-programs">
          <div className="pay-section-head"><h2 id="ops-programs">Programs</h2></div>
          {map.programs.length === 0 && <p className="pay-note">No programs switched on.</p>}
          <div className="pay-cards">
            {map.programs.map((program) => (
              <article className="pay-card" key={program.id}>
                <div className="pay-card-head"><strong>{program.name}</strong><span>{program.dayOfWeek} · {program.startTime}{program.endTime ? `–${program.endTime}` : ""}</span></div>
                <dl>
                  <div><dt>Ages</dt><dd>{program.ageLabel}</dd></div>
                  <div><dt>Place</dt><dd>{program.siteName ?? program.location}</dd></div>
                  <div><dt>Price</dt><dd>{program.programType === "contract" ? (program.contractFeeCents === null ? "Not set" : `${formatPriceCents(program.contractFeeCents)} ${program.contractBilling === "per_term" ? "per term" : "per session"} (school)`) : program.term ? `${formatPriceCents(program.term.weeklyFeeCents)} a week · ${formatPriceCents(program.term.termFeeCents)} a term` : "No term on"}</dd></div>
                  <div><dt>Coaches on duty</dt><dd>{program.coachesOnDuty}</dd></div>
                  <div><dt>Children per coach</dt><dd>{program.childrenPerCoach ?? "Not set"}</dd></div>
                  <div><dt>Registered</dt><dd>{program.registered} of {program.capacity}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="pay-section" aria-labelledby="ops-locations">
          <div className="pay-section-head"><h2 id="ops-locations">Locations and costs</h2><Link className="secondary-button" href="/futprep/staff/locations">Edit locations</Link></div>
          <div className="pay-cards">
            {activeLocations.map((location) => (
              <article className="pay-card" key={location.id}>
                <div className="pay-card-head"><strong>{location.name}</strong><span>{location.area ?? ""}</span></div>
                <dl>
                  <div><dt>Cost</dt><dd>{costLabel(location)}</dd></div>
                  <div><dt>Days</dt><dd>{daysLabel(location.daysAvailable)}</dd></div>
                  <div><dt>Surface</dt><dd>{location.surface ? SURFACE_LABELS[location.surface] : "Not set"}</dd></div>
                  <div><dt>Private sessions</dt><dd>{location.privateSessionsOk ? "Yes" : "No"}</dd></div>
                  <div><dt>Programs</dt><dd>{location.programs}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="pay-section" aria-labelledby="ops-private">
          <div className="pay-section-head"><h2 id="ops-private">Private sessions</h2></div>
          <div className="pay-cards">
            {map.services.map((service) => (
              <article className="pay-card" key={service.slug}>
                <div className="pay-card-head"><strong>{service.name}</strong><span>{service.isPublished ? `${service.durationMinutes} min` : "not on the booking page"}</span></div>
                <dl><div><dt>Price</dt><dd>{service.priceCents === null ? "Not set" : formatPrice(service.priceCents, service.priceUnit)}</dd></div></dl>
              </article>
            ))}
          </div>
          <h3 className="ops-subhead">Who takes them</h3>
          {privateCoaches.length === 0 ? <p className="pay-note">No coach takes private sessions yet.</p> : (
            <ul className="ops-list">
              {privateCoaches.map((coach) => <li key={coach.id}><strong>{coach.display_name}</strong> <span>{coach.working_days.length ? daysLabel(coach.working_days) : "Working days not set"}</span></li>)}
            </ul>
          )}
        </section>

        {map.pay && <section className="pay-section" aria-labelledby="ops-pay">
          <div className="pay-section-head"><h2 id="ops-pay">Coach pay rates</h2>{role === "ceo" && <Link className="secondary-button" href="/futprep/staff/pay">Set on Coach pay</Link>}</div>
          <p className="pay-note">Per class, as Alex has set them. A record of what Futprep owes; PortPass never pays coaches.</p>
          <div className="pay-cards">
            {map.pay!.map((coach) => (
              <article className="pay-card" key={coach.id}>
                <div className="pay-card-head"><strong>{coach.name}</strong>{!coach.active && <span>profile hidden</span>}</div>
                <dl>
                  <div><dt>Lead</dt><dd>{rate(coach.defaultLeadPayCents)}</dd></div>
                  <div><dt>Assistant</dt><dd>{rate(coach.defaultAssistantPayCents)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>}
      </section>
    </main>
  );
}
