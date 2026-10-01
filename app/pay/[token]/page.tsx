import { getPublicPaymentRequest } from "@/db/paymentRequests";
import { nassauToday } from "@/lib/futprepTerms";
import { daysOverdue, formatDay, isOverdue, methodLabel, money, nassauDate, receiptPath } from "@/lib/paymentRequests/rules";
import { lookupAllowed, PAY_PAGE_METADATA } from "../lookup";
import { ContactBusiness, PayFrame, Unavailable } from "../PayFrame";
import { CopyReference, IvePaid } from "./PayClient";
import "../pay.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment request | PortPass Bahamas", ...PAY_PAGE_METADATA };

type Params = Promise<{ token: string }>;

// The customer's page (brief 17, §3): what it's for, what's paid, the
// balance and how to pay the business directly. Nothing on this page takes
// a payment: PortPass never takes the money.
export default async function PayPage({ params }: { params: Params }) {
  const { token } = await params;
  if (!(await lookupAllowed())) return <Unavailable view={null} title="Too many lookups" detail="Wait a minute, then open the link again." />;
  const view = await getPublicPaymentRequest(token);
  if (!view) return <Unavailable view={null} title="This link isn't valid" detail="Check you have the whole link, or ask the business that sent it to send it again." />;
  const { request: r, business, howToPay, payments } = view;
  if (r.expired) return <Unavailable view={view} title="This link has expired" detail={`Contact ${business.name} if you need anything about ${r.referenceCode}.`} />;

  const today = nassauToday();
  const overdue = isOverdue(r, today);
  const owing = r.status !== "void" && r.balanceCents > 0;
  const received = payments.filter((p) => p.status === "received");
  const statusBox =
    r.status === "void"
      ? { cls: "is-void", title: "Cancelled", text: `${business.name} cancelled this request. There's nothing to pay.` }
      : r.status === "paid"
        ? { cls: "is-paid", title: "Paid", text: `Paid in full. Thank you.` }
        : r.status === "part_paid"
          ? { cls: overdue ? "is-overdue" : "", title: `${money(r.balanceCents)} still to pay`, text: `${money(r.paidCents)} paid so far. ${overdue ? `The balance was due ${formatDay(r.dueDate, today)}.` : `Due ${formatDay(r.dueDate, today)}.`}` }
          : overdue
            ? { cls: "is-overdue", title: `${money(r.balanceCents)} overdue`, text: `This was due ${formatDay(r.dueDate, today)}, ${daysOverdue(r.dueDate, today)} ${daysOverdue(r.dueDate, today) === 1 ? "day" : "days"} ago.` }
            : { cls: "", title: `${money(r.balanceCents)} due ${formatDay(r.dueDate, today)}`, text: r.allowPartPayment ? "You can pay it in parts." : "Please pay the full amount." };

  return (
    <PayFrame view={view}>
      <div>
        <p className="paypage-eyebrow">Payment request for {r.customerName}</p>
        <h1><span className="paypage-ref">{r.referenceCode}</span></h1>
      </div>

      <section className={`paypage-status ${statusBox.cls}`} aria-live="polite">
        <strong>{statusBox.title}</strong>
        <span>{statusBox.text}</span>
        {r.status === "paid" && received.length > 0 && received[received.length - 1].receiptNumber && (
          <a className="paypage-btn is-small" href={receiptPath(r.token, received[received.length - 1].receiptNumber)}>View your receipt</a>
        )}
      </section>

      <section className="paypage-card" aria-labelledby="paypage-for">
        <h2 id="paypage-for">What it&rsquo;s for</h2>
        <table className="paypage-items">
          <thead><tr><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i}><td>{l.qty > 1 ? `${l.qty} × ${l.label} (${money(l.unitCents)} each)` : l.label}</td><td>{money(l.qty * l.unitCents)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row">Total</th><td>{money(r.totalCents)}</td></tr>
            {r.paidCents > 0 && <tr><th scope="row">Paid so far</th><td>{money(r.paidCents)}</td></tr>}
            {r.status !== "void" && <tr className="is-balance"><th scope="row">Balance</th><td>{money(r.balanceCents)}</td></tr>}
          </tfoot>
        </table>
        <p className="paypage-muted">Due {formatDay(r.dueDate, today)} · Amounts in Bahamian dollars (BSD)</p>
      </section>

      {owing && (
        <section className="paypage-card" aria-labelledby="paypage-how">
          <h2 id="paypage-how">How to pay</h2>
          <p className="paypage-direct">Pay {business.name} directly. PortPass never holds your money.</p>
          <div className="paypage-quote">
            <div><span>Quote this reference</span><br /><strong>{r.referenceCode}</strong></div>
            <CopyReference value={r.referenceCode} />
          </div>
          {r.methods.includes("bank_transfer") && (
            <div className="paypage-method">
              <h3>{methodLabel("bank_transfer")}</h3>
              {(howToPay.bankName || howToPay.accountName || howToPay.accountNumberLast4) && (
                <dl>
                  {howToPay.bankName && <div><dt>Bank</dt><dd>{howToPay.bankName}</dd></div>}
                  {howToPay.accountName && <div><dt>Account name</dt><dd>{howToPay.accountName}</dd></div>}
                  {howToPay.accountNumberLast4 && <div><dt>Account ending</dt><dd>•••• {howToPay.accountNumberLast4}</dd></div>}
                </dl>
              )}
              {howToPay.transferInstructions && <p>{howToPay.transferInstructions}</p>}
              <p className="paypage-muted">Put {r.referenceCode} in the transfer&rsquo;s reference so {business.name} can match it.</p>
            </div>
          )}
          {r.methods.includes("cash") && (
            <div className="paypage-method">
              <h3>{methodLabel("cash")}</h3>
              <p>{howToPay.cashNote || `Arrange a time with ${business.name}.`}</p>
            </div>
          )}
          {r.methods.includes("kanoo_wallet_manual") && howToPay.kanooHandleOrPhone && (
            <div className="paypage-method">
              <h3>{methodLabel("kanoo_wallet_manual")}</h3>
              <p>Send to {howToPay.kanooHandleOrPhone} from your own Kanoo app, with {r.referenceCode} in the note.</p>
            </div>
          )}
          {(r.status === "sent" || r.status === "part_paid") && (
            <>
              <p className="paypage-muted">Paid already? Let {business.name} know. They&rsquo;ll check and confirm.</p>
              <IvePaid token={r.token} businessName={business.name} alreadySaid={r.customerSaysPaidAt !== null} />
            </>
          )}
        </section>
      )}

      {payments.length > 0 && (
        <section className="paypage-card" aria-labelledby="paypage-receipts">
          <h2 id="paypage-receipts">Payments received</h2>
          <ul className="paypage-receipts">
            {payments.map((p, i) => (
              <li key={p.receiptNumber ?? i}>
                <span>{nassauDate(p.receivedAt)} · {methodLabel(p.method)} · {money(p.amountCents)}{p.status === "refunded" ? " (refunded)" : ""}</span>
                {p.status === "received" && p.receiptNumber && <a href={receiptPath(r.token, p.receiptNumber)}>Receipt {p.receiptNumber}</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="paypage-card paypage-noprint" aria-labelledby="paypage-questions">
        <h2 id="paypage-questions">Questions?</h2>
        <p className="paypage-muted">Contact {business.name} about {r.referenceCode}.</p>
        <ContactBusiness business={business} />
      </section>
    </PayFrame>
  );
}
