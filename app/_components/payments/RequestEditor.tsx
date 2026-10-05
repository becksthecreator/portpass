"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  formatDay,
  linesTotal,
  methodLabel,
  money,
  parseDollars,
  REQUEST_METHODS,
  type HowToPay,
  type LineItem,
  type RequestMethod,
} from "@/lib/paymentRequests/rules";

export type EditorInitial = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  lines: LineItem[];
  dueDate: string;
  methods: RequestMethod[];
  allowPartPayment: boolean;
  offeringId: number | null;
  link: { registrationId?: number; privateSessionRequestId?: number; reservationId?: number; bookingRequestId?: number };
};

type DraftLine = { key: number; label: string; qty: string; price: string };
type Match = { name: string; email: string | null; phone: string | null; source: string };

const toDraft = (lines: LineItem[]): DraftLine[] =>
  lines.map((l, i) => ({ key: i + 1, label: l.label, qty: String(l.qty), price: l.unitCents > 0 ? (l.unitCents / 100).toFixed(2) : "" }));

const METHOD_HINT: Record<RequestMethod, string> = {
  bank_transfer: "Add your bank details in Settings to offer this.",
  cash: "",
  kanoo_wallet_manual: "Add your Kanoo wallet handle or number in Settings to offer this.",
};

// New request (and Change): pick a customer, add lines, set the due date
// and the methods, preview, then create. Creating never sends anything:
// the next screen has the send buttons.
export function RequestEditor({
  mode,
  requestId,
  existingDueDate,
  apiBase,
  basePath,
  businessName,
  initial,
  methodsAvailable,
  offerings,
  today,
  howToPay,
}: {
  mode: "new" | "edit";
  requestId?: number;
  existingDueDate?: string;
  apiBase: string;
  basePath: string;
  businessName: string;
  initial: EditorInitial;
  methodsAvailable: RequestMethod[];
  offerings: { id: number; name: string; priceCents: number }[];
  today: string;
  howToPay: HowToPay | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.customerName);
  const [email, setEmail] = useState(initial.customerEmail);
  const [phone, setPhone] = useState(initial.customerPhone);
  const [lines, setLines] = useState<DraftLine[]>(toDraft(initial.lines));
  const [nextKey, setNextKey] = useState(initial.lines.length + 1);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [methods, setMethods] = useState<RequestMethod[]>(initial.methods.filter((m) => methodsAvailable.includes(m)));
  const [allowPart, setAllowPart] = useState(initial.allowPartPayment);
  const [offeringId, setOfferingId] = useState<number | null>(initial.offeringId);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);

  // Existing customers, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${apiBase}/customers?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (response.ok) setMatches(((await response.json()) as { customers: Match[] }).customers);
      } catch {
        // Typing on: an aborted search is expected.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, apiBase]);

  const parsed = useMemo(
    () => lines.map((l) => ({ label: l.label.trim(), qty: Number(l.qty), unitCents: parseDollars(l.price) })),
    [lines],
  );
  const linesOk = parsed.length > 0 && parsed.every((l) => l.label && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 999 && l.unitCents !== null);
  const total = linesOk ? linesTotal(parsed as LineItem[]) : 0;

  function updateLine(key: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine(label = "", priceCents = 0) {
    setLines((current) => {
      // Fill an empty first line rather than leaving it behind.
      if (current.length === 1 && !current[0].label && !current[0].price) {
        return [{ key: current[0].key, label, qty: "1", price: priceCents ? (priceCents / 100).toFixed(2) : "" }];
      }
      return [...current, { key: nextKey, label, qty: "1", price: priceCents ? (priceCents / 100).toFixed(2) : "" }];
    });
    setNextKey((k) => k + 1);
  }

  function pickOffering(value: string) {
    const offering = offerings.find((o) => String(o.id) === value);
    if (!offering) return;
    addLine(offering.name, offering.priceCents);
    if (offeringId === null) setOfferingId(offering.id);
  }

  function pickCustomer(match: Match) {
    setName(match.name);
    setEmail(match.email ?? "");
    setPhone(match.phone ?? "");
    setQuery("");
    setMatches([]);
  }

  function toggleMethod(method: RequestMethod, on: boolean) {
    setMethods((current) => (on ? [...new Set([...current, method])] : current.filter((m) => m !== method)));
  }

  function preview() {
    setError("");
    if (!name.trim()) return setError("Add the customer's name.");
    if (!email.trim() && !phone.trim()) return setError("Add the customer's phone or email, so the request can reach them.");
    if (!linesOk) return setError("Every line needs what it's for, a quantity and a price.");
    if (total <= 0) return setError("The total has to be more than $0.");
    if (!dueDate) return setError("Pick a due date.");
    if (methods.length === 0) return setError("Pick at least one way the customer can pay.");
    setStep("preview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setBusy(true);
    setError("");
    const body = {
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      lines: parsed,
      dueDate,
      methods,
      allowPartPayment: allowPart,
      offeringId,
      ...initial.link,
    };
    const response = await fetch(mode === "new" ? `${apiBase}/requests` : `${apiBase}/requests/${requestId}`, {
      method: mode === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { id?: number; error?: string };
    if (!response.ok || !data.id) {
      setBusy(false);
      setStep("form");
      setError(data.error ?? "Could not save the request.");
      return;
    }
    router.push(`${basePath}/${data.id}${mode === "new" ? "?created=1" : ""}`);
    router.refresh();
  }

  if (step === "preview") {
    const lineItems = parsed as LineItem[];
    return (
      <section className="preq-card" aria-labelledby="preq-preview-title">
        <div className="preq-card-head">
          <h2 id="preq-preview-title">Preview</h2>
          <span className="preq-pill">{mode === "new" ? "Not sent yet" : "Unsaved changes"}</span>
        </div>
        <dl className="preq-meta">
          <div><dt>To</dt><dd>{name}</dd></div>
          {phone && <div><dt>Phone</dt><dd>{phone}</dd></div>}
          {email && <div><dt>Email</dt><dd>{email}</dd></div>}
          <div><dt>Due</dt><dd>{formatDay(dueDate, today)}</dd></div>
          <div><dt>They can pay by</dt><dd>{methods.map(methodLabel).join(", ")}</dd></div>
          <div><dt>Part payments</dt><dd>{allowPart ? "Allowed" : "Full amount only"}</dd></div>
        </dl>
        <table className="preq-items">
          <thead><tr><th scope="col">For</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {lineItems.map((l, i) => (
              <tr key={i}><td>{l.qty > 1 ? `${l.qty} × ${l.label}` : l.label}</td><td>{money(l.qty * l.unitCents)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row">Total</th><td><strong>{money(total)}</strong></td></tr></tfoot>
        </table>
        <p className="preq-notice">
          The customer&rsquo;s page shows this, how to pay you{howToPay?.bankName ? ` (${howToPay.bankName})` : ""}, and: &ldquo;Pay {businessName} directly. PortPass never holds your money.&rdquo;
        </p>
        {error && <p className="preq-error" role="alert">{error}</p>}
        <div className="preq-btns">
          <button type="button" className="preq-btn is-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : mode === "new" ? "Create request" : "Save changes"}</button>
          <button type="button" className="preq-btn" onClick={() => setStep("form")} disabled={busy}>Edit</button>
        </div>
        {mode === "new" && <p className="preq-last">Creating it sends nothing. You choose WhatsApp, email or a link on the next screen.</p>}
      </section>
    );
  }

  return (
    <form className="preq-form" onSubmit={(e) => { e.preventDefault(); preview(); }} noValidate>
      <fieldset className="preq-fieldset">
        <legend>Customer</legend>
        <label className="preq-field">
          <span>Find an existing customer</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone or email" autoComplete="off" />
        </label>
        {matches.length > 0 && (
          <ul className="preq-matches" aria-label="Matching customers">
            {matches.map((m, i) => (
              <li key={i}>
                <button type="button" onClick={() => pickCustomer(m)}>
                  <strong>{m.name}</strong>
                  <span>{[m.phone, m.email].filter(Boolean).join(" · ")} · {m.source}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="preq-field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} required />
        </label>
        <div className="preq-two">
          <label className="preq-field">
            <span>WhatsApp / phone</span>
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="242 555 0123" autoComplete="off" />
          </label>
          <label className="preq-field">
            <span>Email</span>
            <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <small className="preq-last">A phone number or an email, or both.</small>
      </fieldset>

      <fieldset className="preq-fieldset">
        <legend>What it&rsquo;s for</legend>
        <ul className="preq-lines">
          {lines.map((line, index) => (
            <li key={line.key} className="preq-line">
              <label className="preq-field">
                <span>Line {index + 1}</span>
                <input value={line.label} onChange={(e) => updateLine(line.key, { label: e.target.value })} placeholder="e.g. Term 2 fee" maxLength={160} />
              </label>
              <label className="preq-field">
                <span>Qty</span>
                <input inputMode="numeric" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
              </label>
              <label className="preq-field">
                <span>Price ($)</span>
                <input inputMode="decimal" value={line.price} onChange={(e) => updateLine(line.key, { price: e.target.value })} placeholder="0.00" />
              </label>
              <button type="button" className="preq-line-remove" onClick={() => setLines((current) => (current.length > 1 ? current.filter((l) => l.key !== line.key) : current))} disabled={lines.length === 1} aria-label={`Remove line ${index + 1}`}>×</button>
            </li>
          ))}
        </ul>
        <div className="preq-btns">
          <button type="button" className="preq-btn is-small" onClick={() => addLine()} disabled={lines.length >= 20}>Add a line</button>
          {offerings.length > 0 && (
            <label className="preq-field">
              <span className="sr-only">Add from your offerings</span>
              <select value="" onChange={(e) => pickOffering(e.target.value)} aria-label="Add from your offerings">
                <option value="">Add from your offerings…</option>
                {offerings.map((o) => <option key={o.id} value={o.id}>{o.name} · {money(o.priceCents)}</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="preq-line-total"><span>Total</span><span>{money(total)}</span></p>
      </fieldset>

      <fieldset className="preq-fieldset">
        <legend>When and how</legend>
        <label className="preq-field">
          <span>Due date</span>
          <input type="date" value={dueDate} min={mode === "edit" && existingDueDate && existingDueDate < today ? existingDueDate : today} max={addDays(today, 366)} onChange={(e) => setDueDate(e.target.value)} required />
        </label>
        <div className="preq-field" role="group" aria-labelledby="preq-methods-label">
          <span id="preq-methods-label">They can pay by</span>
          {REQUEST_METHODS.map((method) => {
            const available = methodsAvailable.includes(method);
            return (
              <label key={method} className="preq-check">
                <input type="checkbox" checked={methods.includes(method)} disabled={!available} onChange={(e) => toggleMethod(method, e.target.checked)} />
                <span>{methodLabel(method)}{!available && METHOD_HINT[method] && <small>{METHOD_HINT[method]}</small>}</span>
              </label>
            );
          })}
        </div>
        <label className="preq-check">
          <input type="checkbox" checked={allowPart} onChange={(e) => setAllowPart(e.target.checked)} />
          <span>Allow part payments<small>The customer can pay some now and the rest later.</small></span>
        </label>
      </fieldset>

      {error && <p className="preq-error" role="alert">{error}</p>}
      <button type="submit" className="preq-btn is-primary">Preview</button>
    </form>
  );
}
