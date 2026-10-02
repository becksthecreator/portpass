import Link from "next/link";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { listAccounts, listEvents, listInvoices, raisedPeriods } from "@/db/billing";
import { requireAdmin } from "@/lib/auth/admin";
import { EVENT_KIND_LABEL, feeOutlook, longDay, money } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";
import { AdminShell } from "../../_components/AdminShell";
import { AddFee, RemoveFee } from "./AddFee";
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
  const [events, businesses, accounts, invoices] = await Promise.all([listEvents({ invoiced }), listAdminBusinesses(), listAccounts(), listInvoices()]);
  const total = events.reduce((sum, event) => sum + event.feeCents, 0);
  // A fee is only drafted onto an invoice for a business with an agreed
  // plan whose account is running.
  const accountOf = new Map(accounts.map((account) => [account.organizationId, account]));
  const outlookOf = (event: (typeof events)[number]) => feeOutlook(event, accountOf.get(event.organizationId) ?? null, raisedPeriods(invoices.filter((invoice) => invoice.organizationId === event.organizationId)));
  const stuck = events.filter((event) => event.invoiceLineId === null && (outlookOf(event) === "no_plan" || outlookOf(event) === "free_period"));

  return (
    <AdminShell session={session} current="/admin/billing" title="Fees per booking" lede="Wedding coordination fees and commissions. Each goes on the invoice drafted on the 1st of the month after, once." actions={<Link className="admin-bar-link" href="/admin/billing">All billing</Link>}>
      <div className="admin-filters" aria-label="Filter">
        <Link href="/admin/billing/fees" aria-current={invoiced === null ? "true" : undefined}>All</Link>
        <Link href="/admin/billing/fees?show=to_invoice" aria-current={invoiced === false ? "true" : undefined}>To invoice</Link>
        <Link href="/admin/billing/fees?show=invoiced" aria-current={invoiced === true ? "true" : undefined}>Invoiced</Link>
      </div>
      {stuck.length > 0 && (
        <p className="admin-form-note" role="note">
          <strong>{stuck.length} fee{stuck.length === 1 ? "" : "s"} ({money(stuck.reduce((sum, event) => sum + event.feeCents, 0))}) will not be invoiced as things stand:</strong> the business has no billing account, its plan isn&rsquo;t agreed yet, its account is paused or ended, or the fee is dated inside its free period. They are marked below.
        </p>
      )}
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
                  <td data-label="Invoice">
                    {event.invoiceNumber ? <code>{event.invoiceNumber}</code> : ({ invoiced_next: "Not yet", credit_waits: "Waiting for fees to set it against", free_period: "In the free period: never charged", no_plan: "No plan agreed: not invoiced" } as const)[outlookOf(event)]}
                    {event.invoiceLineId === null && (event.sourceTable === "manual" || event.sourceTable === "wedding_leads") && <> <RemoveFee id={event.id} /></>}
                  </td>
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
