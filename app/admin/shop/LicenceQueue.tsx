"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LicenceRequest } from "@/db/shop";
import { licenceLabel } from "@/lib/shop/rules";

export function LicenceQueue({ items, canDecide }: { items: LicenceRequest[]; canDecide: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function decide(productId: number, approve: boolean) {
    if (!approve && !window.confirm("Withdraw this approval? The product is unpublished at once.")) return;
    setBusy(productId);
    setError("");
    try {
      const r = await fetch(`/api/admin/shop/products/${productId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve }) });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "That didn't save.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) return <p className="admin-empty">No product uses another organisation&rsquo;s marks.</p>;
  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul className="admin-licence-list">
        {items.map((item) => (
          <li key={item.productId} className="admin-section-card admin-licence">
            {item.photo && <img src={item.photo} alt="" width={64} height={64} />}
            <div className="admin-licence-main">
              <strong>{item.title}</strong>
              <span>{item.orgName} · {licenceLabel(item.licenceKind) ?? "No kind chosen"}{item.approvedAt ? " · Approved" : " · Waiting"}{item.isPublished ? " · Published" : ""}</span>
              <p>{item.licenceNote || "No licence note yet."}</p>
            </div>
            {canDecide && (
              <div className="admin-licence-actions">
                {item.approvedAt ? (
                  <button type="button" className="admin-mini" disabled={busy === item.productId} onClick={() => decide(item.productId, false)}>Withdraw</button>
                ) : (
                  <button type="button" className="admin-mini is-primary" disabled={busy === item.productId || !item.licenceNote || !item.licenceKind} onClick={() => decide(item.productId, true)}>Approve</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
