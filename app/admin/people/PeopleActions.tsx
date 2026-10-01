"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLES = [
  { value: "org_owner", label: "Owner" },
  { value: "org_admin", label: "Admin" },
  { value: "org_staff", label: "Staff" },
  { value: "org_viewer", label: "Viewer" },
];

async function send(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; outcome?: string; sessions?: number }> {
  const response = await fetch("/api/admin/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; outcome?: string; sessions?: number }) : {};
  return { ok: Boolean(response?.ok), ...data };
}

// One membership: change the role, or remove the person from the business.
export function MembershipControl({ userId, personName, organizationId, organizationName, role }: { userId: string; personName: string; organizationId: number; organizationName: string; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const result = await send({ userId, organizationId, ...body });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "That didn't work. Nothing was changed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="admin-member">
      <span>{organizationName}</span>
      <label>
        <span className="sr-only">Role of {personName} in {organizationName}</span>
        <select value={role} disabled={busy} onChange={(e) => act({ action: "set_role", role: e.target.value })}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>
      <button type="button" className="admin-action is-danger" disabled={busy} onClick={() => { if (confirm(`Remove ${personName} from ${organizationName}? They lose access to its dashboard at once.`)) void act({ action: "remove_member" }); }}>Remove</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

// Ends every session the person has; they sign in again next time.
export function SignOutEverywhere({ userId, personName }: { userId: string; personName: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function signOut() {
    if (!confirm(`Sign ${personName} out everywhere? They will need to sign in again.`)) return;
    setBusy(true);
    setNote("");
    const result = await send({ action: "sign_out", userId });
    setBusy(false);
    setNote(result.ok ? (result.sessions ? "Signed out." : "They were not signed in.") : result.error ?? "That didn't work.");
  }

  return (
    <div className="admin-row-actions">
      <button type="button" className="admin-action" disabled={busy} onClick={signOut}>{busy ? "Signing out…" : "Sign out everywhere"}</button>
      {note && <p className="admin-row-done" role="status">{note}</p>}
    </div>
  );
}

export function ResendInvite({ inviteId, email }: { inviteId: number; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function resend() {
    setBusy(true);
    setNote("");
    const result = await send({ action: "resend_invite", inviteId });
    setBusy(false);
    if (!result.ok) {
      setNote(result.error ?? "That didn't work.");
      return;
    }
    setNote(result.outcome === "sent" ? `Sent again to ${email}.` : result.outcome === "skipped" ? "Renewed for 14 days. Email isn't set up yet, so nothing was sent." : "Renewed for 14 days, but the email failed to send.");
    router.refresh();
  }

  return (
    <div className="admin-row-actions">
      <button type="button" className="admin-action" disabled={busy} onClick={resend}>{busy ? "Sending…" : "Send again"}</button>
      {note && <p className="admin-row-done" role="status">{note}</p>}
    </div>
  );
}
