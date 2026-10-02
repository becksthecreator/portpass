"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type { OrgRole } from "@/db/accounts";
import type { Business, BusinessImage, BusinessInvite, BusinessOffering, TeamMember } from "@/db/business";
import type { Section } from "@/db/categories";
import { suggestForWhiteText, whiteTextContrast } from "@/lib/color";
import { PhoneInput } from "@/app/_components/PhoneInput";

type Props = {
  mode: "setup" | "settings";
  business: Business;
  images: BusinessImage[];
  offerings: BusinessOffering[];
  invites: BusinessInvite[];
  team: TeamMember[];
  section: Section | null;
  role: OrgRole;
  initialStep: number;
};

const STEPS = ["Your business", "Contact", "Look", "What you offer", "How customers pay", "Your team", "Review & submit"];
const PRICE_UNITS: { value: string; label: string }[] = [
  { value: "", label: "Fixed price" },
  { value: "from", label: "From (starting price)" },
  { value: "per_session", label: "Per session" },
  { value: "per_person", label: "Per person" },
  { value: "per_hour", label: "Per hour" },
  { value: "per_day", label: "Per day" },
  { value: "per_term", label: "Per term" },
];

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; problems?: string[] };
  if (!res.ok) {
    const err = new Error(data.error ?? "Something went wrong. Please try again.") as Error & { problems?: string[] };
    err.problems = data.problems;
    throw err;
  }
  return data;
}

