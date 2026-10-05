"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// "Cancel this request" on the customer's page (brief 19, A5), offered only
// while the business hasn't answered. It asks once before cancelling.
export function CancelBooking({ token, businessName }: { token: string; businessName: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/bookings/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not cancel it. Try again.");
        setBusy(false);
        return;
      }
      router.replace(`/booking/${token}`);
      router.refresh();
    } catch {
      setError("Could not reach PortPass. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <div className="paypage-said">
        <button type="button" className="paypage-btn is-small" onClick={() => setAsking(true)}>Cancel this request</button>
      </div>
    );
  }
  return (
    <div className="paypage-said" role="group" aria-label="Cancel this request">
      <p className="paypage-muted">Cancel your request? {businessName} is told, and nothing is booked.</p>
      <div className="paypage-actions">
        <button type="button" className="paypage-btn is-solid is-small" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Yes, cancel it"}</button>
        <button type="button" className="paypage-btn is-small" disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
      </div>
      {error && <p className="paypage-error" role="alert">{error}</p>}
    </div>
  );
}
