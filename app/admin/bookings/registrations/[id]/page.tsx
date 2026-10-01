import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminRegistration } from "@/db/adminBookings";
import { owingCents, REVEAL_REASON_MAX, REVEAL_REASON_MIN } from "@/lib/adminBookings";
import { requireAdmin } from "@/lib/auth/admin";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { AdminShell } from "../../../_components/AdminShell";
import { RevealHealth } from "./RevealHealth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registration | PortPass admin",
  robots: { index: false, follow: false },
};

const money = (cents: number) => formatPriceCents(cents, { currency: false });
const words = (value: string | null) => (value ? value.replace(/_/g, " ") : "—");

function day(iso: string | null): string {
  if (!iso) return "—";
  const dateOnly = iso.length === 10;
  return new Date(dateOnly ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-BS", { day: "numeric", month: "long", year: "numeric", timeZone: dateOnly ? "UTC" : "America/Nassau" });
}

// One registration, as platform staff see it (brief 08, 1.6): who booked,
// for which child and class, and what was paid. The health and emergency
// details are not loaded with this page at all. Reveal fetches them once,
// after a reason is typed and logged.
export default async function AdminRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const session = await requireAdmin(`/admin/bookings/registrations/${encodeURIComponent(raw)}`);
  if (!/^\d{1,12}$/.test(raw)) notFound();
  const registration = await getAdminRegistration(Number(raw));
  if (!registration) notFound();
  const owing = owingCents({ status: registration.registrationStatus, paymentStatus: registration.paymentStatus, dueCents: registration.dueCents, paidCents: registration.paidCents });

  return (
    <AdminShell session={session} current="/admin/bookings" title={registration.childName} lede={`${registration.programName} · ${registration.organizationName} · ${registration.reference}`} actions={<Link className="admin-bar-link" href={`/admin/bookings?org=${registration.organizationId}`}>All bookings</Link>}>
      <dl className="admin-facts">
        <div><dt>Status</dt><dd><span className={`admin-pill ${registration.registrationStatus}`}>{words(registration.registrationStatus)}</span></dd></div>
        <div><dt>Registered</dt><dd>{day(registration.createdAt)}{registration.enteredByStaff ? ` · entered by ${registration.enteredByStaff}` : ""}</dd></div>
        <div><dt>Parent or guardian</dt><dd>{registration.parentName ?? "—"}{registration.relationship ? ` (${registration.relationship})` : ""}</dd></div>
        <div><dt>Contact</dt><dd>{registration.parentEmail ?? "—"}{registration.parentPhone ? ` · ${registration.parentPhone}` : ""}</dd></div>
        <div><dt>Child&rsquo;s date of birth</dt><dd>{day(registration.childDob)}</dd></div>
        <div><dt>Photo consent</dt><dd>{words(registration.photoConsent)}</dd></div>
        <div><dt>Payment</dt><dd>{words(registration.paymentStatus)}{registration.paymentMethod ? ` · ${words(registration.paymentMethod)}` : ""}</dd></div>
        <div><dt>Due and paid</dt><dd>{money(registration.dueCents)} due · {money(registration.paidCents)} paid{owing > 0 ? <> · <strong>{money(owing)} owing</strong></> : null}</dd></div>
      </dl>

      <section className="admin-group" aria-labelledby="health-h">
        <h2 id="health-h">Health and emergency details</h2>
        {registration.healthPurgedAt ? (
          <p className="admin-form-note">These were deleted on {day(registration.healthPurgedAt)}, 90 days after the programme ended. There is nothing to show.</p>
        ) : (
          <RevealHealth registrationId={registration.id} reasonMin={REVEAL_REASON_MIN} reasonMax={REVEAL_REASON_MAX} />
        )}
      </section>
    </AdminShell>
  );
}
