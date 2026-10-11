"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { MARKET_CATEGORIES, type MarketCategorySlug } from "@/lib/market/categories";
import { SELLER_STATUS_LABEL, type DeliveryZone, type SellerStatus } from "@/lib/market/sellers";

type ZoneRow = { key: string; zone: string; fee: string; leadDays: string };

let rowKey = 0;
const nextKey = () => `zone-${++rowKey}`;

const dollars = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);

export type SellerSettingsValue = {
  status: SellerStatus;
  statusReason: string | null;
  marketCategory: MarketCategorySlug | null;
  whatTheySell: string;
  contactPerson: string | null;
  licenceNumber: string | null;
  pickupNote: string;
  deliveryZones: DeliveryZone[];
  acceptsCashOnPickup: boolean;
};

// The seller's PortPass Market settings (brief 25, part A): how buyers get
// an order, and the two records PortPass checks before the "Made in The
// Bahamas" badge (the business licence number, the contact person; never
// public). Still on purpose: no motion in the business tools.
export function SellerSettings({ orgId, slug, value }: { orgId: number; slug: string; value: SellerSettingsValue }) {
  const router = useRouter();
  const [category, setCategory] = useState<MarketCategorySlug | "">(value.marketCategory ?? "");
  const [whatTheySell, setWhatTheySell] = useState(value.whatTheySell);
  const [contactPerson, setContactPerson] = useState(value.contactPerson ?? "");
  const [licenceNumber, setLicenceNumber] = useState(value.licenceNumber ?? "");
  const [pickupNote, setPickupNote] = useState(value.pickupNote);
  const [cash, setCash] = useState(value.acceptsCashOnPickup);
  const [zones, setZones] = useState<ZoneRow[]>(value.deliveryZones.map((z) => ({ key: nextKey(), zone: z.zone, fee: dollars(z.feeCents), leadDays: String(z.leadDays) })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  async function save(requestVerification: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/business/orgs/${orgId}/shop/seller`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category || null,
          whatTheySell,
          contactPerson,
          licenceNumber,
          pickupNote,
          cashOnPickup: cash,
          deliveryZones: zones.map((z) => ({ zone: z.zone, feeCents: Math.round(Number(z.fee || "0") * 100), leadDays: Number(z.leadDays || "0") })),
          requestVerification,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; sellerStatus?: SellerStatus };
      if (!response.ok) throw new Error(data.error ?? "That didn't save.");
      setMessage({ kind: "ok", text: data.sellerStatus === "pending" ? "Saved. PortPass will check your records and message you." : "Saved." });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="seller-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void save(false); }}>
      <p className={`seller-market-status is-${value.status}`}>
        <strong>{SELLER_STATUS_LABEL[value.status]}</strong>
        {value.status === "none" && " Ask PortPass to verify you and your products appear on PortPass Market with the Made in The Bahamas badge."}
        {value.status === "pending" && " Nothing of yours is public yet. You can keep adding products meanwhile."}
        {value.status === "verified" && " Changing your licence number or contact person sends you back to PortPass for a quick check."}
        {value.status === "suspended" && value.statusReason && <> PortPass said: &ldquo;{value.statusReason}&rdquo;</>}
      </p>

      <label>
        <span>What you sell</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as MarketCategorySlug | "")}>
          <option value="">Choose one</option>
          {MARKET_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </label>
      <label className="seller-field-wide"><span>In a sentence</span><textarea rows={2} maxLength={500} value={whatTheySell} onChange={(e) => setWhatTheySell(e.target.value)} placeholder="Hand-poured candles in island scents." /></label>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>What PortPass checks (never shown on your shop)</legend>
        <label><span>Business licence number</span><input maxLength={60} autoCapitalize="characters" value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} /></label>
        <label><span>Contact person</span><input maxLength={120} autoComplete="name" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></label>
      </fieldset>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>How buyers get their order</legend>
        <label><span>Pickup: where and when</span><textarea rows={2} maxLength={500} value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} placeholder="Our studio on Shirley Street, weekdays 10am to 5pm." /></label>
        <label className="seller-check"><input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} /><span>Buyers can pay cash when they collect</span></label>
        <p className="seller-hint">Bank transfers go to the account in <a href={`/business/${slug}/payments/settings`}>Payments → Settings</a>.</p>
        <p className="seller-hint">Delivery areas you cover, with your fee and how many days&rsquo; notice you need. Leave empty for pickup only.</p>
        <ul className="seller-zones">
          {zones.map((z) => (
            <li key={z.key}>
              <input aria-label="Delivery area" maxLength={60} placeholder="Cable Beach" value={z.zone} onChange={(e) => setZones((c) => c.map((row) => (row.key === z.key ? { ...row, zone: e.target.value } : row)))} />
              <input aria-label={`Fee for ${z.zone || "this area"} (BSD)`} inputMode="decimal" placeholder="$ fee" value={z.fee} onChange={(e) => setZones((c) => c.map((row) => (row.key === z.key ? { ...row, fee: e.target.value.replace(/[^0-9.]/g, "") } : row)))} />
              <input aria-label={`Days' notice for ${z.zone || "this area"}`} inputMode="numeric" placeholder="days" value={z.leadDays} onChange={(e) => setZones((c) => c.map((row) => (row.key === z.key ? { ...row, leadDays: e.target.value.replace(/\D/g, "") } : row)))} />
              <button type="button" className="admin-mini" aria-label={`Remove ${z.zone || "this area"}`} onClick={() => setZones((c) => c.filter((row) => row.key !== z.key))}>✕</button>
            </li>
          ))}
        </ul>
        <button type="button" className="admin-mini" disabled={zones.length >= 12} onClick={() => setZones((c) => [...c, { key: nextKey(), zone: "", fee: "", leadDays: "1" }])}>+ Delivery area</button>
      </fieldset>

      {message && <p className={message.kind === "error" ? "form-error" : "seller-ok"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
      <div className="seller-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Market settings"}</button>
        {value.status === "none" && (
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void save(true)}>Save and ask PortPass to verify</button>
        )}
      </div>
    </form>
  );
}
