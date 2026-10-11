import Link from "next/link";
import { getMarketIncome, type SellerFees } from "@/db/marketOrders";
import { requireAdmin } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { invoicesMonth, monthName } from "@/lib/market/orders";
import { money } from "@/lib/shop/rules";
import { AdminShell } from "../../_components/AdminShell";
import { MarketSettingsForm } from "./MarketSettingsForm";
import "../market.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market income | PortPass admin",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent", part_paid: "Part paid", paid: "Paid", overdue: "Overdue", void: "Void" };

function FeesTable({ rows, month, csv }: { rows: SellerFees[]; month: string; csv: boolean }) {
  if (rows.length === 0) return <p className="admin-empty">Nothing for {monthName(month)}: no seller on the Seller plan and no paid order PortPass brought.</p>;
  return (
    <table className="admin-table mkt-admin-table">
      <thead><tr><th>Seller</th><th>Seller plan</th><th>Orders PortPass brought, paid</th><th>Goods</th><th>Commission</th><th>Total</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.organizationId}>
            <td data-label="Seller"><strong>{row.name}</strong>{csv && row.orders.length > 0 && <><br /><small><a href={`/api/admin/market/income?org=${row.organizationId}&month=${month}`}>Commission CSV</a></small></>}</td>
            <td data-label="Seller plan">{row.onSellerPlan ? money(row.fees.planCents) : "—"}</td>
            <td data-label="Orders">{row.fees.orders}</td>
            <td data-label="Goods">{money(row.fees.commissionBaseCents)}</td>
            <td data-label="Commission">{money(row.fees.commissionCents)}</td>
            <td data-label="Total"><strong>{money(row.fees.totalCents)}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Admin -> Market -> Income (brief 25, C5): PortPass's own Market fees.
// The Seller plan and the commission on orders PortPass brought go on one
// PortPass invoice per seller per month (Admin -> Billing sends it). Until
// a platform owner switches fees on, the daily job only logs what it would
// draft. PortPass never holds a buyer's money: these are what sellers owe
// PortPass, invoiced separately.
export default async function AdminMarketIncomePage() {
  const session = await requireAdmin("/admin/market/income");
  const income = await getMarketIncome();
  const canChange = hasPlatformRole(session, "platform_owner");
  const { settings, totals } = income;
  const lastMonthLive = invoicesMonth(settings, income.lastMonth);

  return (
    <AdminShell
      session={session}
      current="/admin/market"
      title="Market"
      lede="PortPass's Market fees: the Seller plan and the commission on paid orders PortPass brought, one PortPass invoice per seller per month. Buyers pay sellers directly; PortPass never holds that money."
    >
      <nav className="admin-filters" aria-label="Market">
        <Link href="/admin/market">Sellers</Link>
        <Link href="/admin/market/income" aria-current="page">Income</Link>
      </nav>

      <p className={settings.feesLive ? "admin-prices-note" : "form-error"} role="status">
        {settings.feesLive
          ? `Fees are on (since ${settings.feesLiveSince ?? "today"}): the daily job drafts last month's Market invoices on the 1st. Drafts are sent from Admin → Billing.`
          : "Fees are off (a dry run): the daily job only writes what it would draft to the log. Nothing is invoiced until a platform owner switches fees on below."}
      </p>

      <div className="admin-tiles">
        <div className="admin-tile"><span>Market invoices this month</span><strong>{totals.count}</strong><small>{monthName(income.month)}, for {monthName(income.lastMonth)}</small></div>
        <div className="admin-tile"><span>Invoiced</span><strong>{money(totals.totalCents)}</strong><small>Drafts included</small></div>
        <div className="admin-tile"><span>Paid</span><strong>{money(totals.paidCents)}</strong><small>Receipts recorded</small></div>
        <div className="admin-tile"><span>Outstanding</span><strong>{money(totals.outstandingCents)}</strong><small>Sent and not yet paid</small></div>
      </div>

      <section aria-labelledby="mkt-settings">
        <h2 id="mkt-settings">Prices</h2>
        {canChange ? (
          <MarketSettingsForm initial={{ sellerPlanCents: settings.sellerPlanCents, commissionBps: settings.commissionBps, feesLive: settings.feesLive }} />
        ) : (
          <p className="admin-prices-note">Seller plan {money(settings.sellerPlanCents)} a month · commission {settings.commissionBps / 100}% of the goods on paid orders PortPass brought. Only a platform owner can change these.</p>
        )}
      </section>

      <section aria-labelledby="mkt-invoices">
        <h2 id="mkt-invoices">This month&rsquo;s Market invoices</h2>
        {income.invoices.length === 0 ? (
          <p className="admin-empty">{settings.feesLive ? "None drafted this month yet." : "None: fees are off."}</p>
        ) : (
          <table className="admin-table mkt-admin-table">
            <thead><tr><th>Invoice</th><th>Seller</th><th>For</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>
              {income.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice"><Link href={`/admin/billing/invoices/${invoice.id}`}>{invoice.number}</Link></td>
                  <td data-label="Seller">{invoice.organizationName}</td>
                  <td data-label="For">{monthName(invoice.periodStart.slice(0, 7))}</td>
                  <td data-label="Total">{money(invoice.totalCents)}</td>
                  <td data-label="Paid">{money(invoice.paidCents)}</td>
                  <td data-label="Status">{STATUS_LABEL[invoice.status] ?? invoice.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="mkt-last-month">
        <h2 id="mkt-last-month">{monthName(income.lastMonth)}: {lastMonthLive ? "what the daily job drafts" : "what the daily job would draft (dry run)"}</h2>
        <FeesTable rows={income.lastMonthFees} month={income.lastMonth} csv />
      </section>

      <section aria-labelledby="mkt-this-month">
        <h2 id="mkt-this-month">{monthName(income.month)} so far</h2>
        <FeesTable rows={income.monthToDate} month={income.month} csv />
      </section>
    </AdminShell>
  );
}
