"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PaymentRequest, RequestPayment } from "@/db/paymentRequests";
import { formatPhoneDisplay } from "@/lib/phone";
import {
  balanceCents,
  canEditRequest,
  canRecordPayment,
  canVoidRequest,
  daysOverdue,
  displayStatus,
  formatDay,
  isOverdue,
  methodLabel,
  money,
  nassauDate,
  needsChecking,
  parseDollars,
  payPath,
  receiptMessage,
  receiptPath,
  reminderMessage,
  remindedRecently,
  requestMessage,
  REQUEST_METHODS,
  sentViaLabel,
  sinceLabel,
  statusLabel,
  whatsappLink,
} from "@/lib/paymentRequests/rules";

type Props = {
  request: PaymentRequest;
  payments: RequestPayment[];
  businessName: string;
  basePath: string;
  apiBase: string;
  origin: string;
  today: string;
  created: boolean;
};

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// One request, phone first: send it, see what the customer said, mark it
// paid, send the receipt, chase it, refund or void it. Every message is a
// person pressing a button.
export function RequestDetail({ request: r, payments, businessName, basePath, apiBase, origin, today, created }: Props) {
  const router = useRouter();
  const status = displayStatus(r, today);
  const balance = balanceCents(r);
  const payUrl = `${origin}${payPath(r.publicToken)}`;
  const messageInput = { businessName, customerName: r.customerName, referenceCode: r.referenceCode, lines: r.lines, totalCents: r.totalCents, balanceCents: balance, dueDate: r.dueDate, payUrl };
  const received = payments.filter((p) => p.status === "received");
  const latestReceipt = [...received].reverse().find((p) => p.receiptNumber);

  const [notice, setNotice] = useState(created ? "Request created. Now send it: nothing has gone to the customer yet." : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemind, setConfirmRemind] = useState(false);

  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [method, setMethod] = useState(r.methods[0] ?? "cash");
  const [receivedOn, setReceivedOn] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [justPaid, setJustPaid] = useState<{ receiptNumber: string; paymentId: number; amountCents: number } | null>(null);

  const [voidReason, setVoidReason] = useState("");
  const [refundNote, setRefundNote] = useState("");

  async function act(body: Record<string, unknown>, label: string, done?: string): Promise<boolean> {
    setBusy(label);
    setError("");
    const response = await fetch(`${apiBase}/requests/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!response.ok) {
      setError(data.error ?? "Something went wrong. Try again.");
      return false;
    }
    if (done) setNotice(done);
    router.refresh();
    return true;
  }

  // WhatsApp opens from the link itself (so the phone's WhatsApp gets it);
  // the click is recorded alongside.
  function recordWhatsApp(body: Record<string, unknown>, done: string) {
    void act(body, "whatsapp", done);
  }

  async function copyLink() {
    const ok = await copy(payUrl);
    if (!ok) {
      setError("Couldn't copy. Press and hold the link below to copy it.");
      return;
    }
    await act({ action: "send", via: "link" }, "copy", r.sentAt ? "Link copied." : "Link copied. Marked as sent: paste it to the customer.");
  }

  async function markPaid(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollars(amount);
    if (cents === null || cents <= 0) return setError("Enter the amount received.");
    setBusy("paid");
    setError("");
    const response = await fetch(`${apiBase}/requests/${r.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: cents, method, receivedOn, reference, note }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; receiptNumber?: string; paymentId?: number; status?: string };
    setBusy(null);
    if (!response.ok || !data.receiptNumber) return setError(data.error ?? "Could not record the payment.");
    setJustPaid({ receiptNumber: data.receiptNumber, paymentId: data.paymentId!, amountCents: cents });
    setNotice(data.status === "paid" ? `Paid in full. Receipt ${data.receiptNumber}.` : `Payment recorded. Receipt ${data.receiptNumber}.`);
    setReference("");
    setNote("");
    router.refresh();
  }

  async function refund(paymentId: number) {
    if (!refundNote.trim()) return setError("Say what was refunded and how.");
    setBusy(`refund-${paymentId}`);
    setError("");
    const response = await fetch(`${apiBase}/requests/${r.id}/payments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId, note: refundNote }) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!response.ok) return setError(data.error ?? "Could not record the refund.");
    setRefundNote("");
    setNotice("Refund recorded.");
    router.refresh();
  }

  const receiptFor = (p: { receiptNumber: string; amountCents: number }) => {
    const url = `${origin}${receiptPath(r.publicToken, p.receiptNumber)}`;
    // Straight after recording, until the page has refreshed, the balance
    // shown is still the one from before this payment.
    const refreshed = payments.some((pay) => pay.receiptNumber === p.receiptNumber);
    const balanceAfter = refreshed ? balance : Math.max(0, balance - p.amountCents);
    return { url, text: receiptMessage({ businessName, customerName: r.customerName, referenceCode: r.referenceCode, amountCents: p.amountCents, balanceCents: balanceAfter, receiptUrl: url }) };
  };
  const shareReceipt = justPaid ?? (latestReceipt ? { receiptNumber: latestReceipt.receiptNumber!, paymentId: latestReceipt.id, amountCents: latestReceipt.amountCents } : null);

  return (
    <>
      {notice && <p className="pay-notice" role="status">{notice}</p>}
      {error && <p className="pay-notice is-warn" role="alert">{error}</p>}

      <section className="pay-card" aria-labelledby="pay-summary">
        <div className="pay-card-head">
          <h2 id="pay-summary">{r.customerName}</h2>
          <span className={`pay-pill is-${status}`}>{statusLabel(status)}</span>
        </div>
        <dl className="pay-meta">
          <div><dt>Total</dt><dd>{money(r.totalCents)}</dd></div>
          {r.paidCents > 0 && <div><dt>Paid so far</dt><dd>{money(r.paidCents)}</dd></div>}
          {r.status !== "void" && <div><dt>Balance</dt><dd>{money(balance)}</dd></div>}
          <div><dt>Due</dt><dd>{formatDay(r.dueDate, today)}{isOverdue(r, today) ? ` · ${daysOverdue(r.dueDate, today)} days overdue` : ""}</dd></div>
          <div><dt>They can pay by</dt><dd>{r.methods.map(methodLabel).join(", ")}{r.allowPartPayment ? " · part payments allowed" : ""}</dd></div>
          {r.customerPhone && <div><dt>Phone</dt><dd><a className="pay-link" href={`tel:${r.customerPhone}`}>{formatPhoneDisplay(r.customerPhone)}</a></dd></div>}
          {r.customerEmail && <div><dt>Email</dt><dd>{r.customerEmail}</dd></div>}
          <div><dt>Sent</dt><dd>{r.sentAt ? `${nassauDate(r.sentAt)} by ${sentViaLabel(r.sentVia)}` : "Not yet"}</dd></div>
          {r.lastRemindedAt && <div><dt>Last reminded</dt><dd>{sinceLabel(r.lastRemindedAt)} ({r.reminderCount})</dd></div>}
          {r.status === "void" && <div><dt>Voided</dt><dd>{r.voidedReason}</dd></div>}
        </dl>
        <table className="pay-items">
          <thead><tr><th scope="col">For</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i}><td>{l.qty > 1 ? `${l.qty} × ${l.label} (${money(l.unitCents)} each)` : l.label}</td><td>{money(l.qty * l.unitCents)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row">Total</th><td><strong>{money(r.totalCents)}</strong></td></tr></tfoot>
        </table>
        <p className="pay-last"><a className="pay-link" href={payUrl} target="_blank" rel="noopener noreferrer">Open the customer&rsquo;s page ↗</a></p>
      </section>

      {needsChecking(r) && (
        <section className="pay-card pay-saying" aria-labelledby="pay-says-paid">
          <div className="pay-card-head">
            <h2 id="pay-says-paid">Customer says they&rsquo;ve paid</h2>
            <span className="pay-flag">Check and confirm</span>
          </div>
          <p className="pay-last">{sinceLabel(r.customerSaysPaidAt!)}. Check your bank account, Kanoo wallet or cash box, then mark it paid below. It stays unpaid until you do.</p>
          {r.customerSaysPaidNote && <blockquote>{r.customerSaysPaidNote}</blockquote>}
          <button type="button" className="pay-btn is-small" onClick={() => act({ action: "clear_flag" }, "flag", "Flag cleared. The request is still open.")} disabled={busy !== null}>Not received yet</button>
        </section>
      )}

      {r.status !== "void" && r.status !== "paid" && (
        <section className="pay-card" aria-labelledby="pay-send">
          <h2 id="pay-send">{r.sentAt ? "Send it again" : "Send it"}</h2>
          {!r.sentAt && <p className="pay-last">Nothing goes to the customer until you press one of these.</p>}
          <div className="pay-btns">
            <a className="pay-btn is-wa" href={whatsappLink(r.customerPhone, requestMessage(messageInput, today))} target="_blank" rel="noopener noreferrer" onClick={() => recordWhatsApp({ action: "send", via: "whatsapp_link" }, "WhatsApp opened with the message. Press send there.")}>
              {r.customerPhone ? "WhatsApp" : "WhatsApp (pick the contact)"}
            </a>
            {r.customerEmail && (
              <button type="button" className="pay-btn" onClick={() => act({ action: "send", via: "email" }, "email", `Emailed to ${r.customerEmail}.`)} disabled={busy !== null}>
                {busy === "email" ? "Sending…" : "Send by email"}
              </button>
            )}
            <button type="button" className="pay-btn" onClick={copyLink} disabled={busy !== null}>Copy link</button>
            {!r.sentAt && <button type="button" className="pay-btn" onClick={() => act({ action: "send", via: "in_person" }, "in_person", "Marked as handed over in person.")} disabled={busy !== null}>Handed over in person</button>}
          </div>
          <div className="pay-copyrow">
            <label className="sr-only" htmlFor="pay-link-field">The customer&rsquo;s link</label>
            <input id="pay-link-field" readOnly value={payUrl} onFocus={(e) => e.currentTarget.select()} />
          </div>
        </section>
      )}

      {canRecordPayment(r) && (
        <section className="pay-card" aria-labelledby="pay-mark">
          <h2 id="pay-mark">Mark paid</h2>
          <form className="pay-form" onSubmit={markPaid}>
            <div className="pay-two">
              <label className="pay-field">
                <span>Amount received ($)</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} readOnly={!r.allowPartPayment} aria-describedby="pay-amount-hint" />
                <small id="pay-amount-hint">{r.allowPartPayment ? `Up to ${money(balance)}.` : "This request is for the full balance."}</small>
              </label>
              <label className="pay-field">
                <span>How they paid</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  {[...r.methods, ...REQUEST_METHODS.filter((m) => !r.methods.includes(m))].map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
                </select>
              </label>
              <label className="pay-field">
                <span>Day received</span>
                <input type="date" value={receivedOn} max={today} onChange={(e) => setReceivedOn(e.target.value)} />
              </label>
              <label className="pay-field">
                <span>Reference (optional)</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="Transfer reference" />
              </label>
            </div>
            <label className="pay-field">
              <span>Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </label>
            <button type="submit" className="pay-btn is-primary" disabled={busy !== null}>{busy === "paid" ? "Recording…" : "Record payment"}</button>
          </form>
        </section>
      )}

      {shareReceipt && (
        <section className="pay-card" aria-labelledby="pay-receipt">
          <h2 id="pay-receipt">Receipt {shareReceipt.receiptNumber}</h2>
          <p className="pay-last">Send the customer their receipt.</p>
          <div className="pay-btns">
            <a className="pay-btn is-wa" href={whatsappLink(r.customerPhone, receiptFor(shareReceipt).text)} target="_blank" rel="noopener noreferrer">WhatsApp the receipt</a>
            {r.customerEmail && (
              <button type="button" className="pay-btn" onClick={() => act({ action: "email_receipt", paymentId: shareReceipt.paymentId }, "receipt", `Receipt emailed to ${r.customerEmail}.`)} disabled={busy !== null}>
                {busy === "receipt" ? "Sending…" : "Email the receipt"}
              </button>
            )}
            <a className="pay-btn" href={receiptPath(r.publicToken, shareReceipt.receiptNumber)} target="_blank" rel="noopener noreferrer">Open the receipt ↗</a>
          </div>
        </section>
      )}

      {(r.status === "sent" || r.status === "part_paid") && (
        <section className="pay-card" aria-labelledby="pay-remind">
          <h2 id="pay-remind">Remind</h2>
          <p className={`pay-last${remindedRecently(r.lastRemindedAt) ? " is-recent" : ""}`}>
            {r.lastRemindedAt ? `Last reminded ${sinceLabel(r.lastRemindedAt)} by ${r.lastRemindedVia === "email" ? "email" : "WhatsApp"}.` : "Not reminded yet."}
          </p>
          {remindedRecently(r.lastRemindedAt) && !confirmRemind ? (
            <button type="button" className="pay-btn is-small" onClick={() => setConfirmRemind(true)}>Remind again today?</button>
          ) : (
            <div className="pay-btns">
              <a className="pay-btn is-wa is-small" href={whatsappLink(r.customerPhone, reminderMessage(messageInput, today))} target="_blank" rel="noopener noreferrer" onClick={() => { setConfirmRemind(false); recordWhatsApp({ action: "remind", via: "whatsapp_link" }, "Reminder opened in WhatsApp. Press send there."); }}>
                Remind on WhatsApp
              </a>
              {r.customerEmail && (
                <button type="button" className="pay-btn is-small" onClick={() => { setConfirmRemind(false); void act({ action: "remind", via: "email" }, "remind-email", `Reminder emailed to ${r.customerEmail}.`); }} disabled={busy !== null}>
                  {busy === "remind-email" ? "Sending…" : "Remind by email"}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {payments.length > 0 && (
        <section className="pay-card" aria-labelledby="pay-history">
          <h2 id="pay-history">Payments</h2>
          <ul className="pay-history">
            {payments.map((p) => (
              <li key={p.id} className={p.status === "refunded" ? "is-refunded" : undefined}>
                <header><span>{p.receiptNumber ?? "Payment"}</span><b>{money(p.amountCents)}</b></header>
                <span>{nassauDate(p.receivedAt)} · {methodLabel(p.method)}{p.reference ? ` · ref ${p.reference}` : ""}{p.recordedBy ? ` · recorded by ${p.recordedBy}` : ""}</span>
                {p.note && <span>{p.note}</span>}
                {p.status === "refunded" && <span>Refunded {p.refundedAt ? nassauDate(p.refundedAt) : ""}: {p.refundNote}</span>}
                {p.status === "received" && p.receiptNumber && <a className="pay-link" href={receiptPath(r.publicToken, p.receiptNumber)} target="_blank" rel="noopener noreferrer">Receipt ↗</a>}
                {p.status === "received" && (
                  <details>
                    <summary>Record a refund</summary>
                    <div className="pay-form">
                      <label className="pay-field">
                        <span>What was refunded, and how</span>
                        <textarea rows={2} value={refundNote} onChange={(e) => setRefundNote(e.target.value)} maxLength={300} placeholder="e.g. $50 back by transfer on 3 Oct" />
                      </label>
                      <button type="button" className="pay-btn is-small is-danger" onClick={() => refund(p.id)} disabled={busy !== null}>Record refund of {money(p.amountCents)}</button>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEditRequest(r) && (
        <p className="pay-last"><Link className="pay-link" href={`${basePath}/${r.id}/edit`}>Change this request</Link></p>
      )}

      {canVoidRequest(r) && (
        <details className="pay-card pay-danger">
          <summary>Void this request</summary>
          <div className="pay-form">
            <p className="pay-last">It stays in the history, marked void, and the customer&rsquo;s page says it was cancelled.</p>
            <label className="pay-field">
              <span>Why</span>
              <textarea rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={300} />
            </label>
            <button type="button" className="pay-btn is-danger" disabled={busy !== null || !voidReason.trim()} onClick={() => act({ action: "void", reason: voidReason }, "void", "Request voided.")}>Void request</button>
          </div>
        </details>
      )}
      {!canVoidRequest(r) && r.status !== "void" && (
        <p className="pay-last">Money has been recorded against this request, so it can&rsquo;t be voided. Record a refund on the payment instead.</p>
      )}
    </>
  );
}
