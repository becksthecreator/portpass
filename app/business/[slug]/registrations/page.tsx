import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { listBusinessPrograms, listBusinessRegistrations } from "@/db/businessRegistrations";
import { requireOrgRole } from "@/lib/auth/guards";
import { handlesPayments } from "@/lib/paymentRequests/access";
import { formatDateRange } from "@/lib/futprepTerms";
import { ProgramForm, ProgramToggle } from "./ProgramForm";
import "./registrations.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registrations | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

const dollars = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Nassau" }) : "");
const AUDIENCE = { children: "Children", adults: "Adults", mixed: "Children and adults" } as const;
const STATUS: Record<string, string> = { pending: "Received", pending_details: "Details to finish", confirmed: "Confirmed", waitlist: "Waitlist", trial: "Free taster", cancelled: "Cancelled" };
const PAYMENT: Record<string, string> = { pending: "Payment due", partial: "Part paid", paid: "Paid", overdue: "Overdue", waived: "Nothing to pay" };

// A business's own Registrations screen (brief 18, D4): its classes and
// camps, who has registered, and "Request payment" on each. The same
// tables Futprep's staff desk reads, for any business, through the team's
// own sign-in. No health or emergency detail is in this list; one
// registration's are shown only to team members allowed to see them.
export default async function BusinessRegistrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/registrations`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const [programs, registrations, payments] = await Promise.all([listBusinessPrograms(business.id), listBusinessRegistrations(business.id), handlesPayments(access)]);
  const canEdit = access.membership ? access.membership.role === "org_owner" || access.membership.role === "org_admin" : Boolean(access.session.platformRole);
  // Futprep's public form is its own; every other business uses the shared one.
  const registerHref = slug === "futprep" ? "/futprep/register" : business.primaryCategory ? `/${business.primaryCategory}/${slug}/register` : null;
  const active = registrations.filter((r) => r.status !== "cancelled");

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Registrations", href: `/business/${slug}/registrations` }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />{business.name}</div>
        <h1>Registrations</h1>
        <p className="auth-lead">Your classes and camps, and everyone registered for them. Customers pay you directly; send a payment request from any registration.</p>
        {registerHref && business.isPublished && programs.some((p) => p.active) && (
          <p className="reg-share">Your registration form: <a href={registerHref}>portpassbahamas.com{registerHref}</a></p>
        )}
        {!business.isPublished && <p className="auth-hint">Your page isn&rsquo;t public yet, so nobody can register. Set your classes up now; they open when the page goes live.</p>}

        <section className="account-section" aria-labelledby="reg-programs">
          <h2 id="reg-programs">Classes and camps</h2>
          {programs.length === 0 ? (
            <p className="auth-lead">None yet. Add your first one below.</p>
          ) : (
            <ul className="reg-list">
              {programs.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <span>{AUDIENCE[p.audience]}{p.audience === "adults" ? "" : ` · ages ${p.ageLabel}`} · {p.programType === "camp" ? "Camp" : `${p.dayOfWeek}s ${p.startTime}`} · {p.location}</span>
                    {p.term ? <span>{p.term.name}: {formatDateRange(p.term.startDate, p.term.endDate)} · {p.programType === "camp" || p.term.weeklyFeeCents === 0 ? dollars(p.term.termFeeCents) : `${dollars(p.term.weeklyFeeCents)} a week or ${dollars(p.term.termFeeCents)} for the term`}</span> : <span>No open term</span>}
                  </div>
                  <div className="reg-list-state">
                    <b>{p.registered} of {p.capacity}</b>
                    <span>{p.active ? "Open" : "Closed"}</span>
                    {canEdit && <ProgramToggle organizationId={business.id} programId={p.id} active={p.active} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canEdit && <ProgramForm organizationId={business.id} />}
        </section>

        <section className="account-section" aria-labelledby="reg-people">
          <h2 id="reg-people">Registered {active.length > 0 ? `(${active.length})` : ""}</h2>
          {registrations.length === 0 ? (
            <p className="auth-lead">Nobody has registered yet.</p>
          ) : (
            <ul className="reg-list">
              {registrations.map((r) => (
                <li key={r.id} className={r.status === "cancelled" ? "is-cancelled" : undefined}>
                  <div>
                    <strong><Link href={`/business/${slug}/registrations/${r.id}`}>{r.participantName}</Link></strong>
                    <span>{[r.programName, r.termName].filter(Boolean).join(" · ")}</span>
                    <span>{r.reference} · {day(r.submittedAt)}{r.participantIsAdult ? "" : ` · registered by ${r.contactName}`}</span>
                  </div>
                  <div className="reg-list-state">
                    <b>{STATUS[r.status] ?? r.status}</b>
                    {r.status !== "cancelled" && r.status !== "waitlist" && r.status !== "trial" && <span>{PAYMENT[r.paymentStatus] ?? r.paymentStatus}{r.amountDueCents > 0 ? ` · ${dollars(r.amountDueCents)}${r.paymentFrequency === "weekly" ? " a week" : ""}` : ""}</span>}
                    {payments && r.status !== "cancelled" && r.status !== "waitlist" && r.paymentStatus !== "paid" && r.paymentStatus !== "waived" && r.amountDueCents > 0 && (
                      <Link href={`/business/${slug}/payments/new?registration=${r.id}`}>Request payment →</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="auth-alt"><Link href={`/business/${slug}`}>Back to my business</Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}
