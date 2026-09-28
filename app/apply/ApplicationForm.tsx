"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { portpassWhatsAppUrl } from "@/lib/contact";

type FormState = { name: string; businessName: string; section: string; whatsapp: string; instagram: string; note: string };
type SectionOption = { slug: string; name: string };

// `sections` comes from the page (the categories table, with the compiled
// list as fallback) so the form never carries its own copy of the list.
export function ApplicationForm({ sections }: { sections: SectionOption[] }) {
  const searchParams = useSearchParams();
  // A coming-soon page's "Run a venue? Get listed" link arrives with
  // ?section=venues, so the section is already chosen.
  const presetSection = searchParams.get("section") ?? "";
  const [form, setForm] = useState<FormState>({ name: "", businessName: "", section: sections.some((s) => s.slug === presetSection) ? presetSection : "", whatsapp: "", instagram: "", note: "" });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const whatsappHref = portpassWhatsAppUrl(`Hi PortPass — I'd like to get ${form.businessName.trim() || "my business"} listed.`);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.section) {
      setError("Choose the section your business belongs in.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          utm_source: searchParams.get("utm_source") ?? "",
          utm_medium: searchParams.get("utm_medium") ?? "",
          utm_campaign: searchParams.get("utm_campaign") ?? "",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "We couldn’t send that. Please try again.");
      track("apply_submitted", { section: form.section, source: searchParams.get("utm_source") ?? "" });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <section className="confirmation" aria-live="polite">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow"><span className="eyebrow-dot" />Got it</div>
        <h2>We&rsquo;ll message you on WhatsApp.</h2>
        <p>Usually within a business day. Have a few photos and your prices ready and we&rsquo;ll build the page from there.</p>
        <a className="primary-button" href={whatsappHref} target="_blank" rel="noopener noreferrer">Message us now on WhatsApp →</a>
      </section>
    );
  }

  return (
    <form className="application-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label><span>Your name *</span><input name="name" autoComplete="name" required maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span>Business name *</span><input name="businessName" autoComplete="organization" required maxLength={150} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} /></label>
        <label>
          <span>Section *</span>
          <select name="section" required value={form.section} onChange={(e) => set("section", e.target.value)}>
            <option value="">Choose one</option>
            {sections.map((section) => <option key={section.slug} value={section.slug}>{section.name}</option>)}
          </select>
        </label>
        <label><span>WhatsApp number *</span><input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" required placeholder="242-423-8161" maxLength={40} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></label>
        <label><span>Instagram (optional)</span><input name="instagram" placeholder="@yourbusiness" maxLength={60} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} /></label>
        <label className="full-field"><span>Anything we should know? (optional)</span><input name="note" maxLength={300} placeholder="What you offer, where, and rough prices" value={form.note} onChange={(e) => set("note", e.target.value)} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-submit">
        <p>We reply on WhatsApp. No account or card needed to get started.</p>
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Sending…" : "Get listed →"}</button>
      </div>
      <p className="apply-alt">Rather just talk? <a href={whatsappHref} target="_blank" rel="noopener noreferrer">Message us on WhatsApp →</a></p>
    </form>
  );
}
