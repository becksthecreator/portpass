"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

// Sign-up asks only for an email (brief 18, F2), so the name is added
// here: it is what a business sees when it checks the Member Pass.
export function NameForm({ current = "", compact = false }: { current?: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: name }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save your name. Please try again.");
      if (compact) setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your name. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button className="auth-text-button account-name-change" type="button" onClick={() => setOpen(true)}>Change my name</button>;

  return (
    <form className="account-name" onSubmit={save}>
      <label>
        <span>{compact ? "Your name" : "What's your name?"}</span>
        <input autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {!compact && <small>Businesses see your first name when you show your Member Pass.</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Save my name"}</button>
    </form>
  );
}
