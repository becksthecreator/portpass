"use client";

import { FormEvent, useState } from "react";

export function BootstrapAdminForm() {
  const [name, setName] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (pin !== confirmPin) return setError("PIN and confirmation don't match.");
    setBusy(true);
    try {
      const response = await fetch("/api/futprep/staff/bootstrap-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, accountKey, pin }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not create the admin account.");
      window.location.href = "/futprep/lil-kickers/staff/admin";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the admin account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label><span>Your name</span><input value={name} onChange={(e)=>setName(e.target.value)} required /></label>
      <label><span>Account name</span><input value={accountKey} onChange={(e)=>setAccountKey(e.target.value)} placeholder="lowercase, no spaces" pattern="[a-z0-9_-]{3,40}" autoComplete="username" autoCapitalize="none" required /></label>
      <label><span>PIN (4+ digits)</span><input inputMode="numeric" type="password" autoComplete="new-password" value={pin} onChange={(e)=>setPin(e.target.value)} required /></label>
      <label><span>Confirm PIN</span><input inputMode="numeric" type="password" autoComplete="new-password" value={confirmPin} onChange={(e)=>setConfirmPin(e.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Creating…" : "Create admin account →"}</button>
    </form>
  );
}
