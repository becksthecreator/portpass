"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// One button: the signed-in person becomes the business's owner.
export function ClaimButton({ token, businessName }: { token: string; businessName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function claim() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { next?: string; error?: string }) : {};
    if (!response || !response.ok) {
      setBusy(false);
      setError(data.error ?? "Could not claim the business. Try again.");
      return;
    }
    router.push(data.next ?? "/where-to");
  }

  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="auth-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={claim}>{busy ? "One moment…" : `Yes, ${businessName} is mine →`}</button>
      </div>
    </>
  );
}
