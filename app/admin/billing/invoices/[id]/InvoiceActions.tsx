"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RECEIPT_METHOD_LABEL, RECEIPT_METHODS, type InvoiceStatus, type ReceiptMethod } from "@/lib/billing";

type Props = { id: number; number: string; status: InvoiceStatus; owedCents: number; paidCents: number; today: string; canSend: boolean; hasEmail: boolean; hasWhatsapp: boolean };

// What a founder can do with one invoice (brief 09, 2.4): send it by email
// (with the PDF), open WhatsApp with the message written, record money
// received, or void it. Each is one tap on one invoice.
export function InvoiceActions({ id, number, status, owedCents, paidCents, today, canSend, hasEmail, hasWhatsapp }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [amount, setAmount] = useState((owedCents / 100).toFixed(2));
  const [method, setMethod] = useState<ReceiptMethod>("bank_transfer");
  const [reference, setReference] = useState(number);
  const [receivedOn, setReceivedOn] = useState(today);
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

  async function sendEmail() {
    if (!confirm(`Send ${number} by email now? It is dated today and due in 14 days.`)) return;
    const data = await act("send_email");
    if (data) setDone(data.emailed === "sent" ? "Sent, with the PDF attached." : data.emailed === "skipped" ? "Marked as sent, but the email was not sent: email is not set up, or this is a test address." : "Marked as sent, but the email failed. See Messages.");
  }

  async function whatsapp() {
    const data = await act("whatsapp");
    if (data && typeof data.whatsappUrl === "string") {
      setWhatsappUrl(data.whatsappUrl);
      setDone("Marked as sent. Open WhatsApp and press send.");
    }
  }

  async function receipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = amount.replace(/[$,\s]/g, "");
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(typed) || Number(typed) <= 0) return setError("Enter the amount received, in dollars.");
    const data = await act("receipt", { receipt: { amountCents: Math.round(Number(typed) * 100), method, reference, receivedOn } });
    if (data) setDone(data.status === "paid" ? "Recorded. The invoice is paid." : "Recorded as a part payment.");
  }

  async function voidInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirm(`Void ${number}? Its number stays used and it can't be undone.`)) return;
    const data = await act("void", { reason });
    if (data) setDone("Voided.");
  }

  const sent = status !== "draft" && status !== "void";
  return (
    <div className="billing-actions">
      {status !== "void" && (
        <div className="admin-row-actions">
          <button type="button" className="admin-action is-primary" disabled={busy !== null || !canSend || !hasEmail} onClick={sendEmail}>{busy === "send_email" ? "Sending…" : sent ? "Email it again" : "Send by email"}</button>
          <button type="button" className="admin-action" disabled={busy !== null || !canSend || !hasWhatsapp} onClick={whatsapp}>{busy === "whatsapp" ? "One moment…" : "Send on WhatsApp"}</button>
        </div>
      )}
      {status !== "void" && !canSend && <p className="admin-form-note">Add PortPass&rsquo;s bank details in Settings before sending.</p>}
      {status !== "void" && canSend && !hasEmail && <p className="admin-form-note">This business has no billing email on its account.</p>}
      {whatsappUrl && <p><a className="admin-action is-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp ↗</a></p>}

      {sent && owedCents > 0 && (
        <form className="admin-action-ask" onSubmit={receipt}>
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
      )}

      {status !== "void" && paidCents === 0 && (
        <form className="admin-action-ask" onSubmit={voidInvoice}>
          <label><span>Void this invoice: say why (it is logged, and the number stays used)</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} /></label>
          <button type="submit" className="admin-action is-danger" disabled={busy !== null || !reason.trim()}>{busy === "void" ? "Voiding…" : "Void"}</button>
        </form>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="admin-row-done" role="status">{done}</p>}
    </div>
  );
}
