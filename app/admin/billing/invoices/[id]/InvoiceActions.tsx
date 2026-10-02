"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RECEIPT_METHOD_LABEL, RECEIPT_METHODS, type InvoiceStatus, type ReceiptMethod } from "@/lib/billing";

type Props = { id: number; number: string; status: InvoiceStatus; kind: string; owedCents: number; paidCents: number; today: string; canSend: boolean; hasEmail: boolean; hasWhatsapp: boolean; canRedraft: boolean };

// What a founder can do with one invoice (brief 09, 2.4): send it by email
// (with the PDF), open WhatsApp with the message written, record money
// received, or void it. Each is one tap on one invoice.
export function InvoiceActions({ id, number, status, kind, owedCents, paidCents, today, canSend, hasEmail, hasWhatsapp, canRedraft }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [reason, setReason] = useState("");

  async function act(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
    setBusy(action);
    setError("");
    setDone("");
    const response = await fetch(`/api/admin/billing/invoices/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as Record<string, unknown>) : {};
    setBusy(null);
    if (!response || !response.ok) {
      setError(typeof data.error === "string" ? data.error : "That didn't finish. Refresh the page to see where the invoice stands.");
      return null;
    }
    router.refresh();
    return data;
  }

  const sent = status !== "draft" && status !== "void";
  const settled = status === "paid";

  async function sendEmail() {
    if (!confirm(sent ? `Email ${number} again? Its date and due date do not change.` : `Send ${number} by email now? It is dated today and due in 14 days.`)) return;
    const data = await act("send_email");
    if (data) setDone("Sent, with the PDF attached.");
  }

  async function whatsapp() {
    if (!sent && !confirm(`Mark ${number} as sent today (due in 14 days) and open WhatsApp with the message ready?`)) return;
    const data = await act("whatsapp");
    if (data && typeof data.whatsappUrl === "string") {
      setWhatsappUrl(data.whatsappUrl);
      setDone(sent ? "Open WhatsApp and press send." : "Marked as sent. Open WhatsApp and press send.");
    }
  }

  async function markSent() {
    if (!confirm(`Mark ${number} as sent today, due in 14 days? Use this when you have handed it over another way.`)) return;
    const data = await act("mark_sent");
    if (data) setDone("Marked as sent.");
  }

  async function voidInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const period = kind === "subscription" ? " Its period can be drafted again: the daily run does that for the latest period, and \"Draft this period again\" does it for an earlier one. To not bill the period at all, give a free-month credit on the account." : kind === "commission" ? " Its fees go back to \"to invoice\" and are picked up by the next daily run." : "";
    if (!confirm(`Void ${number}? Its number stays used and it can't be undone.${period}`)) return;
    const data = await act("void", { reason });
    if (data) setDone("Voided.");
  }

  async function redraft() {
    if (!confirm(`Draft the period of ${number} again, at the account's terms as they are now?`)) return;
    const data = await act("redraft");
    if (data && typeof data.id === "number") router.push(`/admin/billing/invoices/${data.id}`);
  }

  return (
    <div className="billing-actions">
      {status !== "void" && !settled && (
        <div className="admin-row-actions">
          <button type="button" className="admin-action is-primary" disabled={busy !== null || !canSend || !hasEmail} onClick={sendEmail}>{busy === "send_email" ? "Sending…" : sent ? "Email it again" : "Send by email"}</button>
          <button type="button" className="admin-action" disabled={busy !== null || !canSend || !hasWhatsapp} onClick={whatsapp}>{busy === "whatsapp" ? "One moment…" : "Send on WhatsApp"}</button>
          {!sent && <button type="button" className="admin-action" disabled={busy !== null || !canSend} onClick={markSent}>{busy === "mark_sent" ? "One moment…" : "Mark as sent another way"}</button>}
        </div>
      )}
      {status !== "void" && !settled && !canSend && <p className="admin-form-note">Add PortPass&rsquo;s bank details in Settings before sending.</p>}
      {status !== "void" && !settled && canSend && !hasEmail && <p className="admin-form-note">This business has no billing email on its account.</p>}
      {whatsappUrl && <p><a className="admin-action is-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp ↗</a></p>}

      {/* Keyed on what has been received, so the amount starts again at the new balance after a part payment. */}
      {sent && owedCents > 0 && <ReceiptForm key={paidCents} number={number} owedCents={owedCents} paidCents={paidCents} today={today} busy={busy} onRecord={async (receipt) => {
        const data = await act("receipt", { receipt });
        if (data) setDone(data.status === "paid" ? "Recorded. The invoice is paid." : "Recorded as a part payment.");
      }} onError={setError} />}

      {status !== "void" && paidCents === 0 && (
        <form className="admin-action-ask" onSubmit={voidInvoice}>
          <label><span>Void this invoice: say why (it is logged, and the number stays used)</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} /></label>
          <button type="submit" className="admin-action is-danger" disabled={busy !== null || !reason.trim()}>{busy === "void" ? "Voiding…" : "Void"}</button>
        </form>
      )}

      {canRedraft && (
        <div className="admin-row-actions">
          <button type="button" className="admin-action" disabled={busy !== null} onClick={redraft}>{busy === "redraft" ? "Drafting…" : "Draft this period again"}</button>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="admin-row-done" role="status">{done}</p>}
    </div>
  );
}

type NewReceipt = { amountCents: number; method: ReceiptMethod; reference: string; receivedOn: string };

function ReceiptForm({ number, owedCents, paidCents, today, busy, onRecord, onError }: { number: string; owedCents: number; paidCents: number; today: string; busy: string | null; onRecord: (receipt: NewReceipt) => Promise<void>; onError: (message: string) => void }) {
  const [amount, setAmount] = useState((owedCents / 100).toFixed(2));
  const [method, setMethod] = useState<ReceiptMethod>("bank_transfer");
  const [reference, setReference] = useState(number);
  const [receivedOn, setReceivedOn] = useState(today);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = amount.replace(/[$,\s]/g, "");
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(typed) || Number(typed) <= 0) return onError("Enter the amount received, in dollars.");
    const amountCents = Math.round(Number(typed) * 100);
    if (amountCents > owedCents) return onError(`That is more than the $${(owedCents / 100).toFixed(2)} still owed on this invoice.`);
    await onRecord({ amountCents, method, reference, receivedOn });
  }

  return (
    <form className="admin-action-ask" onSubmit={submit}>
      <p><strong>Record money received</strong>{paidCents > 0 ? " (part payments add up)" : ""}</p>
      <label><span>Amount, in dollars</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" maxLength={12} /></label>
      <label><span>Received on</span><input type="date" value={receivedOn} max={today} onChange={(event) => setReceivedOn(event.target.value)} required /></label>
      <label><span>How</span>
        <select value={method} onChange={(event) => setMethod(event.target.value as ReceiptMethod)}>
          {RECEIPT_METHODS.map((m) => <option key={m} value={m}>{RECEIPT_METHOD_LABEL[m]}</option>)}
        </select>
      </label>
      <label><span>Reference on the bank statement</span><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} /></label>
      <button type="submit" className="admin-action is-primary" disabled={busy !== null}>{busy === "receipt" ? "Saving…" : "Record receipt"}</button>
    </form>
  );
}

// One received line, with the way to undo it: a receipt recorded by
// mistake is reversed (it stays on the page, struck out), never deleted.
export function ReverseReceipt({ invoiceId, receiptId, label }: { invoiceId: number; receiptId: number; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/billing/invoices/${invoiceId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse_receipt", receiptId, reason }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok) return setError(data.error ?? "That didn't finish. Refresh the page.");
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" className="admin-mini" onClick={() => setOpen(true)}>Reverse</button>;
  return (
    <form className="billing-reverse" onSubmit={reverse}>
      <label><span>Reverse {label}: say why (it is logged)</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} autoFocus /></label>
      <span className="billing-reverse-buttons">
        <button type="submit" className="admin-mini is-primary" disabled={busy || !reason.trim()}>{busy ? "Reversing…" : "Reverse it"}</button>
        <button type="button" className="admin-mini" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </span>
      {error && <span className="form-error" role="alert">{error}</span>}
    </form>
  );
}
