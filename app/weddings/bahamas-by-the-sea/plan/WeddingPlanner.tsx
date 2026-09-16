"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const WHATSAPP_NUMBER = "12424241262";

type FormState = {
  ceremonyChoice: string;
  weddingDate: string;
  guests: string;
  arrivalDate: string;
  locationIdea: string;
  venuePreference: string;
  servicesWanted: string[];
  consultationMethod: string;
  consultationDate: string;
  consultationTime: string;
  consultationTimezone: string;
  names: string;
  email: string;
  travellingFrom: string;
  notes: string;
};

const CEREMONY_CHOICES = [
  { value: "Wedding ceremony", label: "Your wedding", hint: "A personalized legal ceremony with marriage-process guidance." },
  { value: "Intimate wedding", label: "Just the two of you", hint: "An intimate ceremony or very small gathering by the sea." },
  { value: "Vow renewal", label: "Vow renewal", hint: "Celebrate your story and say “I do” all over again." },
  { value: "Still exploring", label: "Still exploring", hint: "Share your ideas and let the team help shape the right plan." },
];

const VENUE_CHOICES = [
  { value: "Beachfront", label: "Beachfront", hint: "Sand, sea and an open-horizon ceremony." },
  { value: "Resort", label: "Resort", hint: "Guest-ready facilities and an easy destination experience." },
  { value: "Garden or estate", label: "Garden or estate", hint: "A private, green or architectural setting." },
  { value: "Church", label: "Church", hint: "A traditional ceremony setting." },
  { value: "Still deciding", label: "Still deciding", hint: "Let the Wedding Desk build a shortlist with you." },
];

const SERVICE_CHOICES = [
  { value: "Cinematic photo story", label: "Cinematic Photo Story", hint: "Ceremony photography and the moments around it." },
  { value: "Cinematic highlight film", label: "Cinematic Highlight", hint: "A short film shaped around the feeling of your day." },
  { value: "Full ceremony film", label: "Full Ceremony Film", hint: "A complete recording so every word is preserved." },
  { value: "Registrar appointment coordination", label: "Registrar Coordination", hint: "Help organizing appointments and the marriage process." },
  { value: "Island transportation planning", label: "Island Transport", hint: "Request transportation planning for appointments or the ceremony." },
  { value: "Ceremony rehearsal", label: "Ceremony Rehearsal", hint: "Ask about timing and availability for a rehearsal." },
  { value: "Premarital counselling", label: "Premarital Counselling", hint: "Optional marriage preparation with Antonio." },
  { value: "Help choosing services", label: "Help me choose", hint: "Let the team recommend what fits your plans." },
];

const CONSULTATION_CHOICES = [
  { value: "Consultation call", label: "Consultation call", hint: "Talk through the full plan by phone." },
  { value: "WhatsApp video consultation", label: "WhatsApp video", hint: "Meet face to face from wherever you are." },
  { value: "Guided text planning", label: "Guided text planning", hint: "Work through each decision in messages." },
];

const STEP_LABELS = ["Your ceremony", "The day", "Venue style", "Services", "Consultation", "Your details"];

function buildWhatsAppMessage(form: FormState) {
  const lines = [
    "Hello Beckfords Wedding Desk! I'd like to start planning through Bahamas Weddings By The Sea.",
    "",
    `Names: ${form.names}`,
    `Celebrating: ${form.ceremonyChoice || "Still exploring"}`,
    `Preferred date: ${form.weddingDate || "Still deciding"}`,
    `Venue style: ${form.venuePreference || "Still deciding"}`,
  ];
  if (form.servicesWanted.length) lines.push(`Services: ${form.servicesWanted.join(", ")}`);
  if (form.consultationMethod) lines.push(`Consultation preference: ${form.consultationMethod}`);
  if (form.notes) lines.push("", `Notes: ${form.notes}`);
  lines.push("", "Please help prepare the plan for Antonio to review.");
  return lines.join("\n");
}

