"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Shop } from "@/db/shop";
import { DEFAULT_HOLD_HOURS } from "@/lib/shop/rules";

export function ShopSettingsForm({ orgId, slug, shop, suggestedPrefix }: { orgId: number; slug: string; shop: Shop | null; suggestedPrefix: string }) {
  const router = useRouter();
  const [prefix, setPrefix] = useState(shop?.referencePrefix ?? suggestedPrefix);
  const [returnsPolicy, setReturnsPolicy] = useState(shop?.returnsPolicy ?? "");
  const [holdHours, setHoldHours] = useState(String(shop?.holdHours ?? DEFAULT_HOLD_HOURS));
  const [isPublished, setIsPublished] = useState(shop?.isPublished ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/business/orgs/${orgId}/shop`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencePrefix: prefix, returnsPolicy, holdHours: Number(holdHours), isPublished }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That didn't save.");
      setMessage({ kind: "ok", text: "Saved." });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="seller-form" onSubmit={save}>
      <label>
        <span>Reference prefix</span>
        <input required value={prefix} maxLength={4} pattern="[A-Za-z]{2,4}" autoCapitalize="characters" onChange={(e) => setPrefix(e.target.value.toUpperCase())} />
        <small>Reservation codes read {prefix || "KL"}-7KQ3MX.</small>
      </label>
      <label>
        <span>Hold unpaid reservations for (hours)</span>
        <input required type="number" inputMode="numeric" min={1} max={336} value={holdHours} onChange={(e) => setHoldHours(e.target.value)} />
        <small>The drop page says: &ldquo;Your reservation is held for {holdHours || DEFAULT_HOLD_HOURS} hours until paid.&rdquo;</small>
      </label>
      <label className="seller-field-wide">
        <span>Returns policy (shown on your shop page)</span>
        <textarea rows={4} maxLength={2000} value={returnsPolicy} onChange={(e) => setReturnsPolicy(e.target.value)} placeholder="e.g. Exchanges for a different size within 7 days of pickup, unworn with tags. No refunds on custom names." />
      </label>
      <label className="seller-check seller-field-wide">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        <span>Shop is open: show the shop page at portpassbahamas.com/shop/{slug}</span>
      </label>
      {message && <p className={message.kind === "error" ? "form-error" : "seller-ok"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save shop settings"}</button>
    </form>
  );
}
