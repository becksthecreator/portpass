"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PaymentSettings } from "@/db/paymentRequests";
import { getPaidProblem, methodLabel, type RequestMethod } from "@/lib/paymentRequests/rules";

const METHODS: RequestMethod[] = ["cash", "bank_transfer", "kanoo_wallet_manual"];
const METHOD_HINT: Record<RequestMethod, string> = {
  cash: "Paid to you in person.",
  bank_transfer: "Customers transfer to your account and quote their reference.",
  kanoo_wallet_manual: "Customers send it from their own Kanoo app to your handle.",
};

// How customers pay this business: the Get paid step (brief 18, E1), in the
// setup wizard and at Payments -> Settings. Pick the methods, then give
// each one its details. Only the last four digits of an account number
// have a field of their own; a business that wants its full number on the
// customer's page writes it into the transfer instructions, which only a
// request's own page shows. Cards aren't a choice: they don't exist yet.
export function PaymentSettingsForm({ apiBase, initial, suggestedPrefix, canEdit, saveLabel = "Save", onSaved }: { apiBase: string; initial: PaymentSettings | null; suggestedPrefix: string; canEdit: boolean; saveLabel?: string; onSaved?: (ready: boolean) => void }) {
  const router = useRouter();
  const [methods, setMethods] = useState<RequestMethod[]>(initial?.acceptedMethods ?? []);
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
  const has = (method: RequestMethod) => methods.includes(method);
  const toggle = (method: RequestMethod, on: boolean) => setMethods(on ? METHODS.filter((m) => m === method || methods.includes(m)) : methods.filter((m) => m !== method));

  async function save(e: FormEvent) {
    e.preventDefault();
    const draft = { ...form, accountNumberLast4: form.accountNumberLast4 || null, acceptedMethods: methods };
    const problem = getPaidProblem(draft);
    if (problem) return setError(methods.length === 0 ? "Pick at least one way customers can pay you." : problem);
    setBusy(true);
    setError("");
    setSaved("");
    const response = await fetch(`${apiBase}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, defaultDueDays: Number(form.defaultDueDays), acceptedMethods: methods }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; howToPayChanged?: boolean };
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not save.");
    setSaved(data.howToPayChanged ? "Saved. Every owner has been emailed that the payment details changed." : "Saved.");
    onSaved?.(true);
    router.refresh();
  }

  return (
    <form className="preq-form" onSubmit={save}>
      {!canEdit && <p className="preq-notice">Only the owner can change how customers pay. You can see what customers are shown.</p>}
      <fieldset className="preq-fieldset" disabled={!canEdit}>
        <legend>How customers pay you</legend>
        <p className="preq-help">Customers pay you directly; PortPass never holds the money. Pick every way you accept.</p>
        <div className="preq-methods">
          {METHODS.map((method) => (
            <label className="preq-method" key={method}>
              <input type="checkbox" checked={has(method)} onChange={(e) => toggle(method, e.target.checked)} />
              <span><b>{methodLabel(method)}</b><small>{METHOD_HINT[method]}</small></span>
            </label>
          ))}
          <label className="preq-method is-disabled">
            <input type="checkbox" disabled />
            <span><b>Card</b><small>Not available yet: coming with a licensed partner.</small></span>
          </label>
        </div>
      </fieldset>

      {has("bank_transfer") && (
        <fieldset className="preq-fieldset" disabled={!canEdit}>
          <legend>Bank transfer</legend>
          <div className="preq-two">
            <label className="preq-field"><span>Bank *</span><input required value={form.bankName} onChange={set("bankName")} maxLength={120} placeholder="e.g. RBC Royal Bank" /></label>
            <label className="preq-field"><span>Account name *</span><input required value={form.accountName} onChange={set("accountName")} maxLength={120} /></label>
          </div>
          <label className="preq-field">
            <span>Last 4 digits of the account number</span>
            <input inputMode="numeric" value={form.accountNumberLast4} onChange={set("accountNumberLast4")} maxLength={4} pattern="[0-9]{4}" placeholder="1234" />
            <small>Only the last four. Never the full number here.</small>
          </label>
          <label className="preq-field">
            <span>Transfer instructions</span>
            <textarea rows={4} value={form.transferInstructions} onChange={set("transferInstructions")} maxLength={1000} placeholder="Branch, transit and account number, and anything else the customer needs" />
            <small>Your own words, shown only on a customer&rsquo;s own request page, with their reference to quote. If you want customers to see your full account number, this is the only place it goes.</small>
          </label>
        </fieldset>
      )}

      {has("cash") && (
        <fieldset className="preq-fieldset" disabled={!canEdit}>
          <legend>Cash</legend>
          <label className="preq-field">
            <span>Where and when (optional)</span>
            <input value={form.cashNote} onChange={set("cashNote")} maxLength={300} placeholder="e.g. At the front desk, Mon–Fri 4–7 pm" />
          </label>
        </fieldset>
      )}

      {has("kanoo_wallet_manual") && (
        <fieldset className="preq-fieldset" disabled={!canEdit}>
          <legend>Kanoo wallet</legend>
          <label className="preq-field">
            <span>Your Kanoo handle or number *</span>
            <input required value={form.kanooHandleOrPhone} onChange={set("kanooHandleOrPhone")} maxLength={80} placeholder="e.g. 242 555 0123" />
            <small>Shown as text: &ldquo;Send to …&rdquo;. The customer sends it from their own Kanoo app.</small>
          </label>
        </fieldset>
      )}

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

      <p className="preq-help">Every change here is logged and emailed to every owner. That&rsquo;s on purpose.</p>
      {error && <p className="preq-error" role="alert">{error}</p>}
      {saved && <p className="preq-ok" role="status">{saved}</p>}
      {canEdit && <button type="submit" className="preq-btn is-primary" disabled={busy}>{busy ? "Saving…" : saveLabel}</button>}
    </form>
  );
}

// "Send yourself a test request" (brief 18, E3): one request to the
// owner's own email, marked TEST, that walks through the customer's page
// and marking it paid. It never counts as money.
export function TestRequest({ apiBase, basePath, ready }: { apiBase: string; basePath: string; ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ id: number; payUrl: string; email: string; emailed: boolean; referenceCode: string } | null>(null);

  async function send() {
    setBusy(true);
    setError("");
    const response = await fetch(`${apiBase}/test-request`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { error?: string; id?: number; payUrl?: string; email?: string; emailed?: boolean; referenceCode?: string };
    setBusy(false);
    if (!response.ok || !data.id || !data.payUrl) return setError(data.error ?? "Could not send the test request.");
    setSent({ id: data.id, payUrl: data.payUrl, email: data.email ?? "", emailed: Boolean(data.emailed), referenceCode: data.referenceCode ?? "" });
  }

  return (
    <section className="preq-card preq-test" aria-labelledby="preq-test-title">
      <h2 id="preq-test-title">See it work once</h2>
      {!sent ? (
        <>
          <p className="preq-help">Send yourself a test request. It goes only to your own email, is marked TEST, and never counts as money.</p>
          {error && <p className="preq-error" role="alert">{error}</p>}
          <button type="button" className="preq-btn" disabled={busy || !ready} onClick={() => void send()}>{busy ? "Sending…" : "Send yourself a test request"}</button>
          {!ready && <p className="preq-help">Save how you get paid first.</p>}
        </>
      ) : (
        <ol className="preq-test-steps">
          <li><b>{sent.emailed ? `We emailed ${sent.referenceCode} to ${sent.email}.` : `${sent.referenceCode} is ready.`}</b> Open it as your customer would: <a className="preq-link" href={sent.payUrl} target="_blank" rel="noopener noreferrer">the customer&rsquo;s page ↗</a></li>
          <li>Then <a className="preq-link" href={`${basePath}/${sent.id}`}>open the request</a> and press <b>Mark paid</b>. That is the whole loop.</li>
        </ol>
      )}
    </section>
  );
}
