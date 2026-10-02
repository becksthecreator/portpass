"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EVENT_KIND_LABEL, type BillingEventKind } from "@/lib/billing";

const KINDS: BillingEventKind[] = ["wedding_coordination", "supplier_commission", "marketplace_commission"];

// Add a fee by hand: a wedding completed before the Desk tracked it, or a
// supplier booking. Or a credit, for a fee that was invoiced and should
// not have been: it comes off the business's next invoice.
export function AddFee({ businesses, today }: { businesses: Array<{ id: number; name: string }>; today: string }) {
  const router = useRouter();
  // No business is chosen for you: a fee on the wrong business is a wrong invoice.
  const [organizationId, setOrganizationId] = useState(0);
  const [kind, setKind] = useState<BillingEventKind>("wedding_coordination");
  const [eventOn, setEventOn] = useState(today);
  const [flat, setFlat] = useState("150");
  const [value, setValue] = useState("");
  const [percent, setPercent] = useState("");
  const [credit, setCredit] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const cents = (text: string): number | null => {
    const typed = text.replace(/[$,\s]/g, "");
    if (!typed) return 0;
    return /^\d{1,7}(\.\d{1,2})?$/.test(typed) ? Math.round(Number(typed) * 100) : null;
  };

  // The coordination fee is a flat $150; a commission is a share of a booking.
  function chooseKind(next: BillingEventKind) {
    setKind(next);
    setFlat(next === "wedding_coordination" ? "150" : "");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    const flatCents = cents(flat);
    const bookingValueCents = cents(value);
    const rate = percent.trim() === "" ? 0 : Number(percent);
    if (flatCents === null || bookingValueCents === null) return setError("Amounts are in dollars, like 150 or 1,200.50.");
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return setError("The rate is a percentage between 0 and 100.");
    if (flatCents > 0 && bookingValueCents > 0 && rate > 0) return setError("Enter a flat fee, or a booking value and PortPass's share: not both.");
    setBusy(true);
    const response = await fetch("/api/admin/billing/fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, kind, eventOn, flatCents, bookingValueCents, rateBps: Math.round(rate * 100), note, credit }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; willInvoice?: boolean }) : {};
    setBusy(false);
    if (!response || !response.ok) return setError(data.error ?? "Could not add the fee.");
    setDone(data.willInvoice ? `Added. It ${credit ? "comes off" : "goes on"} the invoice drafted on the 1st of next month.` : "Added, but nothing will invoice it yet: this business has no billing account with an agreed plan (or its account is paused or ended). Set that up under Billing.");
    setNote("");
    router.refresh();
  }

  return (
    <form className="billing-form" onSubmit={save}>
      <fieldset>
        <legend>Add a fee by hand</legend>
        <div className="billing-pair">
          <label><span>Business</span>
            <select value={organizationId} onChange={(event) => setOrganizationId(Number(event.target.value))} required>
              <option value={0} disabled>Choose a business</option>
              {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
            </select>
          </label>
          <label><span>Kind of fee</span>
            <select value={kind} onChange={(event) => chooseKind(event.target.value as BillingEventKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <div className="billing-pair">
          <label><span>Date of the wedding or booking</span><input type="date" value={eventOn} max={today} onChange={(event) => setEventOn(event.target.value)} required /></label>
          <label><span>Flat fee, in dollars</span><input value={flat} onChange={(event) => setFlat(event.target.value)} inputMode="decimal" maxLength={12} /></label>
        </div>
        <div className="billing-pair">
          <label><span>Or instead: booking value, in dollars</span><input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" maxLength={12} /></label>
          <label><span>and PortPass&rsquo;s share, %</span><input value={percent} onChange={(event) => setPercent(event.target.value)} inputMode="decimal" maxLength={5} /></label>
        </div>
        <label className="billing-check"><input type="checkbox" checked={credit} onChange={(event) => setCredit(event.target.checked)} /><span>This is a credit: it comes off the next invoice (for a fee that was invoiced and then refunded or charged by mistake)</span></label>
        <label><span>What it is for (printed on the invoice; no customer names)</span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={190} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {done && <p className="admin-row-done" role="status">{done}</p>}
        <div className="admin-form-actions"><button type="submit" className="admin-action is-primary" disabled={busy || !organizationId}>{busy ? "Saving…" : credit ? "Add the credit" : "Add the fee"}</button></div>
      </fieldset>
    </form>
  );
}

// Take off a fee that is not on an invoice yet. The reason is logged.
export function RemoveFee({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    const reason = prompt("Remove this fee? Say why (it is logged).");
    if (!reason || !reason.trim()) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/billing/fees", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, reason }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok) return setError(data.error ?? "Could not remove the fee.");
    router.refresh();
  }

  return (
    <>
      <button type="button" className="admin-mini" disabled={busy} onClick={remove}>{busy ? "Removing…" : "Remove"}</button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
