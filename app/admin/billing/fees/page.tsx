import Link from "next/link";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { listEvents } from "@/db/billing";
import { requireAdmin } from "@/lib/auth/admin";
import { EVENT_KIND_LABEL, longDay, money } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";
import { AdminShell } from "../../_components/AdminShell";
import { AddFee } from "./AddFee";
import "../billing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fees | PortPass admin",
  robots: { index: false, follow: false },
};

// Admin -> Billing -> Fees per booking or wedding (brief 09, 2.4): what
// PortPass has earned per event, and whether each is on an invoice yet.
export default async function AdminBillingFeesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const session = await requireAdmin("/admin/billing/fees");
  const { show } = await searchParams;
  const invoiced = show === "invoiced" ? true : show === "to_invoice" ? false : null;
  const [events, businesses] = await Promise.all([listEvents({ invoiced }), listAdminBusinesses()]);
  const total = events.reduce((sum, event) => sum + event.feeCents, 0);

  return (
    <AdminShell session={session} current="/admin/billing" title="Fees per booking" lede="Wedding coordination fees and commissions. Each goes on the business's next monthly invoice, once." actions={<Link className="admin-bar-link" href="/admin/billing">All billing</Link>}>
      <div className="admin-filters" aria-label="Filter">
        <Link href="/admin/billing/fees" aria-current={invoiced === null ? "true" : undefined}>All</Link>
        <Link href="/admin/billing/fees?show=to_invoice" aria-current={invoiced === false ? "true" : undefined}>To invoice</Link>
        <Link href="/admin/billing/fees?show=invoiced" aria-current={invoiced === true ? "true" : undefined}>Invoiced</Link>
      </div>
      {events.length === 0 ? (
        <p className="admin-empty">No fees {invoiced === false ? "waiting to be invoiced" : invoiced ? "invoiced yet" : "recorded yet"}.</p>
      ) : (
        <>
          <p className="admin-form-note">{events.length} fee{events.length === 1 ? "" : "s"}, {money(total)} in total.</p>
          <table className="admin-table">
            <thead><tr><th>Date</th><th>Business</th><th>Kind</th><th>For</th><th>Fee</th><th>Invoice</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td data-label="Date">{longDay(event.eventOn)}</td>
                  <td data-label="Business">{event.organizationName}</td>
                  <td data-label="Kind">{EVENT_KIND_LABEL[event.kind]}</td>
                  <td data-label="For">{event.note ?? (event.rateBps ? `${event.rateBps / 100}% of ${money(event.bookingValueCents)}` : "—")}</td>
                  <td data-label="Fee"><strong>{money(event.feeCents)}</strong></td>
                  <td data-label="Invoice">{event.invoiceNumber ? <code>{event.invoiceNumber}</code> : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <AddFee businesses={businesses.map((business) => ({ id: business.id, name: business.name }))} today={nassauToday()} />
    </AdminShell>
  );
}
