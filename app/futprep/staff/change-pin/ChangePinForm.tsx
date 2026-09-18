"use client";

import { FormEvent, useState } from "react";

export function ChangePinForm() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPin !== confirmPin) return setError("New PIN and confirmation don't match.");
    if (newPin.length < 4 || !/^\d+$/.test(newPin)) return setError("New PIN must be at least 4 digits.");

    setBusy(true);
    try {
      const response = await fetch("/api/futprep/staff/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update PIN.");
      setDone(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update PIN.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="change-pin-form">
        <p className="coach-manager-message">Your PIN has been updated. Use it next time you sign in.</p>
        <button type="button" className="secondary-button" onClick={() => setDone(false)}>Change it again</button>
      </div>
    );
  }

  return (
    <form className="change-pin-form" onSubmit={submit}>
      <label><span>Current PIN</span><input type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} required /></label>
      <label><span>New PIN (4+ digits)</span><input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} required /></label>
      <label><span>Confirm new PIN</span><input type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Updating…" : "Update PIN →"}</button>
    </form>
  );
}
