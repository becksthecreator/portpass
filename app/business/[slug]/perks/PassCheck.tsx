"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { bothPrices, dollars, ELIGIBILITY_REASON, perkChip, perkConditions, type Eligibility, type MemberPerk } from "@/lib/memberPerks";

type Valid = { valid: true; firstName: string; memberNumber: string; ticket: string; perks: Array<{ perk: MemberPerk; eligibility: Eligibility }> };
type Result = Valid | { valid: false };

function toCents(dollarsTyped: string): number | null {
  const value = Number(dollarsTyped);
  return dollarsTyped.trim() && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

// The counter (brief 10, 6.3): staff type the member number and the code
// showing on the customer's phone. Valid shows a first name, the member
// number and which perks apply; recording one is a single tap.
export function PassCheck({ orgId }: { orgId: number }) {
  const router = useRouter();
  const [memberNumber, setMemberNumber] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [price, setPrice] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [recording, setRecording] = useState<number | null>(null);
  const [recorded, setRecorded] = useState<Record<number, string>>({});
  const [recordError, setRecordError] = useState("");

  async function check(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    setRecorded({});
    setRecordError("");
    try {
      const response = await fetch(`/api/business/orgs/${orgId}/perks/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberNumber, code }) });
      const data = (await response.json().catch(() => ({}))) as Result & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not check the pass. Try again.");
      setResult(data);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the pass. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function record(valid: Valid, perk: MemberPerk) {
    setRecording(perk.id);
    setRecordError("");
    try {
      const priceCents = toCents(price);
      const response = await fetch(`/api/business/orgs/${orgId}/perks/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberNumber: valid.memberNumber, ticket: valid.ticket, perkId: perk.id, priceCents, bookingRef }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; redemption?: { discountCents: number | null } };
      if (!response.ok) throw new Error(data.error ?? "Could not record the perk. Try again.");
      const off = data.redemption?.discountCents;
      setRecorded((current) => ({ ...current, [perk.id]: off ? `Recorded: ${dollars(off)} off.` : "Recorded." }));
      router.refresh();
    } catch (e) {
      setRecordError(e instanceof Error ? e.message : "Could not record the perk. Try again.");
    } finally {
      setRecording(null);
    }
  }

  function reset() {
    setResult(null);
    setMemberNumber("");
    setCode("");
    setPrice("");
    setBookingRef("");
    setRecorded({});
    setRecordError("");
  }

  const priceCents = toCents(price);

  return (
    <div className="pass-check">
      <form className="seller-form pass-check-form" onSubmit={check}>
        <label>
          <span>Member number</span>
          <input required value={memberNumber} maxLength={12} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="PP-7K3Q" onChange={(e) => setMemberNumber(e.target.value.toUpperCase())} />
        </label>
        <label>
          <span>Six-digit code</span>
          <input required value={code} maxLength={7} inputMode="numeric" autoComplete="off" placeholder="123 456" onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} />
          <small>From the customer&rsquo;s Member Pass. It changes every 30 seconds, so a screenshot won&rsquo;t work.</small>
        </label>
        {error && <p className="form-error seller-field-wide" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Checking…" : "Check the pass"}</button>
      </form>

      {result && !result.valid && (
        <div className="pass-result pass-result-bad" role="status">
          <strong>✗ Not valid</strong>
          <span>Check the member number, and ask the customer for the code showing now.</span>
        </div>
      )}

      {result && result.valid && (
        <div className="pass-result pass-result-good" role="status">
          <strong>✓ Valid · {result.firstName} · {result.memberNumber}</strong>
          {result.perks.length === 0 && <span>You have no perk running today.</span>}
          {result.perks.length > 0 && (
            <div className="pass-result-fields">
              <label>
                <span>Price before the perk, in dollars (optional)</span>
                <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <label>
                <span>Booking or receipt reference (optional)</span>
                <input maxLength={80} value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
              </label>
            </div>
          )}
          <ul className="pass-result-perks">
            {result.perks.map(({ perk, eligibility }) => {
              const prices = priceCents !== null ? bothPrices(priceCents, perk) : null;
              const belowMinimum = priceCents !== null && perk.minSpendCents !== null && priceCents < perk.minSpendCents;
              return (
                <li key={perk.id}>
                  <span className="perk-chip">{perkChip(perk)}</span>
                  <b>{perk.title}</b>
                  {perkConditions(perk) && <small>{perkConditions(perk)}</small>}
                  {prices && <small className="pass-result-price">{prices}</small>}
                  {!eligibility.eligible ? (
                    <em>{ELIGIBILITY_REASON[eligibility.reason]}</em>
                  ) : recorded[perk.id] ? (
                    <em className="is-done">{recorded[perk.id]} Apply it when you take payment.</em>
                  ) : belowMinimum ? (
                    <em>Below this perk&rsquo;s minimum spend of {dollars(perk.minSpendCents as number)}.</em>
                  ) : (
                    <button className="admin-mini is-primary" type="button" disabled={recording !== null} onClick={() => void record(result, perk)}>{recording === perk.id ? "Recording…" : "Record redemption"}</button>
                  )}
                </li>
              );
            })}
          </ul>
          {recordError && <p className="form-error" role="alert">{recordError}</p>}
          <button className="admin-mini" type="button" onClick={reset}>Check another pass</button>
        </div>
      )}
    </div>
  );
}
