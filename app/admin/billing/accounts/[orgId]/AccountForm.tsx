"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { annualPriceCents, BILLING_CYCLES, CYCLE_LABEL, firstInvoiceOn, freeUntil, isSubscription, longDay, money, type BillingCycle } from "@/lib/billing";

export type AccountDraft = {
  planCode: string;
  cycle: BillingCycle;
  price: string;
  annualMonthsCharged: string;
  retainer: string;
  extraLocations: string;
  extraLocationPrice: string;
  commissionPercent: string;
  goLiveOn: string;
  freeMonthsCredit: string;
  creditReason: string;
  freeUntilOverride: string;
  freeUntilOverrideReason: string;
  setupFee: string;
  setupStatus: "due" | "paid" | "waived";
  agreementSignedOn: string;
  agreementVersion: string;
  billingEmail: string;
  billingWhatsapp: string;
  paused: boolean;
  ended: boolean;
  statusReason: string;
  notes: string;
};

type Plan = { code: string; name: string; monthlyCents: number; commissionBps: number; annualMonthsCharged: number };

// "65", "$1,200.50" as cents; anything else is refused.
function cents(value: string): number | null {
  const typed = value.replace(/[$,\s]/g, "");
  if (!typed) return 0;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(typed)) return null;
  return Math.round(Number(typed) * 100);
}
const whole = (value: string): number | null => (value.trim() === "" ? 0 : /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : null);

