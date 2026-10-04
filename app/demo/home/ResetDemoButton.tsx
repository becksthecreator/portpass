"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// "Reset demo" (brief 18, part B): platform owners only; the route checks.
export function ResetDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function reset() {
    if (!confirm("Reset the demo? Everything visitors changed goes back to the starting point.")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/demo/reset", { method: "POST" }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok) return setMessage(data.error ?? "The demo could not be reset.");
    setMessage("Demo reset.");
    router.refresh();
  }

  return (
    <>
      <button className="primary-button" type="button" disabled={busy} onClick={() => void reset()}>{busy ? "Resetting…" : "Reset demo"}</button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
