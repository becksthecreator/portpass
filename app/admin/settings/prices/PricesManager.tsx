"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dollars, percentFromBps, UNIT_LABEL, type PricingAddon, type PricingPlan } from "@/lib/pricingFormat";

// Edit plans and add-ons in place. Money is typed in dollars and sent as
// whole cents; the API validates, audit-logs before/after and revalidates.
type PlanDraft = { name: string; monthly: string; annualMonths: string; commissionPct: string; blurb: string; badge: string; features: string; isPublic: boolean; active: boolean };
type AddonDraft = { name: string; amount: string; note: string; isPublic: boolean; status: PricingAddon["status"] };

function planDraft(p: PricingPlan): PlanDraft {
  return { name: p.name, monthly: (p.monthlyCents / 100).toFixed(2), annualMonths: String(p.annualMonthsCharged), commissionPct: (p.commissionBps / 100).toString(), blurb: p.blurb ?? "", badge: p.badge ?? "", features: p.features.join("\n"), isPublic: p.isPublic, active: p.active };
}
function addonDraft(a: PricingAddon): AddonDraft {
  return { name: a.name, amount: (a.amountCents / 100).toFixed(2), note: a.note ?? "", isPublic: a.isPublic, status: a.status };
}
function toCents(dollarsText: string): number | null {
  const n = Number(dollarsText.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function PricesManager({ plans, addons }: { plans: PricingPlan[]; addons: PricingAddon[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>(() => Object.fromEntries(plans.map((p) => [p.code, planDraft(p)])));
  const [addonDrafts, setAddonDrafts] = useState<Record<string, AddonDraft>>(() => Object.fromEntries(addons.map((a) => [a.code, addonDraft(a)])));

  async function send(target: "plan" | "addon", code: string, patch: Record<string, unknown>) {
    setBusy(code);
    setError("");
    setSaved("");
    try {
      const r = await fetch("/api/admin/pricing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, code, patch }) });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "That didn't save.");
      setSaved(code);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  function savePlan(plan: PricingPlan) {
    const d = planDrafts[plan.code];
    const monthlyCents = toCents(d.monthly);
    const annualMonthsCharged = Number(d.annualMonths);
    const commissionBps = Math.round(Number(d.commissionPct) * 100);
    if (monthlyCents === null) return setError(`${plan.name}: the monthly price must be a dollar amount.`);
    if (!Number.isFinite(commissionBps) || commissionBps < 0) return setError(`${plan.name}: commission must be a percentage.`);
    const patch: Record<string, unknown> = {};
    if (d.name !== plan.name) patch.name = d.name;
    if (monthlyCents !== plan.monthlyCents) patch.monthlyCents = monthlyCents;
    if (annualMonthsCharged !== plan.annualMonthsCharged) patch.annualMonthsCharged = annualMonthsCharged;
    if (commissionBps !== plan.commissionBps) patch.commissionBps = commissionBps;
    if ((d.blurb || null) !== plan.blurb) patch.blurb = d.blurb || null;
    if ((d.badge || null) !== plan.badge) patch.badge = d.badge || null;
    const features = d.features.split("\n").map((f) => f.trim()).filter(Boolean);
    if (features.join("\n") !== plan.features.join("\n")) patch.features = features;
    if (d.isPublic !== plan.isPublic) patch.isPublic = d.isPublic;
    if (d.active !== plan.active) patch.active = d.active;
    if (!Object.keys(patch).length) return setError(`${plan.name}: nothing changed.`);
    void send("plan", plan.code, patch);
  }

  function saveAddon(addon: PricingAddon) {
    const d = addonDrafts[addon.code];
    const amountCents = toCents(d.amount);
    if (amountCents === null) return setError(`${addon.name}: the amount must be a dollar amount.`);
    const patch: Record<string, unknown> = {};
    if (d.name !== addon.name) patch.name = d.name;
    if (amountCents !== addon.amountCents) patch.amountCents = amountCents;
    if ((d.note || null) !== addon.note) patch.note = d.note || null;
    if (d.isPublic !== addon.isPublic) patch.isPublic = d.isPublic;
    if (d.status !== addon.status) patch.status = d.status;
    if (!Object.keys(patch).length) return setError(`${addon.name}: nothing changed.`);
    void send("addon", addon.code, patch);
  }

  const setPlan = (code: string, patch: Partial<PlanDraft>) => setPlanDrafts((s) => ({ ...s, [code]: { ...s[code], ...patch } }));
  const setAddon = (code: string, patch: Partial<AddonDraft>) => setAddonDrafts((s) => ({ ...s, [code]: { ...s[code], ...patch } }));

  const promote = addons.filter((a) => a.group === "promote");
  const plain = addons.filter((a) => a.group !== "promote");

  return (
    <div className="admin-prices">
      <p className="admin-prices-warning" role="note">Existing clients keep their price until you give 30 days&rsquo; written notice (agreement §5.4).</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && !error && <p className="admin-prices-saved" role="status">Saved. The site shows the new price on its next request.</p>}

      <h2 className="admin-prices-h2">Plans</h2>
      {plans.map((plan) => {
        const d = planDrafts[plan.code];
        return (
          <article key={plan.code} className={`admin-price-card${plan.active ? "" : " is-inactive"}`}>
            <header className="admin-price-head">
              <strong>{plan.name}</strong>
              <span className="admin-pill">{plan.kind.replace("_", " ")}</span>
              <small>{plan.code} · now {plan.kind === "commission" ? `${percentFromBps(plan.commissionBps)} of bookings` : `${dollars(plan.monthlyCents)}/month`}{plan.isPublic ? "" : " · private"}{plan.active ? "" : " · inactive"}</small>
            </header>
            <div className="admin-price-grid">
              <label>Name<input className="admin-inline-input" value={d.name} maxLength={40} onChange={(e) => setPlan(plan.code, { name: e.target.value })} /></label>
              <label>Monthly ($)<input className="admin-inline-input" inputMode="decimal" value={d.monthly} onChange={(e) => setPlan(plan.code, { monthly: e.target.value })} /></label>
              <label>Months charged per year<input className="admin-inline-input" type="number" min={1} max={12} value={d.annualMonths} onChange={(e) => setPlan(plan.code, { annualMonths: e.target.value })} /></label>
              <label>Commission (%)<input className="admin-inline-input" inputMode="decimal" value={d.commissionPct} onChange={(e) => setPlan(plan.code, { commissionPct: e.target.value })} /></label>
              <label>Badge<input className="admin-inline-input" value={d.badge} maxLength={30} placeholder="e.g. Most popular" onChange={(e) => setPlan(plan.code, { badge: e.target.value })} /></label>
              <label>Blurb<input className="admin-inline-input" value={d.blurb} maxLength={120} onChange={(e) => setPlan(plan.code, { blurb: e.target.value })} /></label>
              <label className="admin-price-wide">Features (one per line; plans are cumulative)<textarea className="admin-inline-input" rows={5} value={d.features} onChange={(e) => setPlan(plan.code, { features: e.target.value })} /></label>
              <label className="admin-price-check"><input type="checkbox" checked={d.isPublic} onChange={(e) => setPlan(plan.code, { isPublic: e.target.checked })} /> Shown on /pricing</label>
              <label className="admin-price-check"><input type="checkbox" checked={d.active} onChange={(e) => setPlan(plan.code, { active: e.target.checked })} /> Active</label>
            </div>
            <div className="admin-price-actions">
              <button className="admin-mini is-primary" type="button" disabled={busy !== null} onClick={() => savePlan(plan)}>{busy === plan.code ? "Saving…" : "Save"}</button>
              <button className="admin-mini" type="button" disabled={busy !== null} onClick={() => setPlan(plan.code, planDraft(plan))}>Reset</button>
            </div>
          </article>
        );
      })}

      <h2 className="admin-prices-h2">Add-ons</h2>
      {plain.map((addon) => <AddonCard key={addon.code} addon={addon} d={addonDrafts[addon.code]} busy={busy} onChange={(p) => setAddon(addon.code, p)} onSave={() => saveAddon(addon)} onReset={() => setAddon(addon.code, addonDraft(addon))} />)}

      <h2 className="admin-prices-h2">Promote (featured placements)</h2>
      <p className="admin-prices-note">Proposed prices stay off /pricing, which says &ldquo;Featured placements: coming soon.&rdquo; until at least one is adopted and shown.</p>
      {promote.map((addon) => <AddonCard key={addon.code} addon={addon} d={addonDrafts[addon.code]} busy={busy} onChange={(p) => setAddon(addon.code, p)} onSave={() => saveAddon(addon)} onReset={() => setAddon(addon.code, addonDraft(addon))} />)}
    </div>
  );
}

function AddonCard({ addon, d, busy, onChange, onSave, onReset }: { addon: PricingAddon; d: AddonDraft; busy: string | null; onChange: (p: Partial<AddonDraft>) => void; onSave: () => void; onReset: () => void }) {
  return (
    <article className={`admin-price-card${addon.status === "proposed" ? " is-inactive" : ""}`}>
      <header className="admin-price-head">
        <strong>{addon.name}</strong>
        <span className="admin-pill">{addon.status}</span>
        <small>{addon.code} · now {dollars(addon.amountCents)} {UNIT_LABEL[addon.unit]}{addon.isPublic ? "" : " · private"}</small>
      </header>
      <div className="admin-price-grid">
        <label>Name<input className="admin-inline-input" value={d.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })} /></label>
        <label>Amount ($, {UNIT_LABEL[addon.unit]})<input className="admin-inline-input" inputMode="decimal" value={d.amount} onChange={(e) => onChange({ amount: e.target.value })} /></label>
        <label>Note<input className="admin-inline-input" value={d.note} maxLength={80} placeholder="e.g. Waived on annual plans" onChange={(e) => onChange({ note: e.target.value })} /></label>
        <label>Status<select className="admin-inline-input" value={d.status} onChange={(e) => onChange({ status: e.target.value as PricingAddon["status"] })}><option value="adopted">Adopted</option><option value="proposed">Proposed</option></select></label>
        <label className="admin-price-check"><input type="checkbox" checked={d.isPublic} onChange={(e) => onChange({ isPublic: e.target.checked })} /> Shown on /pricing</label>
      </div>
      <div className="admin-price-actions">
        <button className="admin-mini is-primary" type="button" disabled={busy !== null} onClick={onSave}>{busy === addon.code ? "Saving…" : "Save"}</button>
        <button className="admin-mini" type="button" disabled={busy !== null} onClick={onReset}>Reset</button>
      </div>
    </article>
  );
}
