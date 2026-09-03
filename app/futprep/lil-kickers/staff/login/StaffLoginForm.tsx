"use client";

import { FormEvent, useState } from "react";

type Account = "admin" | "coach" | "ceo" | "kione" | "adon";

const destinations: Record<Account,string> = {
  admin: "/futprep/lil-kickers/staff/admin",
  coach: "/futprep/lil-kickers/staff/coach",
  ceo: "/futprep/lil-kickers/staff/ceo",
  kione: "/futprep/lil-kickers/staff/coach",
  adon: "/futprep/lil-kickers/staff/team",
};

export function StaffLoginForm({ returnTo }: { returnTo: string }) {
  const initialAccount: Account = returnTo.includes("/coach")
    ? "coach"
    : returnTo.includes("/ceo")
      ? "ceo"
      : "admin";
  const [account,setAccount] = useState<Account>(initialAccount);
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
        body:JSON.stringify({account,pin}),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Access denied.");
      window.location.href = destinations[account];
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access denied.");
    } finally { setBusy(false); }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <div className="staff-role-choice staff-role-choice-five">
        <button className={account==="admin" ? "is-active" : ""} type="button" onClick={()=>setAccount("admin")}>
          <strong>Kiki</strong><span>Registrations & payments</span>
        </button>
        <button className={account==="coach" ? "is-active" : ""} type="button" onClick={()=>setAccount("coach")}>
          <strong>Coach Bex</strong><span>Sessions, roster & attendance</span>
        </button>
        <button className={account==="ceo" ? "is-active" : ""} type="button" onClick={()=>setAccount("ceo")}>
          <strong>Coach Alex</strong><span>CEO · full oversight</span>
        </button>
        <button className={account==="kione" ? "is-active" : ""} type="button" onClick={()=>setAccount("kione")}>
          <strong>Coach Kione</strong><span>Coaching workspace</span>
        </button>
        <button className={account==="adon" ? "is-active" : ""} type="button" onClick={()=>setAccount("adon")}>
          <strong>Adon</strong><span>Head Tech Admin · team operations</span>
        </button>
      </div>
      <label><span>Staff PIN</span><input inputMode="numeric" autoComplete="current-password" type="password" value={pin} onChange={(e)=>setPin(e.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Checking…" : "Open staff workspace →"}</button>
    </form>
  );
}