// One business's billing account (brief 09, 2.1 and 2.4). The price here
// is the price agreed at signing: changing the price list later never
// changes it. A free-month credit, a free-until date of your own, and
// pausing or ending each need a reason, which is logged.
export function AccountForm({ organizationId, organizationName, initial, plans, isNew }: { organizationId: number; organizationName: string; initial: AccountDraft; plans: Plan[]; isNew: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const set = <K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  function choosePlan(code: string) {
    const plan = plans.find((p) => p.code === code);
    setDraft((current) => ({
      ...current,
      planCode: code,
      // The list price is offered as a starting point; what is saved is this account's own.
      ...(plan ? { price: (plan.monthlyCents / 100).toFixed(2).replace(/\.00$/, ""), commissionPercent: String(plan.commissionBps / 100), annualMonthsCharged: String(plan.annualMonthsCharged) } : {}),
    }));
  }

  const priceCents = cents(draft.price) ?? 0;
  const preview = { goLiveOn: draft.goLiveOn || null, freeMonthsCredit: whole(draft.freeMonthsCredit) ?? 0, freeUntilOverride: draft.freeUntilOverride || null };
  const free = freeUntil(preview);
  const first = firstInvoiceOn(preview);
  const months = whole(draft.annualMonthsCharged) || 10;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    const price = cents(draft.price);
    const retainer = cents(draft.retainer);
    const extraLocationCents = cents(draft.extraLocationPrice);
    const setupFee = cents(draft.setupFee);
    const commission = draft.commissionPercent.trim() === "" ? 0 : Number(draft.commissionPercent);
    if (price === null || retainer === null || extraLocationCents === null || setupFee === null) return setError("Amounts are in dollars, like 65 or 1,200.50.");
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) return setError("The commission is a percentage between 0 and 100.");
    setBusy(true);
    const response = await fetch(`/api/admin/billing/accounts/${organizationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planCode: draft.planCode, cycle: draft.cycle, priceCents: price, annualMonthsCharged: whole(draft.annualMonthsCharged) || 10, retainerCents: retainer, extraLocations: whole(draft.extraLocations) ?? 0, extraLocationCents,
        commissionBps: Math.round(commission * 100), goLiveOn: draft.goLiveOn, freeMonthsCredit: whole(draft.freeMonthsCredit) ?? 0, creditReason: draft.creditReason, freeUntilOverride: draft.freeUntilOverride,
        freeUntilOverrideReason: draft.freeUntilOverrideReason, setupFeeCents: setupFee, setupStatus: draft.setupStatus, agreementSignedOn: draft.agreementSignedOn, agreementVersion: draft.agreementVersion,
        billingEmail: draft.billingEmail, billingWhatsappE164: draft.billingWhatsapp, paused: draft.paused, ended: draft.ended, statusReason: draft.statusReason, notes: draft.notes,
      }),
    }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok) return setError(data.error ?? "Could not finish saving. Reload to see what is stored.");
    setDone("Saved.");
    router.refresh();
  }

  return (
    <form className="billing-form" onSubmit={save}>
      <fieldset>
        <legend>Plan</legend>
        <div className="billing-pair">
          <label><span>Plan</span>
            <select value={draft.planCode} onChange={(event) => choosePlan(event.target.value)}>
              <option value="">Not chosen</option>
              {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
            </select>
          </label>
          <label><span>How they pay</span>
            <select value={draft.cycle} onChange={(event) => set("cycle", event.target.value as BillingCycle)}>
              {BILLING_CYCLES.map((cycle) => <option key={cycle} value={cycle}>{CYCLE_LABEL[cycle]}</option>)}
            </select>
          </label>
        </div>
        <div className="billing-pair">
          <label><span>Price a month, in dollars (the price agreed at signing)</span><input value={draft.price} onChange={(event) => set("price", event.target.value)} inputMode="decimal" maxLength={12} /></label>
          <label><span>Months charged for a year, on annual</span><input value={draft.annualMonthsCharged} onChange={(event) => set("annualMonthsCharged", event.target.value)} inputMode="numeric" maxLength={2} /></label>
        </div>
        <div className="billing-pair">
          <label><span>Commission on bookings PortPass brings, %</span><input value={draft.commissionPercent} onChange={(event) => set("commissionPercent", event.target.value)} inputMode="decimal" maxLength={5} /></label>
          <label><span>Management retainer a month, in dollars</span><input value={draft.retainer} onChange={(event) => set("retainer", event.target.value)} inputMode="decimal" maxLength={12} /></label>
        </div>
        <div className="billing-pair">
          <label><span>Extra locations</span><input value={draft.extraLocations} onChange={(event) => set("extraLocations", event.target.value)} inputMode="numeric" maxLength={3} /></label>
          <label><span>Each extra location a month, in dollars</span><input value={draft.extraLocationPrice} onChange={(event) => set("extraLocationPrice", event.target.value)} inputMode="decimal" maxLength={12} /></label>
        </div>
        <div className="billing-pair">
          <label><span>Setup fee, in dollars</span><input value={draft.setupFee} onChange={(event) => set("setupFee", event.target.value)} inputMode="decimal" maxLength={12} /></label>
          <label><span>Setup fee is</span>
            <select value={draft.setupStatus} onChange={(event) => set("setupStatus", event.target.value as AccountDraft["setupStatus"])}>
              <option value="waived">Waived</option>
              <option value="due">Due (goes on the first invoice)</option>
              <option value="paid">Paid</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Free period</legend>
        <label><span>Went live on</span><input type="date" value={draft.goLiveOn} onChange={(event) => set("goLiveOn", event.target.value)} /></label>
        <div className="billing-pair">
          <label><span>Free months given on top of the first 30 days</span><input value={draft.freeMonthsCredit} onChange={(event) => set("freeMonthsCredit", event.target.value)} inputMode="numeric" maxLength={2} /></label>
          <label><span>Why (for example: signage sponsor, banner)</span><input value={draft.creditReason} onChange={(event) => set("creditReason", event.target.value)} maxLength={200} /></label>
        </div>
        <div className="billing-pair">
          <label><span>Or set the last free day yourself</span><input type="date" value={draft.freeUntilOverride} onChange={(event) => set("freeUntilOverride", event.target.value)} /></label>
          <label><span>Why</span><input value={draft.freeUntilOverrideReason} onChange={(event) => set("freeUntilOverrideReason", event.target.value)} maxLength={200} /></label>
        </div>
        <p className="billing-works-out">
          {free ? <>Free until <strong>{longDay(free)}</strong>. </> : "No go-live date yet, so nothing is billed. "}
          {isSubscription(draft.cycle) && first ? <>First invoice on <strong>{longDay(first)}</strong>: <strong>{money(draft.cycle === "annual" ? annualPriceCents({ priceCents, annualMonthsCharged: months }) : priceCents)}</strong>{draft.cycle === "annual" ? " for the year, setup waived" : " a month"}.</> : null}
          {draft.cycle === "commission_monthly" || draft.cycle === "per_event" ? " Fees are invoiced on the 1st of each month, for the month before." : null}
          {draft.cycle === "not_agreed" ? " No plan is agreed yet, so no invoice is drafted and no reminder is sent." : null}
        </p>
      </fieldset>

      <fieldset>
        <legend>Agreement and who to bill</legend>
        <div className="billing-pair">
          <label><span>Agreement signed on</span><input type="date" value={draft.agreementSignedOn} onChange={(event) => set("agreementSignedOn", event.target.value)} /></label>
          <label><span>Agreement version</span><input value={draft.agreementVersion} onChange={(event) => set("agreementVersion", event.target.value)} maxLength={40} /></label>
        </div>
        <div className="billing-pair">
          <label><span>Billing email (invoices and reminders go here)</span><input type="email" value={draft.billingEmail} onChange={(event) => set("billingEmail", event.target.value)} maxLength={254} autoCapitalize="none" /></label>
          <label><span>Billing WhatsApp number</span><input value={draft.billingWhatsapp} onChange={(event) => set("billingWhatsapp", event.target.value)} inputMode="tel" maxLength={30} placeholder="242 555 0100" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Pause or end</legend>
        <label className="billing-check"><input type="checkbox" checked={draft.paused} onChange={(event) => set("paused", event.target.checked)} /><span>Paused: no invoices and no reminders</span></label>
        <label className="billing-check"><input type="checkbox" checked={draft.ended} onChange={(event) => set("ended", event.target.checked)} /><span>Ended</span></label>
        <label><span>Why (needed to pause or end; it is logged)</span><input value={draft.statusReason} onChange={(event) => set("statusReason", event.target.value)} maxLength={300} /></label>
        <label><span>Notes</span><textarea rows={3} value={draft.notes} onChange={(event) => set("notes", event.target.value)} maxLength={1000} /></label>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="admin-row-done" role="status">{done}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-action is-primary" disabled={busy}>{busy ? "Saving…" : isNew ? `Set up billing for ${organizationName}` : "Save"}</button>
      </div>
    </form>
  );
}