export function WeddingPlanner() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(() => ({
    ceremonyChoice: searchParams.get("ceremony") ?? "",
    weddingDate: "",
    guests: "",
    arrivalDate: "",
    locationIdea: "",
    venuePreference: "",
    servicesWanted: searchParams.get("service") ? [searchParams.get("service") as string] : [],
    consultationMethod: "",
    consultationDate: "",
    consultationTime: "",
    consultationTimezone: "",
    names: "",
    email: "",
    travellingFrom: "",
    notes: "",
  }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleService(value: string) {
    setForm((f) => ({
      ...f,
      servicesWanted: f.servicesWanted.includes(value) ? f.servicesWanted.filter((v) => v !== value) : [...f.servicesWanted, value],
    }));
  }

  function validate(index: number): string | null {
    if (index === 0 && !form.ceremonyChoice) return "Choose the option closest to what you have in mind.";
    if (index === 4 && !form.consultationMethod) return "Choose how you'd like to meet the Wedding Desk.";
    if (index === 5 && !form.names.trim()) return "Tell us your names.";
    return null;
  }

  function next() {
    const message = validate(step);
    if (message) { setError(message); return; }
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  const summary = useMemo(() => [
    ["Celebrating", form.ceremonyChoice || "Still deciding"],
    ["Preferred date", form.weddingDate || "Still deciding"],
    ["Guests", form.guests || "Not specified"],
    ["Venue style", form.venuePreference || "Still deciding"],
    ["Services", form.servicesWanted.length ? form.servicesWanted.join(", ") : "None selected"],
    ["Consultation", form.consultationMethod || "Not specified"],
  ], [form]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = validate(5) || validate(0) || validate(4);
    if (message) { setError(message); return; }
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/weddings/bahamas-by-the-sea/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: form.names,
          contactEmail: form.email,
          ceremonyChoice: form.ceremonyChoice,
          weddingDatePreference: form.weddingDate,
          guestCountEstimate: form.guests ? Number(form.guests) : null,
          arrivalDate: form.arrivalDate,
          locationIdea: form.locationIdea,
          venuePreference: form.venuePreference,
          servicesWanted: form.servicesWanted,
          consultationPreference: form.consultationMethod,
          consultationDate: form.consultationDate,
          consultationTime: form.consultationTime,
          consultationTimezone: form.consultationTimezone,
          travellingFrom: form.travellingFrom,
          notes: form.notes,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not send your plan. Please try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage(form))}`;
    return (
      <section className="bws-planner-confirmation">
        <span className="bws-eyebrow">Request received</span>
        <h1>Your plan is on its way to the Wedding Desk.</h1>
        <p>Thank you, {form.names}. A Beckfords representative will follow up to refine the details before Antonio reviews your complete plan. Prefer to talk now?</p>
        <a className="bws-button bws-button-dark" href={whatsappHref} target="_blank" rel="noopener noreferrer">Message the Wedding Desk on WhatsApp <span aria-hidden="true">↗</span></a>
      </section>
    );
  }

  const progressPct = ((step + 1) / STEP_LABELS.length) * 100;

  return (
    <section className="bws-planner-card" aria-labelledby="planner-title">
      <div className="bws-planner-progress">
        <div>
          <span>Step {step + 1} of {STEP_LABELS.length}</span>
          <strong id="planner-title">{STEP_LABELS[step]}</strong>
        </div>
        <div className="bws-progress-track" aria-hidden="true"><span style={{ width: `${progressPct}%` }} /></div>
      </div>

      <form onSubmit={submit}>
        {step === 0 && (
          <fieldset className="bws-planner-step">
            <legend>What are you celebrating?</legend>
            <p className="bws-step-help">Choose the option closest to what you have in mind. You can change it later.</p>
            <div className="bws-choice-grid">
              {CEREMONY_CHOICES.map((option) => (
                <label className="bws-choice-card" key={option.value}>
                  <input type="radio" name="ceremony-choice" checked={form.ceremonyChoice === option.value} onChange={() => set("ceremonyChoice", option.value)} />
                  <span><b>{option.label}</b><small>{option.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className="bws-planner-step">
            <legend>Tell us about the day</legend>
            <p className="bws-step-help">Estimates are welcome. Nothing here reserves your date.</p>
            <div className="bws-form-grid">
              <div className="bws-field">
                <label htmlFor="plan-date">Preferred date <span>(optional)</span></label>
                <input id="plan-date" type="date" value={form.weddingDate} onChange={(e) => set("weddingDate", e.target.value)} />
                <small>Leave blank if you are still deciding.</small>
              </div>
              <div className="bws-field">
                <label htmlFor="plan-guests">Estimated guests <span>(optional)</span></label>
                <input id="plan-guests" type="number" min={0} max={9999} inputMode="numeric" placeholder="Not including the two of you" value={form.guests} onChange={(e) => set("guests", e.target.value)} />
              </div>
              <div className="bws-field">
                <label htmlFor="plan-arrival">Arrival date <span>(optional)</span></label>
                <input id="plan-arrival" type="date" value={form.arrivalDate} onChange={(e) => set("arrivalDate", e.target.value)} />
                <small>Helpful for marriage-licence timing.</small>
              </div>
              <div className="bws-field">
                <label htmlFor="plan-location">Location idea <span>(optional)</span></label>
                <input id="plan-location" type="text" maxLength={120} placeholder="Beach, resort, church, or still deciding" value={form.locationIdea} onChange={(e) => set("locationIdea", e.target.value)} />
              </div>
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="bws-planner-step">
            <legend>Explore your venue style</legend>
            <p className="bws-step-help">Browse wedding-ready places without leaving this page. Venue listings will be supplied by PortPass Bahamas as partners are approved.</p>
            <div className="bws-venue-browser">
              <div className="bws-venue-browser-head">
                <div><span>Powered by</span><strong>PortPass Bahamas</strong></div>
                <span className="bws-live-badge">Venue network</span>
              </div>
              <div className="bws-venue-results" aria-live="polite">
                <div className="bws-venue-empty">
                  <b>Venue listings are being prepared.</b>
                  <p>You can still tell us the atmosphere you want below while wedding-eligible venue partners are approved.</p>
                </div>
              </div>
            </div>
            <p className="bws-venue-preference-title">What kind of place should we look for?</p>
            <div className="bws-choice-grid bws-venue-choices">
              {VENUE_CHOICES.map((option) => (
                <label className="bws-choice-card" key={option.value}>
                  <input type="radio" name="venue-preference" checked={form.venuePreference === option.value} onChange={() => set("venuePreference", option.value)} />
                  <span><b>{option.label}</b><small>{option.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset className="bws-planner-step">
            <legend>What support would help?</legend>
            <p className="bws-step-help">These are requests, not automatic charges. The Wedding Desk will confirm availability and pricing before anything is booked.</p>
            <div className="bws-choice-grid bws-service-choices">
              {SERVICE_CHOICES.map((option) => (
                <label className="bws-choice-card" key={option.value}>
                  <input type="checkbox" checked={form.servicesWanted.includes(option.value)} onChange={() => toggleService(option.value)} />
                  <span><b>{option.label}</b><small>{option.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 4 && (
          <fieldset className="bws-planner-step">
            <legend>How should we plan together?</legend>
            <p className="bws-step-help">Request a pre-consultation with a Beckfords representative. Your time is not confirmed until the Wedding Desk replies.</p>
            <div className="bws-choice-grid bws-consultation-choices">
              {CONSULTATION_CHOICES.map((option) => (
                <label className="bws-choice-card" key={option.value}>
                  <input type="radio" name="consultation-method" checked={form.consultationMethod === option.value} onChange={() => set("consultationMethod", option.value)} />
                  <span><b>{option.label}</b><small>{option.hint}</small></span>
                </label>
              ))}
            </div>
            <div className="bws-form-grid bws-consultation-time">
              <div className="bws-field">
                <label htmlFor="consultation-date">Preferred consultation date <span>(optional)</span></label>
                <input id="consultation-date" type="date" value={form.consultationDate} onChange={(e) => set("consultationDate", e.target.value)} />
              </div>
              <div className="bws-field">
                <label htmlFor="consultation-time">Preferred time <span>(optional)</span></label>
                <input id="consultation-time" type="time" value={form.consultationTime} onChange={(e) => set("consultationTime", e.target.value)} />
              </div>
              <div className="bws-field bws-full">
                <label htmlFor="consultation-timezone">Your time zone <span>(optional)</span></label>
                <input id="consultation-timezone" type="text" maxLength={80} placeholder="Example: Eastern Time or London" value={form.consultationTimezone} onChange={(e) => set("consultationTimezone", e.target.value)} />
              </div>
            </div>
            <p className="bws-consultation-note">After the consultation, the Wedding Desk prepares the full brief and sends it to Antonio for review.</p>
          </fieldset>
        )}

        {step === 5 && (
          <fieldset className="bws-planner-step">
            <legend>Where should we reply?</legend>
            <p className="bws-step-help">Add your details and review the request below before sending it to the Wedding Desk.</p>
            <div className="bws-form-grid">
              <div className="bws-field bws-full">
                <label htmlFor="plan-names">Your names <span aria-hidden="true">*</span></label>
                <input id="plan-names" type="text" autoComplete="name" maxLength={120} placeholder="The two of you" required value={form.names} onChange={(e) => set("names", e.target.value)} />
              </div>
              <div className="bws-field">
                <label htmlFor="plan-email">Email <span>(optional)</span></label>
                <input id="plan-email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="bws-field">
                <label htmlFor="plan-country">Where are you travelling from? <span>(optional)</span></label>
                <input id="plan-country" type="text" maxLength={100} placeholder="Country or city" value={form.travellingFrom} onChange={(e) => set("travellingFrom", e.target.value)} />
              </div>
              <div className="bws-field bws-full">
                <label htmlFor="plan-notes">Anything else we should know? <span>(optional)</span></label>
                <textarea id="plan-notes" rows={4} maxLength={1600} placeholder="Your story, travel plans, traditions, or questions..." value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </div>
            <div className="bws-request-summary">
              <h3>Your request so far</h3>
              <dl>
                {summary.map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
              <p>This starts an enquiry, not a booking. The Beckfords Wedding Desk confirms your consultation, prepares the plan, and sends it to Antonio for review.</p>
            </div>
          </fieldset>
        )}

        <p className="bws-planner-error" role="alert">{error}</p>

        <div className="bws-planner-actions">
          {step > 0 && <button className="bws-button bws-planner-back" type="button" onClick={back} disabled={busy}>Back</button>}
          {step < STEP_LABELS.length - 1
            ? <button className="bws-button bws-button-dark" type="button" onClick={next}>Continue <span aria-hidden="true">→</span></button>
            : <button className="bws-button bws-button-dark" type="submit" disabled={busy}>{busy ? "Sending…" : "Send plan to the Wedding Desk"}</button>}
        </div>
      </form>
    </section>
  );
}
