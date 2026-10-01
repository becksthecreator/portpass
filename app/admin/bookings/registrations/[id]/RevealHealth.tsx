"use client";

import { useState, type FormEvent } from "react";

type Revealed = { purgedAt: string | null; fields: Array<{ label: string; value: string; deleted?: boolean }> };

// Hidden until someone says why they need it (brief 08, 1.6). The details
// are fetched only after the reason is logged, live in this screen's
// memory only, and are gone on Hide or on leaving the page.
export function RevealHealth({ registrationId, reasonMin, reasonMax }: { registrationId: number; reasonMin: number; reasonMax: number }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Revealed | null>(null);

  async function reveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/bookings/registrations/${registrationId}/reveal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }), cache: "no-store" }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as Partial<Revealed> & { error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok || !Array.isArray(data.fields)) {
      setError(data.error ?? "Could not show the details. Nothing was shown.");
      return;
    }
    setRevealed({ purgedAt: data.purgedAt ?? null, fields: data.fields });
    setReason("");
  }

  if (revealed) {
    return (
      <div className="admin-reveal is-open">
        <p className="admin-form-note">Shown to you once. This was logged with your reason.</p>
        <dl className="admin-facts">
          {revealed.fields.map((field) => (
            <div key={field.label}><dt>{field.label}</dt><dd>{field.value || (field.deleted ? "Deleted" : "Nothing given")}</dd></div>
          ))}
        </dl>
        <button type="button" className="admin-action" onClick={() => setRevealed(null)}>Hide</button>
      </div>
    );
  }

  return (
    <form className="admin-reveal" onSubmit={reveal}>
      <p className="admin-form-note">Hidden. Allergies, medical conditions, medications, special needs, the emergency contact, who may collect the child and the parent&rsquo;s notes are shown only when you give a reason. Each look is written to the audit log with your name.</p>
      <label htmlFor="reveal-reason">Why do you need to see this?</label>
      <textarea id="reveal-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={reasonMin} maxLength={reasonMax} rows={2} required placeholder="For example: the coach called about an allergy before Saturday's class" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="admin-action is-primary" disabled={busy || reason.trim().length < reasonMin}>{busy ? "Checking…" : "Reveal"}</button>
    </form>
  );
}
