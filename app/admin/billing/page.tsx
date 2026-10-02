import Link from "next/link";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { getBankDetails, getBillingOverview } from "@/db/billing";
import { requireAdmin } from "@/lib/auth/admin";
import { ACCOUNT_STATUS_LABEL, addDays, bankDetailsComplete, CYCLE_LABEL, INVOICE_STATUS_LABEL, isSubscription, LINE_SOURCE_LABEL, LINE_SOURCES, longDay, money, owedCents, type AccountStatus } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";
import { AdminShell } from "../_components/AdminShell";
import "./billing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Billing | PortPass admin",
  robots: { index: false, follow: false },
};

const FILTERS = [
  { key: "due", label: "Due this week" },
  { key: "overdue", label: "Overdue" },
  { key: "free", label: "On free period" },
  { key: "not_agreed", label: "Price not agreed" },
  { key: "unsigned", label: "Agreement not signed" },
] as const;

const STATUS_PILL: Record<AccountStatus, string> = { not_live: "", trial: "submitted", active: "live", past_due: "suspended", paused: "", ended: "" };

const day = (value: string | null) => (value ? longDay(value) : "—");
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-BS", { month: "short", year: "numeric", timeZone: "UTC" });

// Admin -> Billing (brief 09, 2.4): who should be paying PortPass, and
// when. The daily job drafts invoices; a founder reviews and sends each
// one. Nothing here charges anyone or touches a customer's payment.
export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const session = await requireAdmin("/admin/billing");
  const { show } = await searchParams;
  const filter = FILTERS.find((f) => f.key === show)?.key ?? null;
  const today = nassauToday();
  const [overview, businesses, bank] = await Promise.all([getBillingOverview(today), listAdminBusinesses(), getBankDetails()]);
  const week = addDays(today, 7);
  const roster = overview.roster.filter((row) => {
    if (filter === "due") return row.nextInvoiceOn !== null && row.nextInvoiceOn <= week;
    if (filter === "overdue") return row.overdueCents > 0;
    if (filter === "free") return row.status === "trial";
    if (filter === "not_agreed") return row.account.cycle === "not_agreed";
    if (filter === "unsigned") return !row.account.agreementSignedOn;
    return true;
  });
  const withAccount = new Set(overview.roster.map((row) => row.account.organizationId));
  const without = businesses.filter((business) => !withAccount.has(business.id));
  const s = overview.summary;

  return (
    <AdminShell
      session={session}
      current="/admin/billing"
      title="Billing"
      lede="Who pays PortPass, and when. Invoices are drafted for you; you review and send each one. PortPass never takes its fee out of a customer's payment."
      actions={<><Link className="admin-bar-link" href="/admin/billing/fees">Fees per booking</Link><Link className="admin-bar-link" href="/admin/billing/invoices/new">New invoice</Link></>}
    >
      {!bankDetailsComplete(bank) && <p className="admin-prices-warning">PortPass&rsquo;s bank details are not filled in, so no invoice can be sent. <Link className="admin-inline-link" href="/admin/settings#settings-bank">Add them in Settings</Link>.</p>}

      <section className="admin-group" aria-labelledby="billing-today">
        <h2 id="billing-today">Today</h2>
        <p className="billing-morning">{overview.morning}</p>
        <div className="admin-tiles">
          <div className="admin-tile"><strong>{money(s.recurringNowCents)}</strong><span>Recurring a month, now</span><small>{money(s.recurringAfterTrialsCents)} once free periods end</small></div>
          <div className="admin-tile"><strong>{money(s.collectedThisMonthCents)}</strong><span>Collected this month</span><small>{money(s.collectedToDateCents)} to date</small></div>
          <div className={`admin-tile${s.owedCents ? " is-alert" : ""}`}><strong>{money(s.owedCents)}</strong><span>Owed to PortPass</span><small>{money(s.overdueCents)} of it overdue</small></div>
          <div className={`admin-tile${overview.founderCalls.length ? " is-alert" : ""}`}><strong>{overview.founderCalls.length}</strong><span>Founder call needed</span><small>14 days or more overdue: the emails have stopped</small></div>
        </div>
      </section>

      {overview.drafts.length > 0 && (
        <section className="admin-group" aria-labelledby="billing-drafts">
          <h2 id="billing-drafts">Drafts to review and send</h2>
          <table className="admin-table">
            <thead><tr><th>Invoice</th><th>Business</th><th>For</th><th>Total</th><th>Open</th></tr></thead>
            <tbody>
              {overview.drafts.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice"><code>{invoice.number}</code></td>
                  <td data-label="Business">{invoice.organizationName}</td>
                  <td data-label="For">{longDay(invoice.periodStart)} to {longDay(invoice.periodEnd)}</td>
                  <td data-label="Total"><strong>{money(invoice.totalCents)}</strong></td>
                  <td data-label="Open"><Link className="admin-action is-primary" href={`/admin/billing/invoices/${invoice.id}`}>Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {overview.open.length > 0 && (
        <section className="admin-group" aria-labelledby="billing-open">
          <h2 id="billing-open">Sent and not yet paid</h2>
          <table className="admin-table">
            <thead><tr><th>Invoice</th><th>Business</th><th>Due</th><th>Owed</th><th>Status</th><th>Open</th></tr></thead>
            <tbody>
              {overview.open.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice"><code>{invoice.number}</code></td>
                  <td data-label="Business">{invoice.organizationName}</td>
                  <td data-label="Due">{longDay(invoice.dueOn)}</td>
                  <td data-label="Owed"><strong>{money(owedCents(invoice))}</strong> of {money(invoice.totalCents)}</td>
                  <td data-label="Status"><span className={`admin-pill ${invoice.status === "overdue" ? "suspended" : ""}`}>{INVOICE_STATUS_LABEL[invoice.status]}</span></td>
                  <td data-label="Open"><Link href={`/admin/billing/invoices/${invoice.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="admin-group" aria-labelledby="billing-roster">
        <h2 id="billing-roster">Who pays</h2>
        <div className="admin-filters" aria-label="Filter the list">
          <Link href="/admin/billing" aria-current={!filter ? "true" : undefined}>Everyone</Link>
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/admin/billing?show=${f.key}`} aria-current={filter === f.key ? "true" : undefined}>{f.label}</Link>
          ))}
        </div>
        {roster.length === 0 ? (
          <p className="admin-empty">{filter ? "Nobody matches." : "No business has a billing account yet. Set one up below."}</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Business</th><th>Plan</th><th>Amount</th><th>Free until</th><th>Next invoice</th><th>Owes now</th><th>Status</th><th>Agreement</th></tr></thead>
            <tbody>
              {roster.map((row) => (
                <tr key={row.account.organizationId}>
                  <td data-label="Business"><Link href={`/admin/billing/accounts/${row.account.organizationId}`}><strong>{row.account.organizationName}</strong></Link></td>
                  <td data-label="Plan">{row.account.planCode ?? "—"} · {CYCLE_LABEL[row.account.cycle]}</td>
                  <td data-label="Amount">{isSubscription(row.account.cycle) ? `${money(row.account.priceCents)} a month` : row.account.commissionBps ? `${row.account.commissionBps / 100}% of bookings` : "—"}</td>
                  <td data-label="Free until">{day(row.status === "trial" || row.status === "not_live" ? row.freeUntil : null)}</td>
                  <td data-label="Next invoice">{day(row.nextInvoiceOn)}</td>
                  <td data-label="Owes now">{row.owesCents ? <strong className={row.overdueCents ? "admin-owing" : undefined}>{money(row.owesCents)}</strong> : "—"}</td>
                  <td data-label="Status"><span className={`admin-pill ${STATUS_PILL[row.status]}`}>{ACCOUNT_STATUS_LABEL[row.status]}</span></td>
                  <td data-label="Agreement">{row.account.agreementSignedOn ? `Signed ${longDay(row.account.agreementSignedOn)}` : "Not signed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {without.length > 0 && (
          <p className="admin-form-note billing-without">No billing account yet: {without.map((business, index) => <span key={business.id}>{index ? " · " : ""}<Link className="admin-inline-link" href={`/admin/billing/accounts/${business.id}`}>{business.name}</Link></span>)}</p>
        )}
      </section>

      <section className="admin-group" aria-labelledby="billing-soon">
        <h2 id="billing-soon">Next 30 days</h2>
        {overview.dueSoon.length === 0 ? (
          <p className="admin-empty">Nothing coming up.</p>
        ) : (
          <ul className="billing-soon">
            {overview.dueSoon.map((item, index) => (
              <li key={`${item.on}-${item.organizationId}-${index}`}><span>{longDay(item.on)}</span><strong>{item.organizationName}</strong><small>{item.what}</small></li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-group" aria-labelledby="billing-lines">
        <h2 id="billing-lines">Invoiced, last six months</h2>
        <ul className="billing-soon">
          {overview.byLine.map((row) => {
            const parts = LINE_SOURCES.filter((source) => row.cents[source]).map((source) => `${LINE_SOURCE_LABEL[source]} ${money(row.cents[source] ?? 0)}`);
            const total = LINE_SOURCES.reduce((sum, source) => sum + (row.cents[source] ?? 0), 0);
            return <li key={row.month}><span>{monthName(row.month)}</span><strong>{total ? money(total) : "Nothing invoiced"}</strong>{parts.length > 0 && <small>{parts.join(" · ")}</small>}</li>;
          })}
        </ul>
      </section>

      <section className="admin-group" aria-labelledby="billing-export">
        <h2 id="billing-export">For the accountant</h2>
        <form className="leads-filter" method="get" action="/api/admin/billing/export">
          <label><span>From</span><input type="date" name="from" defaultValue={`${today.slice(0, 4)}-01-01`} required /></label>
          <label><span>To</span><input type="date" name="to" defaultValue={today} required /></label>
          <label><span>What</span>
            <select name="what" defaultValue="invoices">
              <option value="invoices">Invoices</option>
              <option value="receipts">Receipts</option>
            </select>
          </label>
          <div className="leads-filter-actions"><button className="primary-button" type="submit">Download CSV</button></div>
        </form>
      </section>
    </AdminShell>
  );
}
