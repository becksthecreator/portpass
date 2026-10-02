import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccount, listInvoices, raisedPeriods } from "@/db/billing";
import { getBusiness } from "@/db/business";
import { listPlans } from "@/db/pricing";
import { requireAdmin } from "@/lib/auth/admin";
import { ACCOUNT_STATUS_LABEL, INVOICE_STATUS_LABEL, invoiceStatus, longDay, money } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";
import { AdminShell } from "../../../_components/AdminShell";
import { AccountForm, type AccountDraft } from "./AccountForm";
import "../../billing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Billing account | PortPass admin",
  robots: { index: false, follow: false },
};

const dollars = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(/\.00$/, "") : "");

// One business's billing account, and its invoices (brief 09, 2.4).
export default async function AdminBillingAccountPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params;
  const session = await requireAdmin(`/admin/billing/accounts/${encodeURIComponent(raw)}`);
  if (!/^\d{1,12}$/.test(raw)) notFound();
  const organizationId = Number(raw);
  const business = await getBusiness(organizationId);
  if (!business) notFound();
  const today = nassauToday();
  const [account, invoices, plans] = await Promise.all([getAccount(organizationId), listInvoices({ organizationId }), listPlans({ fresh: true, includeInactive: true })]);

  const initial: AccountDraft = account
    ? {
        planCode: account.planCode ?? "", cycle: account.cycle, price: dollars(account.priceCents), annualMonthsCharged: String(account.annualMonthsCharged), retainer: dollars(account.retainerCents),
        extraLocations: account.extraLocations ? String(account.extraLocations) : "", extraLocationPrice: dollars(account.extraLocationCents), commissionPercent: account.commissionBps ? String(account.commissionBps / 100) : "",
        goLiveOn: account.goLiveOn ?? "", freeMonthsCredit: account.freeMonthsCredit ? String(account.freeMonthsCredit) : "", creditReason: account.creditReason ?? "", freeUntilOverride: account.freeUntilOverride ?? "",
        freeUntilOverrideReason: account.freeUntilOverrideReason ?? "", setupFee: dollars(account.setupFeeCents), setupStatus: account.setupStatus, agreementSignedOn: account.agreementSignedOn ?? "", agreementVersion: account.agreementVersion ?? "",
        billingEmail: account.billingEmail ?? "", billingWhatsapp: account.billingWhatsappE164 ?? "", paused: account.paused, ended: account.ended, statusReason: account.statusReason ?? "", notes: account.notes ?? "",
      }
    : {
        planCode: "", cycle: "not_agreed", price: "", annualMonthsCharged: "10", retainer: "", extraLocations: "", extraLocationPrice: "25", commissionPercent: "", goLiveOn: "", freeMonthsCredit: "", creditReason: "",
        freeUntilOverride: "", freeUntilOverrideReason: "", setupFee: "", setupStatus: "waived", agreementSignedOn: "", agreementVersion: "", billingEmail: business.publicEmail ?? "", billingWhatsapp: business.whatsappE164 ?? "",
        paused: false, ended: false, statusReason: "", notes: "",
      };

  return (
    <AdminShell
      session={session}
      current="/admin/billing"
      title={business.name}
      lede={account ? `${ACCOUNT_STATUS_LABEL[account.status]}${account.freeUntil && (account.status === "trial" || account.status === "not_live") ? ` · free until ${longDay(account.freeUntil)}` : ""}${account.nextInvoiceOn ? ` · next invoice ${longDay(account.nextInvoiceOn)}` : ""}` : "No billing account yet. Nothing is invoiced until you set one up."}
      actions={<Link className="admin-bar-link" href="/admin/billing">All billing</Link>}
    >
      <AccountForm organizationId={organizationId} organizationName={business.name} initial={initial} isNew={!account} today={today} billingStarted={raisedPeriods(invoices).length > 0} nextInvoiceOn={account?.nextInvoiceOn ?? null} plans={plans.map((plan) => ({ code: plan.code, name: plan.name, monthlyCents: plan.monthlyCents, commissionBps: plan.commissionBps, annualMonthsCharged: plan.annualMonthsCharged }))} />

      <section className="admin-group billing-without" aria-labelledby="account-invoices">
        <h2 id="account-invoices">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="admin-empty">None yet.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Total</th><th>Received</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice"><Link href={`/admin/billing/invoices/${invoice.id}`}><code>{invoice.number}</code></Link></td>
                  <td data-label="Issued">{longDay(invoice.issuedOn)}</td>
                  <td data-label="Due">{longDay(invoice.dueOn)}</td>
                  <td data-label="Total">{money(invoice.totalCents)}</td>
                  <td data-label="Received">{money(invoice.paidCents)}</td>
                  <td data-label="Status">{INVOICE_STATUS_LABEL[invoiceStatus(invoice, today)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AdminShell>
  );
}
