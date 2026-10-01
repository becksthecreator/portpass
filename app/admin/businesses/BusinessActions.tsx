"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// isPublic: the page is showing on the site. canSuspend is false for the
// two businesses with hand-built pages, which Suspend would not hide.
type Props = { id: number; name: string; status: string; createdByAdmin: boolean; claimed: boolean; isPublic: boolean; canSuspend: boolean };
type Ask = "send_back" | "suspend" | null;
type ClaimLink = { url: string; whatsappUrl: string; hasNumber: boolean };

// What a founder can do to one business (brief 08, 1.2). Each button says
// what it does; the two that affect the owner most (send back, suspend)
// ask for a note first, because the owner is shown it.
export function BusinessActions({ id, name, status, createdByAdmin, claimed, isPublic, canSuspend }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [link, setLink] = useState<ClaimLink | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    setDone("");
    const response = await fetch(`/api/admin/businesses/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; status?: string }) : {};
    setBusy(null);
    if (!response || !response.ok) {
      setError(data.error ?? "That didn't finish. Refresh the page to see where the business stands.");
      return;
    }
    setAsk(null);
    setNote("");
    setDone(data.status === "live" ? "Live." : data.status ? `Now ${data.status}.` : "Done.");
    router.refresh();
  }

  async function claimLink() {
    // Only the newest link works, so a link already sent would stop.
    if (!confirm(`Make a new claim link for ${name}? Any link you already sent stops working.`)) return;
    setBusy("claim");
    setError("");
    const response = await fetch(`/api/admin/businesses/${id}/claim-link`, { method: "POST" }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as Partial<ClaimLink> & { error?: string }) : {};
    setBusy(null);
    if (!response || !response.ok || !data.url || !data.whatsappUrl) {
      setError(data.error ?? "Could not make the link.");
      return;
    }
    setLink({ url: data.url, whatsappUrl: data.whatsappUrl, hasNumber: Boolean(data.hasNumber) });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  const canClaim = createdByAdmin && !claimed && status !== "suspended";
  return (
    <div className="admin-row-actions">
      {status === "submitted" && <button type="button" className="admin-action is-primary" disabled={busy !== null} onClick={() => act("approve")}>{busy === "approve" ? "Approving…" : "Approve"}</button>}
      {status === "submitted" && !isPublic && <button type="button" className="admin-action" disabled={busy !== null} onClick={() => setAsk(ask === "send_back" ? null : "send_back")}>Send back</button>}
      {status === "draft" && createdByAdmin && (
        <button type="button" className="admin-action is-primary" disabled={busy !== null} onClick={() => { if (confirm(`Publish ${name}? Only do this when the owner has agreed. It is logged as published on their word.`)) void act("publish"); }}>
          {busy === "publish" ? "Publishing…" : "Publish (owner agreed)"}
        </button>
      )}
      {canClaim && <button type="button" className="admin-action" disabled={busy !== null} onClick={claimLink}>{busy === "claim" ? "Making link…" : link ? "New claim link" : "Send claim link"}</button>}
      {canSuspend && (status === "submitted" || status === "approved" || status === "live" || isPublic) && <button type="button" className="admin-action is-danger" disabled={busy !== null} onClick={() => setAsk(ask === "suspend" ? null : "suspend")}>Suspend</button>}
      {status === "suspended" && <button type="button" className="admin-action is-primary" disabled={busy !== null} onClick={() => act("unsuspend")}>{busy === "unsuspend" ? "Unsuspending…" : "Unsuspend"}</button>}

      {ask && (
        <div className="admin-action-ask">
          <label>
            <span>{ask === "send_back" ? "What needs to change? The owner sees this." : "Why is it being hidden? The owner is told, and it is logged."}</span>
            <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="admin-action is-primary" disabled={busy !== null || !note.trim()} onClick={() => act(ask, { note })}>
            {busy === ask ? "Saving…" : ask === "send_back" ? "Send back with this note" : "Suspend and hide the page"}
          </button>
        </div>
      )}

      {link && (
        <div className="admin-action-ask">
          <p>One-use link, good for 30 days. You send it yourself:</p>
          <code>{link.url}</code>
          <div className="admin-form-actions">
            <a className="admin-action is-primary" href={link.whatsappUrl} target="_blank" rel="noopener noreferrer">{link.hasNumber ? "Open in WhatsApp ↗" : "Share on WhatsApp ↗"}</a>
            <button type="button" className="admin-action" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          </div>
          <p>It is shown once. Making a new link switches this one off.</p>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="admin-row-done" role="status">{done}</p>}
    </div>
  );
}
