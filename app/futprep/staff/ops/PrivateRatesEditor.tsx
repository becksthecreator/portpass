"use client";

import { useState } from "react";

// lead and assistant are the class rates, for the CEO only; null for an admin.
type Coach = { id: number; name: string; active: boolean; lead: string | null; assistant: string | null; private30PayCents: number | null; private60PayCents: number | null };

const field = (cents: number | null) => (cents === null ? "" : String(cents / 100));

// Coach pay rates on the operating map (brief 31, C5). Class rates are
// shown, to the CEO only, as Alex set them on Coach pay; what a coach is paid for a 30- and a
// 60-minute private session is set here by the CEO or an admin. Another
// length is worked out pro rata from these. A record of what Futprep owes;
// PortPass never pays coaches.
export function PrivateRatesEditor({ coaches }: { coaches: Coach[] }) {
  const [inputs, setInputs] = useState<Record<number, { p30: string; p60: string }>>(() => Object.fromEntries(coaches.map((c) => [c.id, { p30: field(c.private30PayCents), p60: field(c.private60PayCents) }])));
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(coach: Coach) {
    setError("");
    setMessage("");
    setBusy(coach.id);
    const response = await fetch("/api/futprep/staff/private-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coachId: coach.id, private30: inputs[coach.id]?.p30 ?? "", private60: inputs[coach.id]?.p60 ?? "" }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : { error: "No connection. Try again." };
    setBusy(null);
    if (!response?.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    setMessage(`Private session pay saved for ${coach.name}.`);
  }

  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="coach-manager-message" role="status">{message}</p>}
      <div className="pay-cards">
        {coaches.map((coach) => (
          <article className="pay-card" key={coach.id}>
            <div className="pay-card-head"><strong>{coach.name}</strong>{!coach.active && <span>profile hidden</span>}</div>
            {coach.lead !== null && (
              <dl>
                <div><dt>Class, lead</dt><dd>{coach.lead}</dd></div>
                <div><dt>Class, assistant</dt><dd>{coach.assistant}</dd></div>
              </dl>
            )}
            <div className="pay-rate-fields">
              <label><span>Private, 30 min ($)</span><input inputMode="decimal" value={inputs[coach.id]?.p30 ?? ""} placeholder="Not set" onChange={(e) => setInputs((all) => ({ ...all, [coach.id]: { ...all[coach.id], p30: e.target.value } }))} /></label>
              <label><span>Private, 60 min ($)</span><input inputMode="decimal" value={inputs[coach.id]?.p60 ?? ""} placeholder="Not set" onChange={(e) => setInputs((all) => ({ ...all, [coach.id]: { ...all[coach.id], p60: e.target.value } }))} /></label>
            </div>
            <button type="button" disabled={busy !== null} onClick={() => save(coach)}>{busy === coach.id ? "Saving…" : "Save"}</button>
          </article>
        ))}
      </div>
    </>
  );
}
