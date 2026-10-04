import Link from "next/link";
import type { ReactNode } from "react";
import { ProgramForm, ProgramToggle } from "@/app/business/[slug]/registrations/ProgramForm";
import { RegistrationActions } from "@/app/business/[slug]/registrations/[registrationId]/RegistrationActions";
import "@/app/business/[slug]/registrations/registrations.css";
import type { BusinessProgram, BusinessRegistration, BusinessRegistrationDetail } from "@/db/businessRegistrations";
import { formatDateRange } from "@/lib/futprepTerms";
import { formatPhoneDisplay } from "@/lib/phone";

// A business's Registrations screens (brief 18, D4), drawn the same way
// through either door: the team's own sign-in (/business/<slug>/registrations)
// and the demo (/demo/registrations). The page's guard decides who is
// looking; these only draw what they are handed.

const dollars = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Nassau" }) : "");
const AUDIENCE = { children: "Children", adults: "Adults", mixed: "Children and adults" } as const;
const STATUS: Record<string, string> = { pending: "Received", pending_details: "Details to finish", confirmed: "Confirmed", waitlist: "Waitlist", trial: "Free taster", cancelled: "Cancelled" };
const PAYMENT: Record<string, string> = { pending: "Payment due", partial: "Part paid", paid: "Paid", overdue: "Overdue", waived: "Nothing to pay" };
const METHOD: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", online_banking: "Online banking transfer" };

export const registrationStatusLabel = (status: string) => STATUS[status] ?? status;

const owes = (r: BusinessRegistration) => r.status !== "cancelled" && r.status !== "waitlist" && r.paymentStatus !== "paid" && r.paymentStatus !== "waived" && r.amountDueCents > 0;

