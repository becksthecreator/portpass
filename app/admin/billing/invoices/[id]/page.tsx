import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccount, getBankDetails, getInvoice, listInvoices, raisedPeriods } from "@/db/billing";
import { requireAdmin } from "@/lib/auth/admin";
import { bankDetailsComplete, periodFitsCycle, howToPay, INVOICE_STATUS_LABEL, invoiceStatus, longDay, moneyExact, owedCents, periodLabel, RECEIPT_METHOD_LABEL } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";
import { AdminShell } from "../../../_components/AdminShell";
import { InvoiceActions, ReverseReceipt } from "./InvoiceActions";
import "../../billing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invoice | PortPass admin",
  robots: { index: false, follow: false },
};

// One PortPass invoice: its lines, what has been received, and what a
// founder can do with it (brief 09, 2.4).
export default async function AdminInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const session = await requireAdmin(`/admin/billing/invoices/${encodeURIComponent(raw)}`);
  if (!/^\d{1,12}$/.test(raw)) notFound();
  const stored = await getInvoice(Number(raw));
  if (!stored) notFound();
  const today = nassauToday();
  const invoice = { ...stored, status: invoiceStatus(stored, today) };
  const [account, bank, theirs] = await Promise.all([getAccount(invoice.organizationId), getBankDetails(), listInvoices({ organizationId: invoice.organizationId })]);
  // A void plan invoice can be drafted again while no other invoice covers its period.
  const canRedraft = invoice.status === "void" && invoice.kind === "subscription" && account !== null && periodFitsCycle(account.cycle, invoice.periodStart, invoice.periodEnd) && !raisedPeriods(theirs).some((period) => period.periodStart <= invoice.periodEnd && period.periodEnd >= invoice.periodStart);

  return (
    <AdminShell
      session={session}
      current="/admin/billing"
      title={invoice.number}
      lede={`${invoice.organizationName} · ${INVOICE_STATUS_LABEL[invoice.status]} · ${periodLabel(invoice.periodStart, invoice.periodEnd)}`}
      actions={<><Link className="admin-bar-link" href={`/admin/billing/accounts/${invoice.organizationId}`}>The account</Link><a className="admin-bar-link" href={`/api/business/orgs/${invoice.organizationId}/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">Open the PDF</a></>}
    >
      <dl className="admin-facts">
        <div><dt>Status</dt><dd><span className={`admin-pill ${invoice.status === "overdue" || invoice.status === "void" ? "suspended" : invoice.status === "paid" ? "live" : ""}`}>{INVOICE_STATUS_LABEL[invoice.status]}</span>{invoice.voidReason ? ` · ${invoice.voidReason}` : ""}</dd></div>
        <div><dt>{invoice.status === "draft" ? "Drafted" : "Issued"}</dt><dd>{longDay(invoice.issuedOn)}{invoice.status === "draft" ? " (it is dated the day you send it)" : ""}</dd></div>
        <div><dt>Due</dt><dd>{invoice.status === "draft" ? "14 days after it is sent" : longDay(invoice.dueOn)}</dd></div>
        <div><dt>Sent</dt><dd>{invoice.sentAt ? `${longDay(invoice.sentAt.slice(0, 10))}${invoice.sentVia ? ` by ${invoice.sentVia.replace("_", " ")}` : ""}` : "Not yet"}</dd></div>
        <div><dt>Bill to</dt><dd>{account?.billingEmail ?? "No billing email"}{account?.billingWhatsappE164 ? ` · ${account.billingWhatsappE164}` : ""}</dd></div>
        <div><dt>How to pay</dt><dd>{howToPay(bank)}</dd></div>
      </dl>

      <section className="admin-group" aria-labelledby="invoice-lines">
        <h2 id="invoice-lines">Lines</h2>
        <div className="billing-lines-wrap"><table className="billing-lines">
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit (BSD)</th><th className="num">Amount (BSD)</th></tr></thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}><td>{line.description}</td><td className="num">{line.qty}</td><td className="num">{moneyExact(line.unitCents)}</td><td className="num">{moneyExact(line.amountCents)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="num">Subtotal</td><td className="num">{moneyExact(invoice.subtotalCents)}</td></tr>
            <tr><td colSpan={3} className="num">VAT</td><td className="num">{moneyExact(invoice.vatCents)}</td></tr>
            <tr><td colSpan={3} className="num">Total due</td><td className="num">{moneyExact(invoice.totalCents)}</td></tr>
            {invoice.paidCents > 0 && <tr><td colSpan={3} className="num">Received</td><td className="num">{moneyExact(invoice.paidCents)}</td></tr>}
            {invoice.paidCents > 0 && <tr><td colSpan={3} className="num">Balance</td><td className="num">{moneyExact(owedCents(invoice))}</td></tr>}
          </tfoot>
        </table></div>
      </section>

      {invoice.receipts.length > 0 && (
        <section className="admin-group" aria-labelledby="invoice-receipts">
          <h2 id="invoice-receipts">Received</h2>
          <table className="admin-table">
            <thead><tr><th>On</th><th>Amount</th><th>How</th><th>Reference</th><th>If it is wrong</th></tr></thead>
            <tbody>
              {invoice.receipts.map((receipt) => (
                <tr key={receipt.id} className={receipt.reversedAt ? "billing-reversed" : undefined}>
                  <td data-label="On">{longDay(receipt.receivedOn)}</td><td data-label="Amount">{moneyExact(receipt.amountCents)}</td><td data-label="How">{RECEIPT_METHOD_LABEL[receipt.method]}</td><td data-label="Reference">{receipt.reference ?? "—"}</td>
                  <td data-label="If it is wrong">{receipt.reversedAt ? `Reversed: ${receipt.reversedReason ?? ""}` : invoice.status === "void" ? "—" : <ReverseReceipt invoiceId={invoice.id} receiptId={receipt.id} label={`the ${moneyExact(receipt.amountCents)} received on ${longDay(receipt.receivedOn)}`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="admin-group" aria-labelledby="invoice-actions">
        <h2 id="invoice-actions">What to do</h2>
        <InvoiceActions id={invoice.id} number={invoice.number} status={invoice.status} kind={invoice.kind} owedCents={owedCents(invoice)} paidCents={invoice.paidCents} today={today} canSend={bankDetailsComplete(bank)} hasEmail={Boolean(account?.billingEmail)} hasWhatsapp={Boolean(account?.billingWhatsappE164)} canRedraft={canRedraft} />
      </section>
    </AdminShell>
  );
}
