import Link from "next/link";
import { CopyLinkButton } from "@/app/_components/CopyLinkButton";
import { BOOKINGS_ON_SCREEN, listAdminBookings } from "@/db/adminBookings";
import { listPublicCoachProfiles } from "@/db/coaches";
import { bookingLink } from "@/lib/bookingLink";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { BOOKING_KIND_LABEL, BOOKING_KINDS, isBookingKind, owingCents, type AdminBooking } from "@/lib/adminBookings";
import { requireAdmin } from "@/lib/auth/admin";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bookings | PortPass admin",
  robots: { index: false, follow: false },
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-BS", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Nassau" });
}

const money = (cents: number | null) => (cents === null ? "—" : formatPriceCents(cents, { currency: false }));
const words = (value: string | null) => (value ? value.replace(/_/g, " ") : "—");

// Where the work on a booking happens. Only a registration has a screen
// here (for the Reveal); the rest open in the business's own tools.
function openHref(booking: AdminBooking): string | null {
  if (booking.kind === "registration") return `/admin/bookings/registrations/${booking.id}`;
  if (booking.kind === "wedding_lead") return "/weddings/admin";
  return null;
}

// Bookings, registrations and leads across every business (brief 08, 1.6).
// A child's medical, allergy, medication, special-needs and emergency
// details are not on this screen or in the export, for anyone.
export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ org?: string; kind?: string; owing?: string }> }) {
  const session = await requireAdmin("/admin/bookings");
  const params = await searchParams;
  const organizationId = params.org && /^\d{1,12}$/.test(params.org) ? Number(params.org) : null;
  const kind = isBookingKind(params.kind) ? params.kind : null;
  const owing = params.owing === "1";
  const [bookings, businesses] = await Promise.all([listAdminBookings({ organizationId, kind, owing }), listAdminBusinesses()]);

  const href = (next: { org?: number | null; kind?: string | null; owing?: boolean }) => {
    const query = new URLSearchParams();
    const org = next.org === undefined ? organizationId : next.org;
    const k = next.kind === undefined ? kind : next.kind;
    const o = next.owing === undefined ? owing : next.owing;
    if (org) query.set("org", String(org));
    if (k) query.set("kind", k);
    if (o) query.set("owing", "1");
    const text = query.toString();
    return text ? `/admin/bookings?${text}` : "/admin/bookings";
  };
  const due = bookings.reduce((sum, b) => sum + (b.dueCents ?? 0), 0);
  const paid = bookings.reduce((sum, b) => sum + (b.paidCents ?? 0), 0);
  const owed = bookings.reduce((sum, b) => sum + owingCents(b), 0);

  // Brief 29, part D: the link that opens a booking with a coach chosen, for
  // a founder to paste into WhatsApp. Futprep only has coaches today.
  const coachLinks = await listPublicCoachProfiles().then((r) => r.coaches.filter((c) => c.bookable && c.member_type === "coach")).catch(() => []);

  return (
    <AdminShell
      session={session}
      current="/admin/bookings"
      title="Bookings"
      lede="Registrations, private sessions, booking requests, wedding leads and shop orders across every business. Children's health and emergency details are never shown here."
      actions={organizationId ? <a className="admin-bar-link" href={`/api/admin/bookings/export?org=${organizationId}`}>Export this business (CSV)</a> : undefined}
    >
      {coachLinks.length > 0 && (
        <div className="admin-section-card" aria-labelledby="booking-links">
          <h2 id="booking-links" style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>Futprep booking links</h2>
          <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>Each opens the booking with that coach chosen. Paste one into WhatsApp. Adding <code>&amp;utm_source=whatsapp</code> is kept on the request for a later report.</p>
          {coachLinks.map((coach) => (
            <div className="admin-section-row" key={coach.id}><strong>{coach.display_name}</strong> <code>{bookingLink("", coach.slug)}</code> <CopyLinkButton path={bookingLink("", coach.slug)} label="Copy booking link" /></div>
          ))}
        </div>
      )}
      <div className="admin-filters" aria-label="Filter by business">
        <Link href={href({ org: null })} aria-current={!organizationId ? "true" : undefined}>All businesses</Link>
        {businesses.map((business) => (
          <Link key={business.id} href={href({ org: business.id })} aria-current={organizationId === business.id ? "true" : undefined}>{business.name}</Link>
        ))}
      </div>
      <div className="admin-filters" aria-label="Filter by type">
        <Link href={href({ kind: null })} aria-current={!kind ? "true" : undefined}>All types</Link>
        {BOOKING_KINDS.map((k) => (
          <Link key={k} href={href({ kind: k })} aria-current={kind === k ? "true" : undefined}>{BOOKING_KIND_LABEL[k]}</Link>
        ))}
        <Link href={href({ owing: !owing })} aria-current={owing ? "true" : undefined}>Still owing</Link>
      </div>
      {!organizationId && <p className="admin-form-note">Choose a business to export its bookings as a spreadsheet.</p>}

      {bookings.length === 0 ? (
        <p className="admin-empty">Nothing matches this filter.</p>
      ) : (
        <>
          <p className="admin-form-note">
            {bookings.length === BOOKINGS_ON_SCREEN ? `The newest ${BOOKINGS_ON_SCREEN}` : bookings.length} shown · {money(due)} due · {money(paid)} paid · <strong>{money(owed)} still owing</strong>
          </p>
          <table className="admin-table">
            <thead>
              <tr><th>Business</th><th>Type</th><th>Booked by</th><th>For</th><th>Booked</th><th>Status</th><th>Due</th><th>Paid</th><th>Open</th></tr>
            </thead>
            <tbody>
              {bookings.map((booking) => {
                const open = openHref(booking);
                const left = owingCents(booking);
                return (
                  <tr key={`${booking.kind}-${booking.id}`}>
                    <td data-label="Business">{booking.organizationName || "—"}</td>
                    <td data-label="Type">{BOOKING_KIND_LABEL[booking.kind]}{booking.reference ? <><br /><code>{booking.reference}</code></> : null}</td>
                    <td data-label="Booked by">{booking.customer || "—"}</td>
                    <td data-label="For">{booking.detail || "—"}</td>
                    <td data-label="Booked">{when(booking.createdAt)}</td>
                    <td data-label="Status"><span className={`admin-pill ${booking.status}`}>{words(booking.status)}</span>{booking.paymentStatus && booking.paymentStatus !== booking.status ? <> · {words(booking.paymentStatus)}</> : null}</td>
                    <td data-label="Due">{money(booking.dueCents)}</td>
                    <td data-label="Paid">{money(booking.paidCents)}{left > 0 ? <><br /><small className="admin-owing">{money(left)} owing</small></> : null}</td>
                    <td data-label="Open">{open ? <Link href={open}>Open</Link> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </AdminShell>
  );
}
