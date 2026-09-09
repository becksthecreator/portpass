"use client";

import { FormEvent, useState } from "react";

const ROLE_DESTINATION: Record<string, string> = {
  admin: "/futprep/lil-kickers/staff/admin",
  coach: "/futprep/lil-kickers/staff/coach",
  ceo: "/futprep/lil-kickers/staff/ceo",
  helper: "/futprep/lil-kickers/staff/coach",
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
      const response = await fetch("/api/futprep/lil-kickers/staff/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey, pin }),
      });
      const data = (await response.json()) as { error?: string; role?: string };
      if (!response.ok) throw new Error(data.error ?? "Access denied.");
      window.location.href = ROLE_DESTINATION[data.role ?? ""] ?? returnTo;
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
