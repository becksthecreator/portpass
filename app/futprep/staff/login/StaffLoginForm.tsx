"use client";

import { FormEvent, useState } from "react";

const ROLE_DESTINATION: Record<string, string> = {
  admin: "/futprep/staff/admin",
  coach: "/futprep/staff/coach",
  ceo: "/futprep/staff/ceo",
  helper: "/futprep/staff/coach",
};

export function StaffLoginForm({ returnTo }: { returnTo: string }) {
  const [accountKey, setAccountKey] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/futprep/staff/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey, pin }),
      });
      const data = (await response.json()) as { error?: string; role?: string };
      if (!response.ok) throw new Error(data.error ?? "Access denied.");
      // A link to one session's roster (the Saturday nudge) is followed;
      // otherwise each role goes to its own home.
      const roster = returnTo.startsWith("/futprep/staff/coach?session=") && ["coach", "ceo", "helper"].includes(data.role ?? "");
      window.location.href = roster ? returnTo : ROLE_DESTINATION[data.role ?? ""] ?? returnTo;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access denied.");
    } finally { setBusy(false); }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label><span>Account name</span><input value={accountKey} onChange={(e)=>setAccountKey(e.target.value)} autoComplete="username" autoCapitalize="none" required /></label>
      <label><span>Staff PIN</span><input inputMode="numeric" autoComplete="current-password" type="password" value={pin} onChange={(e)=>setPin(e.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Checking…" : "Open staff workspace →"}</button>
    </form>
  );
}
