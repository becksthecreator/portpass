"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { actionsFor, DECLINE_REASON_MAX, DECLINE_REASON_MIN, type BookingAction, type BookingStatus } from "@/lib/bookings/rules";

// The buttons on one booking request (brief 19, A4). Confirm emails the
// customer their confirmation; Decline asks for a reason first and emails
// it. Each press is one request and is logged. `endpoint` is the
// business's own route for this booking.
export function BookingActions({ endpoint, status, customerFirstName }: { endpoint: string; status: BookingStatus; customerFirstName: string }) {
  const router = useRouter();
  const reasonId = useId();
  const [busy, setBusy] = useState<BookingAction | "">("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const available = actionsFor(status);

  async function send(action: BookingAction) {
    setBusy(action);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "decline" ? { action, reason } : { action }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not change it.");
        return;
      }
      setDeclining(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach PortPass. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  if (available.length === 0) return null;
  const who = customerFirstName || "the customer";

  return (
    <div className="bkg-actions">
      {!declining && (
        <div className="bkg-buttons">
          {available.includes("confirm") && (
            <button className="primary-button" type="button" disabled={busy !== ""} onClick={() => void send("confirm")}>{busy === "confirm" ? "Confirming…" : "Confirm"}</button>
          )}
          {available.includes("done") && (
            <button className="primary-button" type="button" disabled={busy !== ""} onClick={() => void send("done")}>{busy === "done" ? "Saving…" : "Mark done"}</button>
          )}
          {available.includes("decline") && (
            <button className="auth-text-button" type="button" disabled={busy !== ""} onClick={() => { setDeclining(true); setError(""); }}>Decline</button>
          )}
          {available.includes("reopen") && (
            <button className="auth-text-button" type="button" disabled={busy !== ""} onClick={() => void send("reopen")}>{busy === "reopen" ? "Re-opening…" : "Re-open it"}</button>
          )}
        </div>
      )}
      {!declining && available.includes("confirm") && <p className="bkg-hint">Confirm emails {who} their confirmation. Decline asks you why, and emails them that.</p>}
      {declining && (
        <form
          className="bkg-decline"
          onSubmit={(event) => {
            event.preventDefault();
            void send("decline");
          }}
        >
          <label htmlFor={reasonId}>Why can&rsquo;t you take it? <small>{who} is emailed this.</small></label>
          <textarea id={reasonId} rows={3} maxLength={DECLINE_REASON_MAX} required minLength={DECLINE_REASON_MIN} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="We're fully booked that day. Could you do the Sunday instead?" />
          <div className="bkg-buttons">
            <button className="primary-button" type="submit" disabled={busy !== "" || reason.trim().length < DECLINE_REASON_MIN}>{busy === "decline" ? "Declining…" : "Decline and email the reason"}</button>
            <button className="auth-text-button" type="button" disabled={busy !== ""} onClick={() => { setDeclining(false); setError(""); }}>Keep it</button>
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
