"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { PhoneInput } from "@/app/_components/PhoneInput";
import { PrivacyNote } from "@/app/_components/PrivacyNote";
import { MARKET_CATEGORIES } from "@/lib/market/categories";

// The /sell application (brief 25, A4). Still on purpose: no motion here
// (brief 22's Never list). Sends the seller on to their own shop page,
// where they add products while PortPass checks their records.
export function SellForm({ defaultContact }: { defaultContact: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: "", category: "", licenceNumber: "", contactPerson: defaultContact, whatsapp: "", whatTheySell: "", pickupLocation: "" });
  const [cash, setCash] = useState<"yes" | "no" | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cash) return setError("Say whether buyers can pay cash when they collect.");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/market/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cashOnPickup: cash === "yes" }),
      });
      const data = (await response.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (!response.ok || !data.slug) throw new Error(data.error ?? "We couldn't save that. Please try again.");
      router.push(`/business/${data.slug}/shop?applied=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save that. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form className="application-form" onSubmit={submit}>
      <div className="form-grid">
        <label><span>Business name *</span><input name="businessName" autoComplete="organization" required maxLength={150} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} /></label>
        <label>
          <span>What you sell *</span>
          <select name="category" required value={form.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Choose one</option>
            {MARKET_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span>Business licence number *</span>
          <input name="licenceNumber" required maxLength={60} autoCapitalize="characters" value={form.licenceNumber} onChange={(e) => set("licenceNumber", e.target.value)} />
          <small>As printed on your licence. Only PortPass sees it; it is never shown on your shop.</small>
        </label>
        <label><span>Contact person *</span><input name="contactPerson" autoComplete="name" required maxLength={120} value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} /></label>
        <label><span>WhatsApp number buyers can message *</span><PhoneInput name="whatsapp" required value={form.whatsapp} onChange={(v) => set("whatsapp", v)} /></label>
        <label className="full-field">
          <span>Tell us what you sell *</span>
          <textarea name="whatTheySell" required rows={3} maxLength={500} placeholder="Hand-poured candles in island scents, 8oz and 16oz." value={form.whatTheySell} onChange={(e) => set("whatTheySell", e.target.value)} />
        </label>
        <label className="full-field">
          <span>Where buyers collect *</span>
          <textarea name="pickupLocation" required rows={2} maxLength={500} placeholder="Our studio on Shirley Street, weekdays 10am to 5pm." value={form.pickupLocation} onChange={(e) => set("pickupLocation", e.target.value)} />
        </label>
        <fieldset className="full-field sell-cash">
          <legend>Can buyers pay cash when they collect? *</legend>
          <label><input type="radio" name="cash" value="yes" checked={cash === "yes"} onChange={() => setCash("yes")} /> Yes, cash on pickup</label>
          <label><input type="radio" name="cash" value="no" checked={cash === "no"} onChange={() => setCash("no")} /> No, bank transfer before pickup</label>
        </fieldset>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit">
        <p>PortPass checks your licence number and contact person before your shop is public. Nothing is approved automatically.</p>
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Sending…" : "Apply to sell"}</button>
      </div>
      <PrivacyNote />
    </form>
  );
}
