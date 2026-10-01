"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentTeamMember } from "@/db/paymentRequests";

const ROLE: Record<string, string> = { org_owner: "Owner", org_admin: "Admin", org_staff: "Staff", org_viewer: "Viewer" };

// Who handles payments: owners and admins always, staff once the owner
// switches it on for them, viewers never.
export function PaymentTeam({ apiBase, members, canManage }: { apiBase: string; members: PaymentTeamMember[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle(userId: string, allowed: boolean) {
    setBusy(userId);
    setError("");
    const response = await fetch(`${apiBase}/team`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, allowed }) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!response.ok) return setError(data.error ?? "Could not change that.");
    router.refresh();
  }

  return (
    <section className="preq-card" aria-labelledby="preq-team">
      <h2 id="preq-team">Who handles payments</h2>
      <p className="preq-last">Owners and admins always can. Staff only once {canManage ? "you switch it on" : "an owner switches it on"} for them.</p>
      {error && <p className="preq-error" role="alert">{error}</p>}
      <ul className="preq-team">
        {members.map((m) => {
          const always = m.role === "org_owner" || m.role === "org_admin";
          return (
            <li key={m.userId}>
              <div><strong>{m.name}</strong><span>{ROLE[m.role] ?? m.role}</span></div>
              {always ? (
                <span className="preq-pill">Always</span>
              ) : m.role === "org_staff" ? (
                <label className="preq-check">
                  <input type="checkbox" checked={m.canManagePayments} disabled={!canManage || busy !== null} onChange={(e) => toggle(m.userId, e.target.checked)} />
                  <span>Payments</span>
                </label>
              ) : (
                <span className="preq-pill is-void">No</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
