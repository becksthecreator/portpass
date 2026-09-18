"use client";

import { FormEvent, useState } from "react";

export function InterestForm({ category, placeholder }: { category: "venues" | "events" | "entertainment"; placeholder: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() && !email.trim() && !phone.trim()) {
      setError("Leave a name, email or phone so we can reach you.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name, email, phone, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save this. Please try again.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="confirmation" aria-live="polite">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow"><span className="eyebrow-dot" />Noted</div>
        <h2>We&rsquo;ll be in touch.</h2>
        <p>You&rsquo;re on the list for when this opens.</p>
      </section>
    );
  }

  return (
    <form className="application-form" onSubmit={submit}>
      <div className="form-grid">
        <label><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label><span>Phone</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="full-field"><span>{placeholder}</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-submit">
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Sending…" : "Keep me posted →"}</button>
      </div>
    </form>
  );
}
