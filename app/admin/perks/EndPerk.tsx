"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// End a perk that breaks the rules. The reason is required and logged;
// what members have already used stays on the record.
export function EndPerk({ id, title, business }: { id: number; title: string; business: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function end(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirm(`End "${title}" for ${business}? It can't be restarted: the business would publish a new one.`)) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/perks/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok) return setError(data.error ?? "Could not end the perk.");
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" className="admin-mini" onClick={() => setOpen(true)}>End</button>;
  return (
    <form className="admin-perk-end" onSubmit={end}>
      <label><span>Why it is being ended (logged)</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} autoFocus /></label>
      <span className="perk-confirm">
        <button type="submit" className="admin-mini is-danger" disabled={busy || reason.trim().length < 5}>{busy ? "Ending…" : "End the perk"}</button>
        <button type="button" className="admin-mini" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </span>
      {error && <span className="form-error" role="alert">{error}</span>}
    </form>
  );
}
