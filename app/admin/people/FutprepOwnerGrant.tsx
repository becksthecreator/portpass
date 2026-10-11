"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Brief 31 (A4, after review): a founder gives owner access to Futprep on
// PortPass, after checking with the person Futprep's staff marked.
export function FutprepOwnerGrant({ staffId, name }: { staffId: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function grant() {
    if (!confirm(`Give ${name} owner access to Futprep? They get its owner dashboard, payments and children's medical details. Check with ${name} first.`)) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/futprep-owner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!response?.ok) {
      setError(data.error ?? "That didn't finish. Refresh the page to see what was saved.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="admin-row-actions">
      <button type="button" className="admin-action" disabled={busy} onClick={grant}>{busy ? "Giving access…" : "Give owner access"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