// Photos are shrunk in the browser before upload: phones produce 5-12 MB
// images and Vercel caps a request body at 4.5 MB. Anything that can't be
// decoded (or is already small) goes up as-is and the server decides.
async function downscale(file: File): Promise<Blob> {
  if (file.size < 1_200_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 2048;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function SetupWizard(props: Props) {
  const { mode, section, role } = props;
  const [business, setBusiness] = useState(props.business);
  const [images, setImages] = useState(props.images);
  const [offerings, setOfferings] = useState(props.offerings);
  const [invites, setInvites] = useState(props.invites);
  const [step, setStep] = useState(props.initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const base = `/api/business/orgs/${business.id}`;
  const isOwner = role === "org_owner";

  const done = useMemo(
    () => [
      Boolean(business.name && business.oneLiner),
      Boolean(business.whatsappE164 || business.phoneE164),
      Boolean(business.logoUrl || images.length),
      offerings.length > 0,
      business.paymentMethods.length > 0,
      true,
      business.status !== "draft",
    ],
    [business, images, offerings],
  );
  const progress = Math.round((done.filter(Boolean).length / STEPS.length) * 100);

  function go(next: number) {
    setError("");
    setNotice("");
    setStep(Math.min(STEPS.length, Math.max(1, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveDetails(values: Record<string, string>, next?: number) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ business: Business }>(`${base}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      setBusiness(data.business);
      setNotice(data.business.status === "submitted" && business.status !== "submitted" ? "Saved. Because that changes your name or category, we'll take another look before it updates." : "Saved.");
      if (next) go(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  // ---- step 1 ----
  const [s1, setS1] = useState({ name: business.name, subcategory: business.subcategory ?? "", island: business.island ?? "", area: business.area ?? "", oneLiner: business.oneLiner ?? "", description: business.description ?? "" });
  // ---- step 2 ----
  const [s2, setS2] = useState({ phoneE164: business.phoneE164 ?? "", whatsappE164: business.whatsappE164 ?? "", publicEmail: business.publicEmail ?? "", websiteUrl: business.websiteUrl ?? "", instagramHandle: business.instagramHandle ?? "", googleBusinessUrl: business.googleBusinessUrl ?? "" });
  // ---- step 3 ----
  const [brand, setBrand] = useState(business.brandColor ?? "#14303d");
  const contrast = whiteTextContrast(brand);
  const suggestion = suggestForWhiteText(brand);
  // ---- step 4 ----
  const emptyOffering = { id: null as number | null, name: "", summary: "", price: "", priceUnit: "", duration: "", capacity: "" };
  const [offer, setOffer] = useState(emptyOffering);
  // ---- step 5 ----
  const [methods, setMethods] = useState<string[]>(business.paymentMethods);
  const [bank, setBank] = useState(business.bankTransferDetails ?? { bank: "", accountName: "", accountNumber: "", branch: "", instructions: "" });
  // ---- step 6 ----
  const [invite, setInvite] = useState({ email: "", role: "org_staff" as OrgRole, canViewMedical: false });

  async function upload(kind: "logo" | "photo", file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("kind", kind);
      body.append("file", await downscale(file), file.name.replace(/\.[^.]+$/, "") + ".jpg");
      const data = await api<{ logoUrl?: string; images?: BusinessImage[] }>(`${base}/images`, { method: "POST", body });
      if (kind === "logo" && data.logoUrl) setBusiness((b) => ({ ...b, logoUrl: data.logoUrl! }));
      if (data.images) {
        setImages(data.images);
        setBusiness((b) => ({ ...b, heroImageUrl: b.heroImageUrl ?? data.images![0]?.url ?? null }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: number) {
    setBusy(true);
    try {
      const data = await api<{ images: BusinessImage[] }>(`${base}/images`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId }) });
      setImages(data.images);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  async function setConsent(imageId: number, consentConfirmed: boolean) {
    try {
      const data = await api<{ images: BusinessImage[] }>(`${base}/images`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId, consentConfirmed }) });
      setImages(data.images);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update consent.");
    }
  }

  async function setHero(url: string) {
    try {
      await api(`${base}/images`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heroUrl: url }) });
      setBusiness((b) => ({ ...b, heroImageUrl: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the main photo.");
    }
  }

  async function saveOffering(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ offerings: BusinessOffering[] }>(`${base}/offerings`, {
        method: offer.id === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(offer),
      });
      setOfferings(data.offerings);
      setOffer(emptyOffering);
      setNotice(offer.price ? "Saved." : "Saved as a draft — it won't show until it has a price.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOffering(id: number) {
    setBusy(true);
    try {
      const data = await api<{ offerings: BusinessOffering[] }>(`${base}/offerings`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setOfferings(data.offerings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  async function savePayments(next?: number) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ business: Business; bankDetailsChanged: boolean }>(`${base}/payment-methods`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethods: methods, bankTransferDetails: methods.includes("bank_transfer") ? bank : null }),
      });
      setBusiness(data.business);
      setNotice(data.bankDetailsChanged ? "Saved. Every owner has been emailed about the bank-detail change." : "Saved.");
      if (next) go(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ invites: BusinessInvite[] }>(`${base}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(invite) });
      setInvites(data.invites);
      setInvite({ email: "", role: "org_staff", canViewMedical: false });
      setNotice("Invite sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    try {
      const data = await api<{ invites: BusinessInvite[] }>(`${base}/invites`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setInvites(data.invites);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke.");
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    setProblems([]);
    try {
      const data = await api<{ business: Business }>(`${base}/submit`, { method: "POST" });
      setBusiness(data.business);
      setSubmitted(true);
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      setError(err.message);
      setProblems(err.problems ?? []);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <section className="confirmation auth-card auth-card-wide" aria-live="polite">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow"><span className="eyebrow-dot" />Submitted</div>
        <h2>We&rsquo;ll review it within 2 business days.</h2>
        <p>We&rsquo;ll message you on WhatsApp if anything needs a tweak, then your page goes live the moment an offering has a price.</p>
        <div className="auth-actions">
          <Link className="primary-button" href={`/business/${business.slug}`}>Go to my business →</Link>
          <Link className="auth-text-button" href={`/business/${business.slug}/preview`}>See the preview</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="auth-card auth-card-wide wiz">
      <div className="wiz-head">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />{mode === "setup" ? "Set up your page" : "Settings"} · Step {step} of {STEPS.length}</div>
          <h1>{STEPS[step - 1]}</h1>
        </div>
        <div className="wiz-progress" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>
      </div>
      <ol className="wiz-steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" className={`${step === i + 1 ? "is-active" : ""}${done[i] ? " is-done" : ""}`} onClick={() => go(i + 1)}>{i + 1}. {label}</button>
          </li>
        ))}
      </ol>

      {notice && <p className="wiz-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {problems.length > 0 && <ul className="wiz-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

      {step === 1 && (
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void saveDetails(s1, 2); }}>
          <label><span>Business name *</span><input required maxLength={150} value={s1.name} onChange={(e) => setS1({ ...s1, name: e.target.value })} /></label>
          <label>
            <span>Section</span>
            <input value={section?.name ?? business.primaryCategory ?? ""} disabled />
          </label>
          {section && section.subcategories.length > 0 && (
            <label>
              <span>Subcategory</span>
              <select value={s1.subcategory} onChange={(e) => setS1({ ...s1, subcategory: e.target.value })}>
                <option value="">Not sure yet</option>
                {section.subcategories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
          )}
          <div className="wiz-two">
            <label><span>Island</span><input maxLength={80} placeholder="New Providence" value={s1.island} onChange={(e) => setS1({ ...s1, island: e.target.value })} /></label>
            <label><span>Area</span><input maxLength={80} placeholder="Nassau" value={s1.area} onChange={(e) => setS1({ ...s1, area: e.target.value })} /></label>
          </div>
          <label>
            <span>One line that says what you do * <em className="wiz-count">{s1.oneLiner.length}/120</em></span>
            <input required maxLength={120} placeholder="Saturday football classes for ages 3–6 at Lyford Cay." value={s1.oneLiner} onChange={(e) => setS1({ ...s1, oneLiner: e.target.value })} />
          </label>
          <label><span>Description (optional)</span><textarea rows={5} maxLength={2000} value={s1.description} onChange={(e) => setS1({ ...s1, description: e.target.value })} /></label>
          <div className="auth-actions">
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save & continue →"}</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void saveDetails(s2, 3); }}>
          <div className="wiz-two">
            <label><span>WhatsApp number *</span><PhoneInput required value={s2.whatsappE164} onChange={(v) => setS2({ ...s2, whatsappE164: v })} /></label>
            <label><span>Phone (if different)</span><PhoneInput value={s2.phoneE164} onChange={(v) => setS2({ ...s2, phoneE164: v })} /></label>
          </div>
          <label><span>Public email (optional)</span><input type="email" value={s2.publicEmail} onChange={(e) => setS2({ ...s2, publicEmail: e.target.value })} /></label>
          <div className="wiz-two">
            <label><span>Website (optional)</span><input inputMode="url" placeholder="yourbusiness.com" value={s2.websiteUrl} onChange={(e) => setS2({ ...s2, websiteUrl: e.target.value })} /></label>
            <label><span>Instagram (optional)</span><input placeholder="@yourbusiness" value={s2.instagramHandle} onChange={(e) => setS2({ ...s2, instagramHandle: e.target.value })} /></label>
          </div>
          <label><span>Google Business Profile link (optional)</span><input inputMode="url" placeholder="g.page/r/…" value={s2.googleBusinessUrl} onChange={(e) => setS2({ ...s2, googleBusinessUrl: e.target.value })} /><small className="auth-hint">Helps people find you on Google, and lets you ask customers for a Google review.</small></label>
          <div className="auth-actions">
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save & continue →"}</button>
            <button className="auth-text-button" type="button" onClick={() => go(1)}>Back</button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="auth-form">
          <div className="wiz-upload">
            <span>Logo</span>
            {business.logoUrl && <img className="wiz-logo" src={business.logoUrl} alt="" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload("logo", f); e.target.value = ""; }} />
          </div>
          <div className="wiz-upload">
            <span>Photos ({images.length}/8) — the first, or the one you star, is the main photo</span>
            {business.photoConsentRequired && (
              <p className="auth-hint wiz-warn">
                Photos of children stay hidden from the public page until you confirm, photo by photo, that you hold signed photo consent for every child in it. Photos with no children can be confirmed straight away.
              </p>
            )}
            {images.length > 0 && (
              <div className="wiz-photos">
                {images.map((img) => (
                  <figure key={img.id} className={`${business.heroImageUrl === img.url ? "is-hero" : ""}${business.photoConsentRequired && !img.consentConfirmed ? " is-hidden" : ""}`}>
                    <img src={img.url} alt={img.alt ?? ""} />
                    {business.photoConsentRequired && (
                      <label className="wiz-consent">
                        <input type="checkbox" checked={img.consentConfirmed} onChange={(e) => void setConsent(img.id, e.target.checked)} />
                        <span>{img.consentConfirmed ? "Consent confirmed · shown" : "Hidden until consent confirmed"}</span>
                      </label>
                    )}
                    <div>
                      <button type="button" onClick={() => void setHero(img.url)} disabled={business.heroImageUrl === img.url}>{business.heroImageUrl === img.url ? "★ Main" : "Make main"}</button>
                      <button type="button" onClick={() => void removeImage(img.id)} disabled={busy}>Remove</button>
                    </div>
                  </figure>
                ))}
              </div>
            )}
            {images.length < 8 && <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload("photo", f); e.target.value = ""; }} />}
          </div>
          <label>
            <span>Brand colour</span>
            <div className="wiz-color">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(brand) ? brand : "#14303d"} onChange={(e) => setBrand(e.target.value)} aria-label="Brand colour" />
              <input value={brand} maxLength={7} onChange={(e) => setBrand(e.target.value)} />
              <span className="wiz-swatch" style={{ background: brand }}>Aa</span>
            </div>
          </label>
          {contrast !== null && (
            <p className={`auth-hint${contrast < 4.5 ? " wiz-warn" : ""}`}>
              {contrast >= 4.5
                ? `White text on this colour reads at ${contrast.toFixed(1)}:1 — good.`
                : `White text on this colour would be hard to read (${contrast.toFixed(1)}:1). On buttons we'd use ${suggestion} instead — a darker shade of the same colour. `}
              {contrast < 4.5 && suggestion && <button type="button" className="auth-text-button" onClick={() => setBrand(suggestion)}>Use {suggestion}</button>}
            </p>
          )}
          <p className="auth-hint">Your colour appears in exactly four places on your page: the booking buttons, the build-your-own button, the featured price border, and button hover.</p>
          <div className="auth-actions">
            <button className="primary-button" type="button" disabled={busy || contrast === null} onClick={() => void saveDetails({ brandColor: brand }, 4)}>{busy ? "Saving…" : "Save & continue →"}</button>
            <button className="auth-text-button" type="button" onClick={() => go(2)}>Back</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="auth-form">
          <p className="auth-lead">What people book. An offering saves without a price, but it stays a draft — <strong>no price, no publish</strong>.</p>
          {offerings.length > 0 && (
            <ul className="wiz-list">
              {offerings.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{o.name}</strong>
                    <span>{o.priceCents === null ? "Draft — no price" : `$${(o.priceCents / 100).toFixed(o.priceCents % 100 ? 2 : 0)}${o.priceUnit ? ` ${PRICE_UNITS.find((u) => u.value === o.priceUnit)?.label.toLowerCase() ?? o.priceUnit}` : ""}`}{o.scheduleText ? ` · ${o.scheduleText}` : ""}</span>
                  </div>
                  <div>
                    <button type="button" onClick={() => setOffer({ id: o.id, name: o.name, summary: o.summary ?? "", price: o.priceCents === null ? "" : String(o.priceCents / 100), priceUnit: o.priceUnit ?? "", duration: o.scheduleText ?? "", capacity: o.capacity === null ? "" : String(o.capacity) })}>Edit</button>
                    <button type="button" onClick={() => void deleteOffering(o.id)} disabled={busy}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form className="wiz-subform auth-form" onSubmit={saveOffering}>
            <strong>{offer.id === null ? "Add an offering" : "Edit offering"}</strong>
            <label><span>Name *</span><input required maxLength={120} placeholder="Saturday class · Beach ceremony · Boat charter" value={offer.name} onChange={(e) => setOffer({ ...offer, name: e.target.value })} /></label>
            <div className="wiz-two">
              <label><span>Price (BSD)</span><input inputMode="decimal" placeholder="Leave blank to save a draft" value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value })} /></label>
              <label><span>Priced</span><select value={offer.priceUnit} onChange={(e) => setOffer({ ...offer, priceUnit: e.target.value })}>{PRICE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
            </div>
            <div className="wiz-two">
              <label><span>Duration / schedule</span><input maxLength={160} placeholder="45 minutes · Saturdays 9:00" value={offer.duration} onChange={(e) => setOffer({ ...offer, duration: e.target.value })} /></label>
              <label><span>Capacity</span><input inputMode="numeric" placeholder="e.g. 12" value={offer.capacity} onChange={(e) => setOffer({ ...offer, capacity: e.target.value })} /></label>
            </div>
            <label><span>Short description</span><textarea rows={3} maxLength={400} value={offer.summary} onChange={(e) => setOffer({ ...offer, summary: e.target.value })} /></label>
            <div className="auth-actions">
              <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : offer.id === null ? "Add offering" : "Save changes"}</button>
              {offer.id !== null && <button className="auth-text-button" type="button" onClick={() => setOffer(emptyOffering)}>Cancel edit</button>}
            </div>
          </form>
          <div className="auth-actions">
            <button className="primary-button" type="button" onClick={() => go(5)}>Continue →</button>
            <button className="auth-text-button" type="button" onClick={() => go(3)}>Back</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void savePayments(6); }}>
          {!isOwner && <p className="wiz-warn auth-hint">Only the business owner can change payment details.</p>}
          <fieldset className="wiz-fieldset" disabled={!isOwner}>
            <label className="wiz-check"><input type="checkbox" checked={methods.includes("cash")} onChange={(e) => setMethods(e.target.checked ? [...methods, "cash"] : methods.filter((m) => m !== "cash"))} /> <span>Cash</span></label>
            <label className="wiz-check"><input type="checkbox" checked={methods.includes("bank_transfer")} onChange={(e) => setMethods(e.target.checked ? [...methods, "bank_transfer"] : methods.filter((m) => m !== "bank_transfer"))} /> <span>Bank transfer</span></label>
            <label className="wiz-check is-disabled"><input type="checkbox" disabled /> <span>Card — coming soon with a licensed partner</span></label>
            {methods.includes("bank_transfer") && (
              <div className="wiz-subform">
                <strong>Bank transfer details customers will see</strong>
                <div className="wiz-two">
                  <label><span>Bank *</span><input required maxLength={120} value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })} /></label>
                  <label><span>Account name *</span><input required maxLength={120} value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} /></label>
                </div>
                <div className="wiz-two">
                  <label><span>Account number *</span><input required maxLength={60} value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} /></label>
                  <label><span>Branch / transit</span><input maxLength={120} value={bank.branch} onChange={(e) => setBank({ ...bank, branch: e.target.value })} /></label>
                </div>
                <label><span>Reference instructions</span><input maxLength={300} placeholder="Use your booking code as the reference" value={bank.instructions} onChange={(e) => setBank({ ...bank, instructions: e.target.value })} /></label>
                <p className="auth-hint">Every change here is logged and emailed to every owner. That's on purpose.</p>
              </div>
            )}
          </fieldset>
          <div className="auth-actions">
            {isOwner && <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save & continue →"}</button>}
            {!isOwner && <button className="primary-button" type="button" onClick={() => go(6)}>Continue →</button>}
            <button className="auth-text-button" type="button" onClick={() => go(4)}>Back</button>
          </div>
        </form>
      )}

      {step === 6 && (
        <div className="auth-form">
          <p className="auth-lead">People who help run the business. Staff only see medical details if you switch it on for them.</p>
          {props.team.length > 0 && (
            <ul className="wiz-list">
              {props.team.map((m) => <li key={m.userId}><div><strong>{m.fullName}</strong><span>{m.role.replace("org_", "")}{m.role === "org_staff" && m.canViewMedical ? " · can see medical info" : ""}</span></div></li>)}
            </ul>
          )}
          {invites.filter((i) => !i.acceptedAt).length > 0 && (
            <ul className="wiz-list">
              {invites.filter((i) => !i.acceptedAt).map((i) => (
                <li key={i.id}><div><strong>{i.email}</strong><span>Invited as {i.role.replace("org_", "")} · waiting</span></div><div><button type="button" onClick={() => void revoke(i.id)}>Revoke</button></div></li>
              ))}
            </ul>
          )}
          <form className="wiz-subform auth-form" onSubmit={sendInvite}>
            <strong>Invite someone</strong>
            <label><span>Email *</span><input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></label>
            <div className="wiz-two">
              <label>
                <span>Role</span>
                <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as OrgRole })}>
                  <option value="org_staff">Staff (coach, desk)</option>
                  <option value="org_viewer">Viewer</option>
                  {isOwner && <option value="org_admin">Admin</option>}
                  {isOwner && <option value="org_owner">Owner</option>}
                </select>
              </label>
              {invite.role === "org_staff" && (
                <label className="wiz-check wiz-check-inline"><input type="checkbox" checked={invite.canViewMedical} onChange={(e) => setInvite({ ...invite, canViewMedical: e.target.checked })} /> <span>Can see medical info</span></label>
              )}
            </div>
            <div className="auth-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button></div>
          </form>
          <div className="auth-actions">
            <button className="primary-button" type="button" onClick={() => go(7)}>Continue →</button>
            <button className="auth-text-button" type="button" onClick={() => go(5)}>Back</button>
          </div>
        </div>
      )}

      {step === 7 && (
        <div className="auth-form">
          <p className="auth-lead">Check the preview, then send it to PortPass. We review within 2 business days and message you on WhatsApp.</p>
          <div className="auth-actions">
            <a className="home-button home-button-light" href={`/business/${business.slug}/preview`} target="_blank" rel="noopener noreferrer">Open the preview ↗</a>
          </div>
          <ul className="wiz-checklist">
            {STEPS.slice(0, 6).map((label, i) => <li key={label} className={done[i] ? "is-done" : ""}>{done[i] ? "✓" : "○"} {label}</li>)}
          </ul>
          {business.status === "draft" && isOwner && <p className="auth-legal">By submitting you agree to the <a href="/terms#business" target="_blank" rel="noopener">terms for listed businesses</a>.</p>}
          <div className="auth-actions">
            {business.status === "draft" && isOwner && <button className="primary-button" type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit for review →"}</button>}
            {business.status === "draft" && !isOwner && <p className="auth-hint">Only the owner can submit.</p>}
            {business.status !== "draft" && <p className="auth-hint">Status: <strong>{business.status}</strong>. Changes to a live listing publish immediately; a name, category or payment change comes back to us for another look.</p>}
            <button className="auth-text-button" type="button" onClick={() => go(6)}>Back</button>
          </div>
        </div>
      )}

      <p className="auth-alt">
        <Link href={`/business/${business.slug}`}>Back to my business</Link>
      </p>
    </div>
  );
}
