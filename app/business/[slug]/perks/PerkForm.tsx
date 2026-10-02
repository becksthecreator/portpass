"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { bothPrices, cleanPerk, PERK_KIND_HINT, PERK_KIND_LABEL, perkChip, perkConditions, type PerkKind } from "@/lib/memberPerks";

// Suggested first: the two that cost a business least (brief 10, section 2).
const KIND_ORDER: PerkKind[] = ["free_addon", "early_access", "priority", "percent_off", "amount_off"];

type OfferingOption = { id: number; name: string; priceCents: number; priceUnit: string | null };

function toCents(dollarsTyped: string): number | null {
  const value = Number(dollarsTyped);
  return dollarsTyped.trim() && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function toWhole(typed: string): number | null {
  const value = Number(typed);
  return typed.trim() && Number.isInteger(value) && value > 0 ? value : null;
}

// Choose a type, fill in its fields, see the chip exactly as customers
// will, and save it as a draft. Publishing is a separate, deliberate tap.
export function PerkForm({ orgId, offerings }: { orgId: number; offerings: OfferingOption[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<PerkKind>("free_addon");
  const [title, setTitle] = useState("");
  const [percent, setPercent] = useState("10");
  const [amount, setAmount] = useState("");
  const [addonText, setAddonText] = useState("");
  const [earlyHours, setEarlyHours] = useState("48");
  const [offeringId, setOfferingId] = useState("");
  const [firstBookingOnly, setFirstBookingOnly] = useState(false);
  const [minSpend, setMinSpend] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [monthlyCap, setMonthlyCap] = useState("");
  const [conditionsText, setConditionsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const draft = {
    kind,
    title,
    percent: kind === "percent_off" ? toWhole(percent) : null,
    amountCents: kind === "amount_off" ? toCents(amount) : null,
    addonText: kind === "free_addon" ? addonText : null,
    earlyAccessHours: kind === "early_access" ? toWhole(earlyHours) : null,
    offeringId: offeringId ? Number(offeringId) : null,
    firstBookingOnly,
    minSpendCents: toCents(minSpend),
    startsOn: null,
    endsOn: endsOn || null,
    monthlyCap: toWhole(monthlyCap),
    conditionsText,
  };
  const checked = cleanPerk(draft);
  const preview = checked.ok ? checked.value : null;
  // Both prices, on a real price of the business's own: never an invented one.
  const example = preview ? offerings.filter((o) => preview.offeringId === null || o.id === preview.offeringId).map((o) => ({ name: o.name, line: bothPrices(o.priceCents, preview, o.priceUnit) })).find((o) => o.line) : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!checked.ok) {
      setMessage({ kind: "error", text: checked.error });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/business/orgs/${orgId}/perks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That didn't save.");
      setMessage({ kind: "ok", text: "Saved as a draft. Publish it from the list above when you're ready." });
      setTitle("");
      setAddonText("");
      setConditionsText("");
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="seller-form perk-form" onSubmit={save}>
      <fieldset className="seller-fieldset seller-field-wide">
        <legend>What kind of perk?</legend>
        <div className="perk-kinds">
          {KIND_ORDER.map((option, index) => (
            <label key={option} className={`perk-kind${kind === option ? " is-chosen" : ""}`}>
              <input type="radio" name="perk-kind" value={option} checked={kind === option} onChange={() => setKind(option)} />
              <span><b>{PERK_KIND_LABEL[option]}</b>{index < 2 && <em>Suggested</em>}<small>{PERK_KIND_HINT[option]}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="seller-field-wide">
        <span>Title</span>
        <input required minLength={4} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "free_addon" ? "Free extra 30 minutes for members" : kind === "early_access" ? "Members book 48 hours early" : kind === "priority" ? "First pick of Saturday slots" : "10% off your first booking"} />
      </label>

      {kind === "percent_off" && (
        <label>
          <span>Percentage off</span>
          <input required type="number" inputMode="numeric" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </label>
      )}
      {kind === "amount_off" && (
        <label>
          <span>Amount off, in dollars</span>
          <input required type="number" inputMode="decimal" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10" />
        </label>
      )}
      {kind === "free_addon" && (
        <label>
          <span>What members get free</span>
          <input required maxLength={120} value={addonText} onChange={(e) => setAddonText(e.target.value)} placeholder="extra 30 minutes" />
          <small>Shown as &ldquo;Members: free {addonText || "extra 30 minutes"}&rdquo;.</small>
        </label>
      )}
      {kind === "early_access" && (
        <label>
          <span>Hours before the public</span>
          <input required type="number" inputMode="numeric" min={1} max={720} value={earlyHours} onChange={(e) => setEarlyHours(e.target.value)} />
          <small>48 is two days.</small>
        </label>
      )}

      <label>
        <span>Applies to</span>
        <select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
          <option value="">Everything you offer</option>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>

      <fieldset className="seller-fieldset seller-field-wide">
        <legend>Limits (all optional)</legend>
        <label className="seller-check">
          <input type="checkbox" checked={firstBookingOnly} onChange={(e) => setFirstBookingOnly(e.target.checked)} />
          <span>First booking only: each member can use it once</span>
        </label>
        <div className="perk-limits">
          <label>
            <span>Minimum spend, in dollars</span>
            <input type="number" inputMode="decimal" min={0.01} step="0.01" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} />
          </label>
          <label>
            <span>Last day</span>
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
          <label>
            <span>Most uses in a month</span>
            <input type="number" inputMode="numeric" min={1} value={monthlyCap} onChange={(e) => setMonthlyCap(e.target.value)} />
          </label>
        </div>
        <label>
          <span>Any other condition, in plain words</span>
          <input maxLength={200} value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} placeholder="Weekday bookings only" />
        </label>
      </fieldset>

      <div className="perk-preview seller-field-wide" aria-live="polite">
        <span className="perk-preview-label">How customers will see it</span>
        {preview ? (
          <>
            <span className="perk-chip">{perkChip(preview)}</span>
            <strong>{preview.title}</strong>
            {perkConditions(preview) && <span className="perk-preview-conditions">{perkConditions(preview)}</span>}
            {example && <span className="perk-preview-price">{example.name}: {example.line}</span>}
          </>
        ) : (
          <span className="perk-preview-conditions">{checked.ok ? "" : checked.error}</span>
        )}
      </div>

      {message && <p className={`seller-field-wide ${message.kind === "error" ? "form-error" : "seller-ok"}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save as a draft"}</button>
    </form>
  );
}
