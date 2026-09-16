"use client";

import { FormEvent, useState } from "react";

type FormState = {
  partnerOneName: string; partnerTwoName: string;
  contactEmail: string; contactPhone: string;
  weddingDatePreference: string; guestCountEstimate: string;
  ceremonyStyle: string; venuePreference: string;
  servicesWanted: string[];
  consultationPreference: string; preferredContactTime: string; notes: string;
};

const initial: FormState = {
  partnerOneName: "", partnerTwoName: "",
  contactEmail: "", contactPhone: "",
  weddingDatePreference: "", guestCountEstimate: "",
  ceremonyStyle: "", venuePreference: "",
  servicesWanted: [],
  consultationPreference: "", preferredContactTime: "", notes: "",
};

const steps = ["You & the day", "Ceremony & venue", "Services & consultation"];

const CEREMONY_STYLES = [
  { value: "beach_ceremony", label: "Beach ceremony" },
  { value: "vow_renewal", label: "Vow renewal" },
  { value: "intimate_ceremony", label: "Intimate ceremony" },
  { value: "other", label: "Something else" },
];

const SERVICES = [
  { value: "photo_film", label: "Photo & film", hint: "Cinematic coverage of the day." },
  { value: "transport", label: "Transport", hint: "Getting your party where it needs to be." },
  { value: "flowers_decor", label: "Flowers & décor", hint: "Ceremony and reception styling." },
  { value: "officiant_only", label: "Officiant only", hint: "Just the ceremony, led by Antonio." },
  { value: "full_planning", label: "Full planning", hint: "The Wedding Desk handles the details." },
];

const CONSULTATION_OPTIONS = [
  { value: "call", label: "Phone call" },
  { value: "whatsapp_video", label: "WhatsApp video" },
  { value: "guided_text", label: "Guided text" },
];

export function WeddingPlanner() {
  const [form, setForm] = useState<FormState>(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleService(value: string) {
    setForm((f) => ({
      ...f,
      servicesWanted: f.servicesWanted.includes(value)
        ? f.servicesWanted.filter((v) => v !== value)
        : [...f.servicesWanted, value],
    }));
  }

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (!form.partnerOneName.trim()) return "Tell us at least one partner's name.";
      if (!form.contactEmail.trim() || !form.contactEmail.includes("@")) return "A valid email is required.";
    }
    return null;
  }

  function next() {
    const message = validateStep(step);
    if (message) { setError(message); return; }
    setError(null);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = validateStep(0);
    if (message) { setError(message); setStep(0); return; }
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/weddings/bahamas-by-the-sea/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          guestCountEstimate: form.guestCountEstimate ? Number(form.guestCountEstimate) : null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not send your request. Please try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="registration-confirmation">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow">Request received</div>
        <h1>On its way to the Wedding Desk.</h1>
        <p className="confirmation-lead">Thank you, {form.partnerOneName}. The Beckfords Wedding Desk will be in touch by email{form.contactPhone ? " or phone" : ""} to start shaping your plan.</p>
        <a className="secondary-button" href="/weddings/bahamas-by-the-sea">Back to Bahamas Weddings By The Sea</a>
      </section>
    );
  }

  return (
    <section className="registration-shell">
      <div className="registration-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Bahamas Weddings By The Sea</div>
        <h1>Tell us what your day needs.</h1>
        <div className="registration-progress">
          {steps.map((name, index) => (
            <div className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={name}>
              <span>{index + 1}</span><small>{name}</small>
            </div>
          ))}
        </div>
      </div>

      <form className="registration-form" onSubmit={submit}>
        {step === 0 && (
          <div className="form-grid">
            <label><span>Partner 1 name *</span><input value={form.partnerOneName} onChange={(e) => set("partnerOneName", e.target.value)} /></label>
            <label><span>Partner 2 name</span><input value={form.partnerTwoName} onChange={(e) => set("partnerTwoName", e.target.value)} /></label>
            <label><span>Email *</span><input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></label>
            <label><span>Phone</span><input type="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></label>
            <label><span>Wedding date (or season, if not set yet)</span><input value={form.weddingDatePreference} onChange={(e) => set("weddingDatePreference", e.target.value)} placeholder="e.g. June 2027, or still deciding" /></label>
            <label><span>Estimated guest count</span><input type="number" min={0} value={form.guestCountEstimate} onChange={(e) => set("guestCountEstimate", e.target.value)} /></label>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="choice-section">
              <span className="choice-heading">Ceremony style</span>
              <div className="class-choice-grid">
                {CEREMONY_STYLES.map((option) => (
                  <label className={`choice-card ${form.ceremonyStyle === option.value ? "is-selected" : ""}`} key={option.value}>
                    <input type="radio" name="ceremonyStyle" checked={form.ceremonyStyle === option.value} onChange={() => set("ceremonyStyle", option.value)} />
                    <span className="choice-check" /><strong>{option.label}</strong>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-grid">
              <label className="full-field"><span>Venue preference</span><textarea rows={3} value={form.venuePreference} onChange={(e) => set("venuePreference", e.target.value)} placeholder="A specific beach, a hotel, a private venue — or tell us your style and we'll suggest options." /></label>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="choice-section">
              <span className="choice-heading">Services you&apos;re interested in</span>
              <div className="class-choice-grid">
                {SERVICES.map((option) => (
                  <label className={`choice-card ${form.servicesWanted.includes(option.value) ? "is-selected" : ""}`} key={option.value}>
                    <input type="checkbox" checked={form.servicesWanted.includes(option.value)} onChange={() => toggleService(option.value)} />
                    <span className="choice-check" /><strong>{option.label}</strong><span>{option.hint}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="choice-section">
              <span className="choice-heading">How should the Wedding Desk reach you?</span>
              <div className="payment-method-grid">
                {CONSULTATION_OPTIONS.map((option) => (
                  <label className={`choice-card ${form.consultationPreference === option.value ? "is-selected" : ""}`} key={option.value}>
                    <input type="radio" name="consultationPreference" checked={form.consultationPreference === option.value} onChange={() => set("consultationPreference", option.value)} />
                    <span className="choice-check" /><strong>{option.label}</strong>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-grid">
              <label><span>Preferred contact time</span><input value={form.preferredContactTime} onChange={(e) => set("preferredContactTime", e.target.value)} placeholder="Weekday evenings, weekend mornings…" /></label>
              <label className="full-field"><span>Anything else?</span><textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
            </div>
          </>
        )}

        {error && <p className="form-error registration-error" role="alert">{error}</p>}

        <div className="registration-actions">
          {step > 0 ? <button className="secondary-button" type="button" onClick={() => setStep((s) => s - 1)} disabled={busy}>← Back</button> : <a className="secondary-button" href="#venues">← Venues</a>}
          {step < steps.length - 1
            ? <button className="primary-button" type="button" onClick={next}>Continue →</button>
            : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Sending…" : "Send to the Wedding Desk →"}</button>}
        </div>
      </form>
    </section>
  );
}
