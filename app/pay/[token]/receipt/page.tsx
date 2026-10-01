import { getPublicPaymentRequest } from "@/db/paymentRequests";
import { formatDay, methodLabel, money, payPath, receiptPath } from "@/lib/paymentRequests/rules";
import { lookupAllowed, PAY_PAGE_METADATA } from "../../lookup";
import { PayFrame, Unavailable } from "../../PayFrame";
import { PrintButton } from "../PayClient";
import "../../pay.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipt | PortPass Bahamas", ...PAY_PAGE_METADATA };

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Nassau" });
}

// The receipt (brief 17, §3): receipt number, business, customer, what it
// was for, amount paid, method, date received and the balance after it.
// Laid out as a definition list and a table so a screen reader reads it in
// order; prints from the browser.
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string }> }) {
  const { token } = await params;
  const { r: wanted } = await searchParams;
  if (!(await lookupAllowed())) return <Unavailable view={null} title="Too many lookups" detail="Wait a minute, then open the link again." />;
  const view = await getPublicPaymentRequest(token);
  if (!view) return <Unavailable view={null} title="This link isn't valid" detail="Check you have the whole link, or ask the business that sent it." />;
  const { request: req, business, payments } = view;
  if (req.expired) return <Unavailable view={view} title="This link has expired" detail={`Contact ${business.name} if you need a copy of your receipt for ${req.referenceCode}.`} />;

  const received = payments.filter((p) => p.status === "received" && p.receiptNumber);
  const payment = (wanted ? payments.find((p) => p.receiptNumber === wanted && p.receiptNumber) : null) ?? received[received.length - 1];
  if (!payment) return <Unavailable view={view} title="No receipt yet" detail={`${business.name} hasn't recorded a payment on ${req.referenceCode} yet. Once they do, your receipt is here.`} />;

  // The balance straight after this payment: what was still owed once it
  // and every earlier payment had come in.
  const index = payments.indexOf(payment);
  const paidToThen = payments.slice(0, index + 1).filter((p) => p.status === "received").reduce((sum, p) => sum + p.amountCents, 0);
  const balanceAfter = Math.max(0, req.totalCents - paidToThen);
  const others = received.filter((p) => p !== payment);

  return (
    <PayFrame view={view}>
      <article className="paypage-card" aria-labelledby="receipt-title">
        <div>
          <p className="paypage-eyebrow">{business.name}</p>
          <h1 id="receipt-title">Receipt</h1>
        </div>
        {payment.status === "refunded" && <p className="paypage-error">This payment was refunded.</p>}
        <p className="paypage-receipt-amount" aria-label={`Amount paid ${money(payment.amountCents)}`}>{money(payment.amountCents)}</p>
        <dl className="paypage-receipt-meta">
          <div><dt>Receipt number</dt><dd>{payment.receiptNumber}</dd></div>
          <div><dt>Date received</dt><dd>{longDate(payment.receivedAt)}</dd></div>
          <div><dt>Paid by</dt><dd>{methodLabel(payment.method)}</dd></div>
          <div><dt>Received from</dt><dd>{req.customerName}</dd></div>
          <div><dt>Paid to</dt><dd>{business.name}</dd></div>
          <div><dt>For request</dt><dd>{req.referenceCode}</dd></div>
          <div><dt>Balance after this payment</dt><dd>{balanceAfter > 0 ? money(balanceAfter) : "Nothing, paid in full"}</dd></div>
        </dl>
        <table className="paypage-items">
          <caption>What it was for</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {req.lines.map((l, i) => (
              <tr key={i}><td>{l.qty > 1 ? `${l.qty} × ${l.label} (${money(l.unitCents)} each)` : l.label}</td><td>{money(l.qty * l.unitCents)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row">Total</th><td>{money(req.totalCents)}</td></tr>
            <tr><th scope="row">This payment</th><td>{money(payment.amountCents)}</td></tr>
            <tr className="is-balance"><th scope="row">Balance</th><td>{money(balanceAfter)}</td></tr>
          </tfoot>
        </table>
        <p className="paypage-muted">Paid to {business.name} directly. PortPass never held this money. Amounts in Bahamian dollars (BSD). Request due {formatDay(req.dueDate)}.</p>
        <div className="paypage-actions">
          <PrintButton />
          <a className="paypage-btn" href={payPath(req.token)}>Back to the request</a>
        </div>
        {others.length > 0 && (
          <div className="paypage-noprint">
            <p className="paypage-muted">Other receipts on {req.referenceCode}:</p>
            <ul className="paypage-receipts">
              {others.map((p) => <li key={p.receiptNumber}><span>{money(p.amountCents)}</span><a href={receiptPath(req.token, p.receiptNumber)}>Receipt {p.receiptNumber}</a></li>)}
            </ul>
          </div>
        )}
      </article>
    </PayFrame>
  );
}
