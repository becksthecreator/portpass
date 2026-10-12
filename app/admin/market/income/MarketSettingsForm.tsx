"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Settings = { sellerPlanCents: number; commissionBps: number; feesLive: boolean };

// Admin -> Market -> Income: the Seller plan price, the commission rate,
// and the switch that turns the daily job's dry run into real (draft)
// invoices. Switching on asks for a confirmation: Antonio confirms the
// prices before launch.
export function MarketSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [dollars, setDollars] = useState((initial.sellerPlanCents / 100).toFixed(2));
  const [percent, setPercent] = useState(String(initial.commissionBps / 100));
  const [live, setLive] = useState(initial.feesLive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (live && !initial.feesLive && !window.confirm(`Switch Market fees on? From this month, the daily job drafts a PortPass invoice for each seller: $${dollars} for the Seller plan and ${percent}% of paid orders PortPass brought. Only do this once the prices are confirmed.`)) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/admin/market/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerPlanDollars: dollars, commissionPercent: percent, feesLive: live }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That didn't save.");
      setSaved("Saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form mkt-admin-settings" onSubmit={save}>
      <label><span>Seller plan, a month ($)</span><input inputMode="decimal" required value={dollars} onChange={(e) => setDollars(e.target.value)} /></label>
      <label><span>Commission on paid orders PortPass brought (%)</span><input inputMode="decimal" required value={percent} onChange={(e) => setPercent(e.target.value)} /></label>
      <label className="mkt-admin-switch"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /><span>Fees are on: the daily job drafts real invoices (off: a dry run, amounts in the log only)</span></label>
      <button type="submit" className="admin-mini is-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      {saved && <p className="admin-prices-note" role="status">{saved}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
