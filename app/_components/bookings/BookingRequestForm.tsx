"use client";

import { FormEvent, useState } from "react";
import { PhoneInput } from "@/app/_components/PhoneInput";
import { PrivacyNote } from "@/app/_components/PrivacyNote";
import type { Attribution } from "@/lib/attribution";

// "Request to book" (brief 19, part A): one screen. When, the details,
// and who is asking. For an offering for under-18s it adds the guardian
// line: the child's first name and a tick that the adult is their parent
// or guardian. No health details are asked for. Sending it goes to the
// customer's own page for the request, which shows the reference.

type Field = "requestedDate" | "requestedTime" | "customerName" | "customerPhone" | "customerEmail" | "childFirstName" | "guardianConfirmed";

export function BookingRequestForm({
  business,
  offering,
  quantity,
  minDate,
  maxDate,
  attribution,
}: {
  business: { slug: string; name: string; pageHref: string };
  offering: { slug: string; name: string; forChildren: boolean };
  quantity: { label: string; placeholder: string };
  minDate: string;
  maxDate: string;
  attribution: Attribution;
}) {
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [durationOrQty, setDurationOrQty] = useState("");
  const [locationText, setLocationText] = useState("");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [childFirstName, setChildFirstName] = useState("");
  const [guardianConfirmed, setGuardianConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: Field } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationSlug: business.slug,
          offeringSlug: offering.slug,
          requestedDate,
          requestedTime,
          durationOrQty,
          locationText,
          notes,
          customerName,
          customerPhone,
          customerEmail,
          childFirstName: offering.forChildren ? childFirstName : "",
          guardianConfirmed: offering.forChildren ? guardianConfirmed : false,
          attribution,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { bookingUrl?: string; error?: string; field?: Field };
      if (!response.ok || !data.bookingUrl) {
        setError({ text: data.error ?? "We couldn't send your request. Please try again.", field: data.field });
        setBusy(false);
        return;
      }
      // The customer's own page for this request: the reference, where it
      // stands, and Cancel while nobody has answered.
      window.location.assign(`${data.bookingUrl}?sent=1`);
    } catch {
      setError({ text: "We couldn't reach PortPass. Check your connection and try again." });
      setBusy(false);
    }
  }

  const invalid = (field: Field) => (error?.field === field ? { "aria-invalid": true as const, "aria-describedby": "bkg-error" } : {});

  return (
    <form className="bkg-form" onSubmit={submit} noValidate={false}>
      <fieldset>
        <legend>When</legend>
        <div className="bkg-two">
          <label>
            <span>Date *</span>
            <input type="date" required min={minDate} max={maxDate} value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} {...invalid("requestedDate")} />
          </label>
          <label>
            <span>Time</span>
            <input type="time" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} {...invalid("requestedTime")} />
            <small>Leave it blank if you&rsquo;re flexible.</small>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Details</legend>
        <label>
          <span>{quantity.label}</span>
          <input type="text" maxLength={60} value={durationOrQty} onChange={(e) => setDurationOrQty(e.target.value)} placeholder={quantity.placeholder} />
        </label>
        <label>
          <span>Where</span>
          <input type="text" maxLength={200} value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="An address or area, if it comes to you" autoComplete="street-address" />
        </label>
        <label>
          <span>Anything {business.name} should know</span>
          <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </fieldset>

      <fieldset>
        <legend>{offering.forChildren ? "You, the parent or guardian" : "You"}</legend>
        <label>
          <span>Your name *</span>
          <input type="text" required maxLength={120} value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" {...invalid("customerName")} />
        </label>
        <label>
          <span>Phone or WhatsApp *</span>
          <PhoneInput required value={customerPhone} onChange={setCustomerPhone} />
        </label>
        <label>
          <span>Email *</span>
          <input type="email" required maxLength={254} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} autoComplete="email" inputMode="email" {...invalid("customerEmail")} />
          <small>Your confirmation goes here.</small>
        </label>
        {offering.forChildren && (
          <>
            <label>
              <span>Child&rsquo;s first name *</span>
              <input type="text" required maxLength={60} value={childFirstName} onChange={(e) => setChildFirstName(e.target.value)} {...invalid("childFirstName")} />
              <small>First name only. No health details are needed to ask for a date.</small>
            </label>
            <label className="bkg-tick">
              <input type="checkbox" required checked={guardianConfirmed} onChange={(e) => setGuardianConfirmed(e.target.checked)} {...invalid("guardianConfirmed")} />
              <span>I am this child&rsquo;s parent or guardian, and I am 18 or over.</span>
            </label>
          </>
        )}
      </fieldset>

      {error && <p className="form-error" id="bkg-error" role="alert">{error.text}</p>}

      <div className="bkg-submit">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Sending…" : "Send request →"}</button>
        <p>Sending this books nothing and charges nothing. {business.name} replies by email, and you pay them directly once it&rsquo;s confirmed. <a href={business.pageHref}>Back to {business.name}</a></p>
        <PrivacyNote about="booking request" childDetails={offering.forChildren} />
      </div>
    </form>
  );
}
