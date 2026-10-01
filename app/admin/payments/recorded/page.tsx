import Link from "next/link";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { listAdminPayments, outstandingByBusiness } from "@/db/adminPayments";
import { BOOKING_KIND_LABEL, methodLabel, reconcile } from "@/lib/adminBookings";
import { requireAdmin } from "@/lib/auth/admin";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Payments | PortPass admin",
  robots: { index: false, follow: false },
};

const VIEWS = [
  { key: "payments", label: "Payments" },
  { key: "owing", label: "Still owing" },
  { key: "months", label: "Month by month" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const PAYMENTS_ON_SCREEN = 200;

const money = (cents: number) => formatPriceCents(cents, { currency: false });

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-BS", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Nassau" });
}

function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-BS", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Payments (brief 08, 1.7): what each business recorded from its
// customers, what is still owed to it, and the same money by month and
// method to check against a bank statement. Customers pay the business
// directly; none of this money passes through PortPass.
export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ view?: string; org?: string }> }) {
  const session = await requireAdmin("/admin/payments");
  const params = await searchParams;
  const view: View = VIEWS.find((v) => v.key === params.view)?.key ?? "payments";
  const organizationId = params.org && /^\d{1,12}$/.test(params.org) ? Number(params.org) : null;
  const [payments, outstanding, businesses] = await Promise.all([listAdminPayments({ organizationId }), view === "owing" ? outstandingByBusiness() : Promise.resolve([]), listAdminBusinesses()]);

  const href = (next: { view?: View; org?: number | null }) => {
    const query = new URLSearchParams();
    const v = next.view ?? view;
    const org = next.org === undefined ? organizationId : next.org;
    if (v !== "payments") query.set("view", v);
    if (org) query.set("org", String(org));
    const text = query.toString();
    return text ? `/admin/payments?${text}` : "/admin/payments";
  };
  const received = payments.filter((payment) => payment.status === "received");
  const receivedCents = received.reduce((sum, payment) => sum + payment.amountCents, 0);
  const lines = view === "months" ? reconcile(payments) : [];
  const owing = organizationId ? outstanding.filter((entry) => entry.organizationId === organizationId) : outstanding;

  return (
    <AdminShell session={session} current="/admin/payments" title="Payments" lede="What businesses recorded from their customers: cash, bank transfer and online banking. Customers pay the business directly. PortPass never holds this money.">
      <div className="admin-filters" aria-label="View">
        {VIEWS.map((v) => (
          <Link key={v.key} href={href({ view: v.key })} aria-current={view === v.key ? "true" : undefined}>{v.label}</Link>
        ))}
      </div>
      <div className="admin-filters" aria-label="Filter by business">
        <Link href={href({ org: null })} aria-current={!organizationId ? "true" : undefined}>All businesses</Link>
        {businesses.map((business) => (
          <Link key={business.id} href={href({ org: business.id })} aria-current={organizationId === business.id ? "true" : undefined}>{business.name}</Link>
        ))}
      </div>

      {view === "payments" && (
        payments.length === 0 ? (
          <p className="admin-empty">No payments recorded yet.</p>
        ) : (
          <>
            <p className="admin-form-note">{received.length} received, {money(receivedCents)} in total{payments.length > PAYMENTS_ON_SCREEN ? `. The newest ${PAYMENTS_ON_SCREEN} are listed` : ""}.</p>
            <table className="admin-table">
              <thead>
                <tr><th>Received</th><th>Business</th><th>From</th><th>For</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded by</th></tr>
              </thead>
              <tbody>
                {payments.slice(0, PAYMENTS_ON_SCREEN).map((payment) => (
                  <tr key={`${payment.source}-${payment.id}`}>
                    <td data-label="Received">{when(payment.receivedAt)}</td>
                    <td data-label="Business">{payment.organizationName || "—"}</td>
                    <td data-label="From">{payment.payer || "—"}</td>
                    <td data-label="For">{BOOKING_KIND_LABEL[payment.kind]}{payment.bookingReference ? <> · <code>{payment.bookingReference}</code></> : null}</td>
                    <td data-label="Amount">{money(payment.amountCents)}{payment.status !== "received" ? <> <span className="admin-pill suspended">{payment.status}</span></> : null}</td>
                    <td data-label="Method">{methodLabel(payment.method)}</td>
                    <td data-label="Reference">{payment.reference ? <code>{payment.reference}</code> : "—"}</td>
                    <td data-label="Recorded by">{payment.recordedBy ?? (payment.source === "shop_order" ? "Marked paid on the order" : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      )}

      {view === "owing" && (
        owing.length === 0 ? (
          <p className="admin-empty">Nothing is owed to any business right now.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Business</th><th>Still owed by customers</th><th>Bookings</th><th>What it is</th><th>Open</th></tr>
            </thead>
            <tbody>
              {owing.map((entry) => (
                <tr key={entry.organizationId ?? 0}>
                  <td data-label="Business">{entry.organizationName || "—"}</td>
                  <td data-label="Still owed by customers"><strong>{money(entry.owingCents)}</strong></td>
                  <td data-label="Bookings">{entry.bookingsOwing}</td>
                  <td data-label="What it is">{entry.byKind.map((kind) => `${kind.label}: ${money(kind.owingCents)} (${kind.count})`).join(" · ")}</td>
                  <td data-label="Open">{entry.organizationId ? <Link href={`/admin/bookings?org=${entry.organizationId}&owing=1`}>See the bookings</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {view === "months" && (
        lines.length === 0 ? (
          <p className="admin-empty">No payments recorded yet.</p>
        ) : (
          <>
            <p className="admin-form-note">Check each line against the business&rsquo;s bank statement or cash book for that month. A transfer with no reference can&rsquo;t be matched to a statement line.</p>
            <table className="admin-table">
              <thead>
                <tr><th>Month</th><th>Business</th><th>Method</th><th>Payments</th><th>Received</th><th>No reference</th><th>Voided or refunded</th></tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={`${line.month}-${line.organizationId ?? 0}-${line.method}`}>
                    <td data-label="Month">{monthName(line.month)}</td>
                    <td data-label="Business">{line.organizationName || "—"}</td>
                    <td data-label="Method">{methodLabel(line.method)}</td>
                    <td data-label="Payments">{line.count}</td>
                    <td data-label="Received"><strong>{money(line.receivedCents)}</strong></td>
                    <td data-label="No reference">{line.missingReference > 0 ? <span className="admin-pill submitted">{line.missingReference}</span> : "—"}</td>
                    <td data-label="Voided or refunded">{line.reversedCount > 0 ? `${line.reversedCount} · ${money(line.reversedCents)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      )}

      <p className="admin-form-note">What businesses owe PortPass (plans and invoices) is kept apart from this, under Billing.</p>
    </AdminShell>
  );
}
