"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Line = { description: string; amount: string };

// A founder's own invoice. Tick "billed before this system" for something
// like a build fee already invoiced by hand: it keeps its own number and
// never uses a PP- number.
export function NewInvoiceForm({ businesses, today }: { businesses: Array<{ id: number; name: string }>; today: string }) {
  const router = useRouter();
  // No business is chosen for you: an invoice to the wrong business is a wrong invoice.
  const [organizationId, setOrganizationId] = useState(0);
  const [issuedOn, setIssuedOn] = useState(today);
  const [historical, setHistorical] = useState(false);
  const [number, setNumber] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const filled = lines.filter((line) => line.description.trim() || line.amount.trim());
    const parsed = filled.map((line) => {
      const typed = line.amount.replace(/[$,\s]/g, "");
      return { description: line.description.trim(), amountCents: /^-?\d{1,7}(\.\d{1,2})?$/.test(typed) ? Math.round(Number(typed) * 100) : Number.NaN };
    });
    if (!parsed.length || parsed.some((line) => !line.description || !Number.isInteger(line.amountCents))) return setError("Each line needs a description and an amount in dollars.");
    if (historical && !number.trim()) return setError("Enter the number the old invoice had.");
    setBusy(true);
    const response = await fetch("/api/admin/billing/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, issuedOn, lines: parsed, historicalNumber: historical ? number : null }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { id?: number; error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok || !data.id) return setError(data.error ?? "Could not raise the invoice.");
    router.push(`/admin/billing/invoices/${data.id}`);
  }

  return (
    <form className="billing-form" onSubmit={save}>
      <fieldset>
        <legend>Invoice</legend>
        <div className="billing-pair">
          <label><span>Business</span>
            <select value={organizationId} onChange={(event) => setOrganizationId(Number(event.target.value))} required>
              <option value={0} disabled>Choose a business</option>
              {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
            </select>
          </label>
          {historical ? <label><span>The date the old invoice had</span><input type="date" value={issuedOn} max={today} onChange={(event) => setIssuedOn(event.target.value)} required /></label> : <p className="admin-form-note">It is dated the day you send it, and due 14 days after.</p>}
        </div>
        <label className="billing-check"><input type="checkbox" checked={historical} onChange={(event) => setHistorical(event.target.checked)} /><span>This was billed before this system (it keeps its own number)</span></label>
        {historical && <label><span>The number it had (for example BWS-BUILD)</span><input value={number} onChange={(event) => setNumber(event.target.value)} maxLength={30} autoCapitalize="characters" /></label>}
      </fieldset>
      <fieldset>
        <legend>Lines</legend>
        {lines.map((line, index) => (
          <div className="billing-line-row" key={index}>
            <label><span>What it is for</span><input value={line.description} onChange={(event) => setLine(index, { description: event.target.value })} maxLength={300} /></label>
            <label><span>Amount, in dollars</span><input value={line.amount} onChange={(event) => setLine(index, { amount: event.target.value })} inputMode="decimal" maxLength={12} /></label>
          </div>
        ))}
        {lines.length < 20 && <div className="admin-form-actions"><button type="button" className="admin-action" onClick={() => setLines((current) => [...current, { description: "", amount: "" }])}>Add a line</button></div>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-action is-primary" disabled={busy || !organizationId}>{busy ? "Saving…" : historical ? "Record the old invoice" : "Make the draft"}</button>
      </div>
    </form>
  );
}
