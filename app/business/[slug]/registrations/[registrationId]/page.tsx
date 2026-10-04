import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { getBusinessRegistration } from "@/db/businessRegistrations";
import { requireOrgRole } from "@/lib/auth/guards";
import { handlesPayments } from "@/lib/paymentRequests/access";
import { formatPhoneDisplay } from "@/lib/phone";
import { RegistrationActions } from "./RegistrationActions";
import "../registrations.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registration | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

const dollars = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
const STATUS: Record<string, string> = { pending: "Received", pending_details: "Details to finish", confirmed: "Confirmed", waitlist: "Waitlist", trial: "Free taster", cancelled: "Cancelled" };
const PAYMENT: Record<string, string> = { pending: "Payment due", partial: "Part paid", paid: "Paid", overdue: "Overdue", waived: "Nothing to pay" };
const METHOD: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", online_banking: "Online banking transfer" };

// One registration (brief 18, D4). A child's health, emergency and pickup
// details are read and shown only to team members with the "can see
// medical details" permission (owners and admins always have it). PortPass
// staff opening a business through the platform door do not see them. An
// adult's registration has none.
export default async function BusinessRegistrationPage({ params }: { params: Promise<{ slug: string; registrationId: string }> }) {
  const { slug, registrationId } = await params;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/registrations/${registrationId}`);
  const id = Number(registrationId);
  const business = await getBusinessBySlug(slug);
  if (!business || !Number.isInteger(id) || id <= 0) notFound();
  const [r, payments] = await Promise.all([getBusinessRegistration(business.id, id, { mayViewHealth: access.canViewMedical }), handlesPayments(access)]);
  if (!r) notFound();
  const owing = r.status !== "cancelled" && r.status !== "waitlist" && r.paymentStatus !== "paid" && r.paymentStatus !== "waived" && r.amountDueCents > 0;

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Registrations", href: `/business/${slug}/registrations` }, { label: r.reference, href: `/business/${slug}/registrations/${r.id}` }]} />
      <div className="auth-card auth-card-wide">
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
            <div><dt>Email</dt><dd>{r.contactEmail ? <a href={`mailto:${r.contactEmail}`}>{r.contactEmail}</a> : "—"}</dd></div>
            <div><dt>Phone</dt><dd>{r.contactPhone ? <a href={`tel:${r.contactPhone}`}>{formatPhoneDisplay(r.contactPhone)}</a> : "—"}</dd></div>
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
            ) : (
              <p className="auth-lead">Health, emergency and pickup details are shown only to team members allowed to see medical details. The owner sets that in Settings → Team.</p>
            )}
          </section>
        )}

        <section className="account-section">
          <h2>What next</h2>
          <RegistrationActions organizationId={business.id} registrationId={r.id} status={r.status} />
          {payments && owing && <p className="reg-next"><Link className="primary-button" href={`/business/${slug}/payments/new?registration=${r.id}`}>Request payment</Link></p>}
        </section>

        <p className="auth-alt"><Link href={`/business/${slug}/registrations`}>All registrations</Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}
