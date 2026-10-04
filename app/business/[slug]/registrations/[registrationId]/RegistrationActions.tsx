"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Confirm a place, re-open it, or cancel it. Each press is logged.
// `endpoint` is where the change is sent: the business's own route, or the
// demo's.
export function RegistrationActions({ endpoint, status }: { endpoint: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function change(next: "confirmed" | "pending" | "cancelled") {
    if (next === "cancelled" && !confirm("Cancel this registration? The place opens up for someone else.")) return;
    setBusy(next);
    setError("");
    const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!response.ok) return setError(data.error ?? "Could not change it.");
    router.refresh();
  }

  return (
    <div className="reg-actions">
      {status !== "confirmed" && status !== "cancelled" && <button className="primary-button" type="button" disabled={busy !== ""} onClick={() => void change("confirmed")}>{busy === "confirmed" ? "Confirming…" : "Confirm the place"}</button>}
      {status === "cancelled" && <button className="primary-button" type="button" disabled={busy !== ""} onClick={() => void change("pending")}>{busy === "pending" ? "Re-opening…" : "Re-open it"}</button>}
      {status !== "cancelled" && <button className="auth-text-button" type="button" disabled={busy !== ""} onClick={() => void change("cancelled")}>{busy === "cancelled" ? "Cancelling…" : "Cancel the registration"}</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
