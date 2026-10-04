"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// "Request payment" in the demo: the request is made from the registration
// (the family and what they owe), with nothing typed, and opens ready to
// send.
export function DemoRequestPayment({ registrationId, button = false }: { registrationId: number; button?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/demo/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationId }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; id?: number; existing?: boolean }) : {};
    if (!response || !response.ok || !data.id) {
      setBusy(false);
      return setError(data.error ?? "The request could not be made.");
    }
    router.push(`/demo/payments/${data.id}${data.existing ? "" : "?created=1"}`);
  }

  return (
    <>
      <button className={button ? "primary-button" : "demo-request"} type="button" disabled={busy} onClick={() => void request()}>{busy ? "Opening…" : button ? "Request payment" : "Request payment →"}</button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