export function RegistrationsList({
  business,
  programs,
  registrations,
  basePath,
  homeHref,
  homeLabel,
  registerHref,
  canEdit,
  requestPayment,
}: {
  business: { id: number; name: string; isPublished: boolean };
  programs: BusinessProgram[];
  registrations: BusinessRegistration[];
  // Where one registration opens: `${basePath}/${id}`.
  basePath: string;
  homeHref: string;
  homeLabel: string;
  // The public registration form, when there is one to share.
  registerHref: string | null;
  // Add a class, open or close one: owners and admins. Never in the demo.
  canEdit: boolean;
  // "Request payment" on a registration that owes something, or null when
  // this person doesn't handle payments.
  requestPayment: ((registrationId: number) => ReactNode) | null;
}) {
  const active = registrations.filter((r) => r.status !== "cancelled");
  return (
    <>
      <div className="eyebrow"><span className="eyebrow-dot" />{business.name}</div>
      <h1>Registrations</h1>
      <p className="auth-lead">Your classes and camps, and everyone registered for them. Customers pay you directly; send a payment request from any registration.</p>
      {registerHref && business.isPublished && programs.some((p) => p.active) && (
        <p className="reg-share">Your registration form: <a href={registerHref}>portpassbahamas.com{registerHref}</a></p>
      )}
      {!business.isPublished && canEdit && <p className="auth-hint">Your page isn&rsquo;t public yet, so nobody can register. Set your classes up now; they open when the page goes live.</p>}

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
                  <strong><Link href={`${basePath}/${r.id}`}>{r.participantName}</Link></strong>
                  <span>{[r.programName, r.termName].filter(Boolean).join(" · ")}</span>
                  <span>{r.reference} · {day(r.submittedAt)}{r.participantIsAdult ? "" : ` · registered by ${r.contactName}`}</span>
                </div>
                <div className="reg-list-state">
                  <b>{STATUS[r.status] ?? r.status}</b>
                  {r.status !== "cancelled" && r.status !== "waitlist" && r.status !== "trial" && <span>{PAYMENT[r.paymentStatus] ?? r.paymentStatus}{r.amountDueCents > 0 ? ` · ${dollars(r.amountDueCents)}${r.paymentFrequency === "weekly" ? " a week" : ""}` : ""}</span>}
                  {requestPayment && owes(r) && requestPayment(r.id)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="auth-alt"><Link href={homeHref}>{homeLabel}</Link></p>
    </>
  );
}

export function RegistrationDetail({
  registration: r,
  listHref,
  actionsEndpoint,
  requestPayment,
  demo = false,
}: {
  registration: BusinessRegistrationDetail;
  listHref: string;
  // Where "Confirm the place" and "Cancel" are sent.
  actionsEndpoint: string;
  requestPayment: ReactNode | null;
  demo?: boolean;
}) {
  return (
    <>
      <div className="eyebrow"><span className="eyebrow-dot" />{STATUS[r.status] ?? r.status}</div>
      <h1>{r.participantName}</h1>
      <p className="auth-lead">{[r.programName, r.termName].filter(Boolean).join(" · ")} · {r.reference}</p>

      <section className="account-section">
        <h2>Registration</h2>
        <dl className="account-details">
          <div><dt>{r.participantIsAdult ? "Participant" : "Child"}</dt><dd>{r.participantName}{r.participantIsAdult ? " (adult)" : ""}</dd></div>
          {!r.participantIsAdult && r.childDob && <div><dt>Born</dt><dd>{r.childDob}</dd></div>}
          {!r.participantIsAdult && r.gender && <div><dt>Gender</dt><dd>{r.gender}</dd></div>}
          <div><dt>Payment</dt><dd>{PAYMENT[r.paymentStatus] ?? r.paymentStatus}{r.amountDueCents > 0 ? ` · ${dollars(r.amountDueCents)}${r.paymentFrequency === "weekly" ? " a week" : ""}` : ""}{r.paymentMethod ? ` · ${METHOD[r.paymentMethod] ?? r.paymentMethod}` : ""}</dd></div>
          <div><dt>Photos</dt><dd>{r.photoConsent === "yes" ? "Permission given" : r.photoConsent === "no" ? "No permission" : "Not answered"}</dd></div>
          {r.additionalNotes && <div><dt>Notes</dt><dd>{r.additionalNotes}</dd></div>}
        </dl>
      </section>

      <section className="account-section">
        <h2>{r.participantIsAdult ? "Contact" : "Parent or guardian"}</h2>
        <dl className="account-details">
          <div><dt>Name</dt><dd>{r.contactName}{r.relationship && !r.participantIsAdult ? ` (${r.relationship})` : ""}</dd></div>
          {/* The demo's invented people have no inbox and no phone: shown, never linked. */}
          <div><dt>Email</dt><dd>{r.contactEmail ? (demo ? r.contactEmail : <a href={`mailto:${r.contactEmail}`}>{r.contactEmail}</a>) : "—"}</dd></div>
          <div><dt>Phone</dt><dd>{r.contactPhone ? (demo ? formatPhoneDisplay(r.contactPhone) : <a href={`tel:${r.contactPhone}`}>{formatPhoneDisplay(r.contactPhone)}</a>) : "—"}</dd></div>
        </dl>
      </section>

      {!r.participantIsAdult && (
        <section className="account-section">
          <h2>Health and safety</h2>
          {r.health ? (
            <dl className="account-details">
              <div><dt>Emergency</dt><dd>{r.health.emergencyContactName ?? "—"}{r.health.emergencyContactPhone ? ` · ${formatPhoneDisplay(r.health.emergencyContactPhone)}` : ""}</dd></div>
              <div><dt>Allergies</dt><dd>{r.health.allergies ?? "None given"}</dd></div>
              <div><dt>Conditions</dt><dd>{r.health.medicalConditions ?? "None given"}</dd></div>
              <div><dt>Medication</dt><dd>{r.health.medications ?? "None given"}</dd></div>
              <div><dt>Needs</dt><dd>{r.health.specialNeeds ?? "None given"}</dd></div>
              <div><dt>Pickup</dt><dd>{r.health.authorizedPickup ?? "—"}</dd></div>
            </dl>
          ) : demo ? (
            <p className="auth-lead">The demo holds no health, emergency or pickup details for any child. In a real business they are shown here, and only to the team members the owner allows.</p>
          ) : (
            <p className="auth-lead">Health, emergency and pickup details are shown only to team members allowed to see medical details. The owner sets that in Settings → Team.</p>
          )}
        </section>
      )}

      <section className="account-section">
        <h2>What next</h2>
        <RegistrationActions endpoint={actionsEndpoint} status={r.status} />
        {requestPayment && owes(r) && <p className="reg-next">{requestPayment}</p>}
      </section>

      <p className="auth-alt"><Link href={listHref}>All registrations</Link></p>
    </>
  );
}
