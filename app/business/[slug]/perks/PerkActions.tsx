"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Publish a draft, or end a perk. Ending asks first: it can't be undone.
export function PerkActions({ orgId, perkId, status, title }: { orgId: number; perkId: number; status: "draft" | "live"; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "publish" | "end" | "discard") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/business/orgs/${orgId}/perks/${perkId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That didn't work. Try again.");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="perk-actions">
      {status === "draft" && <button className="admin-mini is-primary" type="button" disabled={busy} onClick={() => void act("publish")}>{busy ? "Publishing…" : "Publish"}</button>}
      {!confirming ? (
        <button className="admin-mini" type="button" disabled={busy} onClick={() => setConfirming(true)}>{status === "draft" ? "Discard" : "End this perk"}</button>
      ) : (
        <span className="perk-confirm" role="group" aria-label={`End ${title}`}>
          <span>{status === "draft" ? "Discard this draft?" : "End it? Members who already used it keep it. It can't be restarted."}</span>
          <button className="admin-mini is-danger" type="button" disabled={busy} onClick={() => void act(status === "draft" ? "discard" : "end")}>{busy ? (status === "draft" ? "Discarding…" : "Ending…") : status === "draft" ? "Yes, discard" : "Yes, end it"}</button>
          <button className="admin-mini" type="button" disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
        </span>
      )}
      {error && <span className="form-error" role="alert">{error}</span>}
    </span>
  );
}
