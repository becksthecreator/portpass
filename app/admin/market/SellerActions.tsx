"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SellerStatus } from "@/lib/market/sellers";

// Admin -> Market -> Sellers (brief 25, A5): one seller's decisions.
// Verify needs a licence number and a contact person on file (the database
// refuses it otherwise); suspending asks for a reason the seller sees.
export function SellerActions({ orgId, name, status, licenceNumber, contactPerson }: { orgId: number; name: string; status: SellerStatus; licenceNumber: string | null; contactPerson: string | null }) {
  const canVerify = Boolean(licenceNumber && contactPerson);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  async function act(action: "verify" | "suspend" | "unsuspend") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/market/sellers/${orgId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "suspend" ? { action, reason } : action === "verify" ? { action, licenceNumber, contactPerson } : { action }) });
      const data = (await r.json().catch(() => ({}))) as { error?: string; wentLive?: boolean };
      if (!r.ok) throw new Error(data.error ?? "That didn't save.");
      if (action === "verify") setNote(data.wentLive ? "Verified, and the business is live." : "Verified. Its page goes live once it has a published product, a phone or WhatsApp number and a way to be paid, and its shop is open.");
      setSuspending(false);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mkt-admin-actions">
      {status === "pending" && (
        <button type="button" className="admin-mini is-primary" disabled={busy || !canVerify} onClick={() => act("verify")} title={canVerify ? undefined : "Needs a licence number and a contact person on file"}>Verify</button>
      )}
      {(status === "pending" || status === "verified") && !suspending && (
        <button type="button" className="admin-mini" disabled={busy} onClick={() => setSuspending(true)}>Suspend</button>
      )}
      {status === "suspended" && (
        <button type="button" className="admin-mini" disabled={busy} onClick={() => act("unsuspend")}>Lift suspension</button>
      )}
      {suspending && (
        <form className="mkt-admin-suspend" onSubmit={(e) => { e.preventDefault(); void act("suspend"); }}>
          <label><span>Why? {name} sees this.</span><input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button type="submit" className="admin-mini is-primary" disabled={busy || !reason.trim()}>Suspend</button>
          <button type="button" className="admin-mini" disabled={busy} onClick={() => setSuspending(false)}>Cancel</button>
        </form>
      )}
      {note && <p className="admin-prices-note" role="status">{note}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
