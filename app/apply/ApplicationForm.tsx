"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function ApplicationForm() {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("We couldn’t submit your application. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <section className="confirmation" aria-live="polite">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow"><span className="eyebrow-dot" />Application received</div>
        <h2>Thanks for applying.</h2>
        <p>We&apos;ll review your organization and follow up with the next steps for PortPass early access.</p>
        <Link className="primary-button" href="/">Back to PortPass →</Link>
      </section>
    );
  }

  return (
    <form className="application-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label><span>Organization name *</span><input name="organizationName" required /></label>
        <label><span>Contact person *</span><input name="contactPerson" required /></label>
        <label><span>Email *</span><input name="email" type="email" required /></label>
        <label><span>Phone *</span><input name="phone" type="tel" required /></label>
        <label><span>Sport or activity type *</span><input name="activityType" required /></label>
        <label><span>Main location *</span><input name="mainLocation" required /></label>
        <label><span>Approximate number of players *</span><input name="playerCount" required /></label>
        <label className="full-field"><span>What do you need the most help with? *</span><textarea name="helpNeeded" rows={4} required /></label>
        <label className="full-field"><span>Tell us about your organization *</span><textarea name="description" rows={5} required /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-submit">
        <p>By submitting, you&apos;re asking to join the PortPass early-access pilot.</p>
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Submitting…" : "Submit application →"}</button>
      </div>
    </form>
  );
}
