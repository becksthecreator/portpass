"use client";

import { FormEvent, useEffect, useState } from "react";

type Props = { mode: "enroll" | "challenge"; factorId: string | null; next: string };

// Two-step login for the Admin Control Center. First time: an
// authenticator QR (plus the secret for manual entry) and a code. After
// that: just the code. Nothing here is stored in the browser.
export function VerifyForm({ mode, factorId: initialFactorId, next }: Props) {
  const [factorId, setFactorId] = useState<string | null>(initialFactorId);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "enroll") return;
    let cancelled = false;
    fetch("/api/admin/mfa/enroll", { method: "POST" })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { factorId?: string; qr?: string; secret?: string; error?: string };
        if (!r.ok) throw new Error(data.error ?? "Could not start two-step setup.");
        if (cancelled) return;
        setFactorId(data.factorId ?? null);
        setQr(data.qr ?? null);
        setSecret(data.secret ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start two-step setup.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId, code, next }),
      });
      const data = (await r.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!r.ok) throw new Error(data.error ?? "That code didn’t work.");
      window.location.assign(data.next ?? "/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn’t work.");
      setBusy(false);
    }
  }

  return (
    <form className="auth-form admin-verify" onSubmit={submit}>
      {mode === "enroll" && (
        <div className="admin-verify-enrol">
          <p className="auth-lead">Scan this with Google Authenticator, 1Password, Authy or any authenticator app, then enter the code it shows.</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URI from Supabase Auth
            <img className="admin-verify-qr" src={qr} alt="QR code for your authenticator app" width={200} height={200} />
          ) : (
            <p className="auth-hint">{error ? "" : "Preparing your QR code…"}</p>
          )}
          {secret && (
            <details className="admin-verify-secret">
              <summary>Can&rsquo;t scan? Enter the key by hand</summary>
              <code>{secret}</code>
            </details>
          )}
        </div>
      )}
      <label>
        <span>6-digit code</span>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={!factorId} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="auth-actions">
        <button className="primary-button" type="submit" disabled={busy || !factorId || code.length !== 6}>{busy ? "Checking…" : mode === "enroll" ? "Turn on two-step login →" : "Continue →"}</button>
      </div>
    </form>
  );
}
