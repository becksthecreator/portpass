"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PaymentSettings } from "@/db/paymentRequests";

// How customers pay this business. Only the last four digits of an account
// number have a field of their own; a business that wants its full number
// on the customer's page writes it into the transfer instructions, which
// only a request's own page shows.
export function PaymentSettingsForm({ apiBase, initial, suggestedPrefix, canEdit }: { apiBase: string; initial: PaymentSettings | null; suggestedPrefix: string; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    referencePrefix: initial?.referencePrefix ?? suggestedPrefix,
    bankName: initial?.bankName ?? "",
    accountName: initial?.accountName ?? "",
    accountNumberLast4: initial?.accountNumberLast4 ?? "",
    transferInstructions: initial?.transferInstructions ?? "",
    kanooHandleOrPhone: initial?.kanooHandleOrPhone ?? "",
    cashNote: initial?.cashNote ?? "",
    defaultDueDays: String(initial?.defaultDueDays ?? 7),
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    const response = await fetch(`${apiBase}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, defaultDueDays: Number(form.defaultDueDays) }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; howToPayChanged?: boolean };
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not save.");
    setSaved(data.howToPayChanged ? "Saved. Every owner has been emailed that the payment details changed." : "Saved.");
    router.refresh();
  }

  return (
    <form className="preq-form" onSubmit={save}>
      {!canEdit && <p className="preq-notice">Only the owner can change how customers pay. You can see what customers are shown.</p>}
      <fieldset className="preq-fieldset" disabled={!canEdit}>
        <legend>Bank transfer</legend>
        <div className="preq-two">
          <label className="preq-field"><span>Bank</span><input value={form.bankName} onChange={set("bankName")} maxLength={120} placeholder="e.g. RBC Royal Bank" /></label>
          <label className="preq-field"><span>Account name</span><input value={form.accountName} onChange={set("accountName")} maxLength={120} /></label>
        </div>
        <label className="preq-field">
          <span>Last 4 digits of the account number</span>
          <input inputMode="numeric" value={form.accountNumberLast4} onChange={set("accountNumberLast4")} maxLength={4} pattern="[0-9]{4}" placeholder="1234" />
          <small>Only the last four. Never the full number here.</small>
        </label>
        <label className="preq-field">
          <span>Transfer instructions</span>
          <textarea rows={4} value={form.transferInstructions} onChange={set("transferInstructions")} maxLength={1000} placeholder="Branch, transit and account number, and anything else the customer needs" />
          <small>Shown only on a customer&rsquo;s own request page, with their reference to quote. If you want customers to see your full account number, it goes here.</small>
        </label>
      </fieldset>

      <fieldset className="preq-fieldset" disabled={!canEdit}>
        <legend>Cash and Kanoo wallet</legend>
        <label className="preq-field">
          <span>Cash: where and when</span>
          <input value={form.cashNote} onChange={set("cashNote")} maxLength={300} placeholder="e.g. At the front desk, Mon–Fri 4–7 pm" />
        </label>
        <label className="preq-field">
          <span>Kanoo wallet handle or number</span>
          <input value={form.kanooHandleOrPhone} onChange={set("kanooHandleOrPhone")} maxLength={80} placeholder="e.g. 242 555 0123" />
          <small>Shown as text: &ldquo;Send to …&rdquo;. The customer sends it from their own Kanoo app.</small>
        </label>
      </fieldset>

      <fieldset className="preq-fieldset" disabled={!canEdit}>
        <legend>Requests</legend>
        <div className="preq-two">
          <label className="preq-field">
            <span>Reference letters</span>
            <input value={form.referencePrefix} onChange={(e) => setForm({ ...form, referencePrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) })} maxLength={4} />
            <small>Requests read {form.referencePrefix || "FP"}-0042.</small>
          </label>
          <label className="preq-field">
            <span>Days to pay</span>
            <input inputMode="numeric" value={form.defaultDueDays} onChange={(e) => setForm({ ...form, defaultDueDays: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
            <small>The usual due date on a new request.</small>
          </label>
        </div>
      </fieldset>

      {error && <p className="preq-error" role="alert">{error}</p>}
      {saved && <p className="preq-ok" role="status">{saved}</p>}
      {canEdit && <button type="submit" className="preq-btn is-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
    </form>
  );
}
