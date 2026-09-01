"use client";

import { FormEvent, useState } from "react";

export function StaffLoginForm({ returnTo }: { returnTo: string }) {
  const [role,setRole] = useState<"admin"|"coach">(returnTo.includes("/coach") ? "coach" : "admin");
  const [pin,setPin] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/futprep/lil-kickers/staff/session", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({role,pin}),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Access denied.");
      window.location.href = role === "coach"
        ? "/futprep/lil-kickers/staff/coach"
        : "/futprep/lil-kickers/staff/admin";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access denied.");
    } finally { setBusy(false); }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <div className="staff-role-choice">
        <button className={role==="admin" ? "is-active" : ""} type="button" onClick={()=>setRole("admin")}><strong>Kiki</strong><span>Admin & payments</span></button>
        <button className={role==="coach" ? "is-active" : ""} type="button" onClick={()=>setRole("coach")}><strong>Coach Bex</strong><span>Roster & attendance</span></button>
      </div>
      <label><span>Staff PIN</span><input inputMode="numeric" autoComplete="current-password" type="password" value={pin} onChange={(e)=>setPin(e.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Checking…" : "Open staff workspace →"}</button>
    </form>
  );
}
