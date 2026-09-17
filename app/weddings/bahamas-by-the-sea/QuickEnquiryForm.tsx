"use client";

import { FormEvent, useState } from "react";

const WHATSAPP_NUMBER = "12424241262";

function formatDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(y, m - 1, d));
}

function buildWhatsAppMessage(input: { couple: string; ceremony: string; date: string; guests: string; email: string; story: string }) {
  const lines = [
    "Hello Beckfords Wedding Desk! We found Bahamas Weddings By The Sea and would like to start a pre-consultation.",
    "",
    `Our names: ${input.couple}`,
    `Celebration: ${input.ceremony}`,
    `Preferred date: ${input.date || "Still deciding"}`,
  ];
  if (input.guests) lines.push(`Guests (excluding us): ${input.guests}`);
  if (input.email) lines.push(`Email: ${input.email}`);
  if (input.story) lines.push("", `Our ideas and travel plans: ${input.story}`);
  lines.push("", "Please help us plan the next steps and prepare the details for Antonio to review.");
  return lines.join("\n");
}

export function QuickEnquiryForm() {
  const [couple, setCouple] = useState("");
  const [ceremony, setCeremony] = useState("Wedding ceremony");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("");
  const [email, setEmail] = useState("");
  const [story, setStory] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Stable for the life of the mounted form, so a double-click or a retried
  // request after a network hiccup lands as one lead, not two.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const today = new Date().toISOString().slice(0, 10);

  function whatsAppHref() {
    const message = buildWhatsAppMessage({ couple: couple.trim(), ceremony, date: formatDate(date), guests, email: email.trim(), story: story.trim() });
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!couple.trim()) {
      setStatus("Please enter your names.");
      return;
    }
    if (!contactConsent) {
      setStatus("Please confirm we can contact you about this enquiry.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/weddings/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          names: couple.trim(),
          ceremonyType: ceremony,
          preferredWeddingDate: date || null,
          guestCount: guests ? Number(guests) : null,
          email: email.trim(),
          notes: story.trim(),
          contactConsent,
        }),
      });
      if (!response.ok) throw new Error("save failed");
      setSubmitted(true);
      setStatus("Thank you — the Wedding Desk has your enquiry and will reach out. Your date has not been reserved yet.");
    } catch {
      setStatus("We couldn't save that just now. Please message the Wedding Desk on WhatsApp instead — the button below has your details ready.");
    }
    setBusy(false);
  }

  return (
    <form id="wedding-enquiry" onSubmit={onSubmit}>
      <div className="bws-form-grid">
        <div className="bws-field bws-full">
          <label htmlFor="couple">Your names <span aria-hidden="true">*</span></label>
          <input id="couple" type="text" autoComplete="name" maxLength={120} required value={couple} onChange={(e) => setCouple(e.target.value)} />
        </div>
        <div className="bws-field">
          <label htmlFor="ceremony-type">What are you celebrating?</label>
          <select id="ceremony-type" value={ceremony} onChange={(e) => setCeremony(e.target.value)}>
            <option>Wedding ceremony</option>
            <option>Intimate wedding</option>
            <option>Vow renewal</option>
            <option>Still exploring</option>
          </select>
        </div>
        <div className="bws-field">
          <label htmlFor="wedding-date">Preferred date <span>(optional)</span></label>
          <input id="wedding-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          <small>Still deciding? Leave this blank.</small>
        </div>
        <div className="bws-field">
          <label htmlFor="guest-count">Number of guests <span>(optional)</span></label>
          <input id="guest-count" type="number" min={0} max={9999} step={1} inputMode="numeric" placeholder="Not including the two of you" value={guests} onChange={(e) => setGuests(e.target.value)} />
        </div>
        <div className="bws-field">
          <label htmlFor="email">Your email <span>(optional)</span></label>
          <input id="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="bws-field bws-full">
          <label htmlFor="wedding-story">What do you have in mind? <span>(optional)</span></label>
          <textarea id="wedding-story" rows={3} maxLength={1800} placeholder="A beach you love, your travel dates, a special tradition…" value={story} onChange={(e) => setStory(e.target.value)} />
        </div>
        <div className="bws-field bws-full bws-consent-field">
          <label>
            <input type="checkbox" checked={contactConsent} onChange={(e) => setContactConsent(e.target.checked)} />
            <span>You can contact me about this enquiry <span aria-hidden="true">*</span></span>
          </label>
        </div>
      </div>
      <button className="bws-button bws-button-dark" type="submit" disabled={busy}>{submitted ? "Sent to the Wedding Desk ✓" : "Send to the Wedding Desk"}</button>
      <p className="bws-form-note">Availability and pricing are confirmed directly with Antonio. Your date has not been reserved yet.</p>
      <p className="bws-enquiry-status" role="status" aria-live="polite">{status}</p>
      <a className="bws-text-link bws-whatsapp-fallback" href={whatsAppHref()} target="_blank" rel="noopener noreferrer">Prefer WhatsApp? Message the Wedding Desk directly <span aria-hidden="true">↗</span></a>
    </form>
  );
}
