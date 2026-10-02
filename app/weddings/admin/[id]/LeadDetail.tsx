"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WeddingLeadDetail } from "@/db/weddingAdmin";
import { WEDDING_LEAD_STATUSES, type WeddingLeadStatus } from "@/lib/weddingLeads";

const STATUS_LABEL: Record<WeddingLeadStatus, string> = {
  new: "New",
  pre_consultation: "Pre-consultation",
  consultation_requested: "Consultation requested",
  planning: "Planning",
  ready_for_antonio: "Ready for Antonio",
  antonio_review: "Antonio review",
  quoted: "Quoted",
  booked: "Booked",
  closed: "Closed",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function LeadDetail({ lead }: { lead: WeddingLeadDetail }) {
  const router = useRouter();
  const [status, setStatus] = useState<WeddingLeadStatus>(lead.status);
  const [statusBusy, setStatusBusy] = useState(false);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [error, setError] = useState("");
  const [completedOn, setCompletedOn] = useState(lead.completedOn ?? "");
  const [deskCoordinated, setDeskCoordinated] = useState(lead.deskCoordinated);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeNote, setCompleteNote] = useState("");

  // The wedding has happened. If the Desk coordinated it, PortPass's
  // coordination fee goes on the next monthly invoice, once.
  async function markCompleted() {
    if (!completedOn) return;
    setCompleteBusy(true);
    setError("");
    setCompleteNote("");
    const response = await fetch(`/api/weddings/admin/leads/${lead.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedOn, deskCoordinated }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; feeCreated?: boolean; feeRemoved?: boolean; feeRedated?: boolean; alreadyInvoiced?: boolean };
    setCompleteBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Could not mark the wedding completed.");
      return;
    }
    setCompleteNote(
      data.alreadyInvoiced ? "Saved, but the coordination fee is already on an invoice and has not changed. Tell PortPass if it needs correcting."
        : data.feeCreated ? "Saved. The coordination fee goes on the next monthly invoice."
        : data.feeRemoved ? "Saved. The coordination fee has been taken off."
        : data.feeRedated ? "Saved. The coordination fee has moved to the new date."
        : "Saved.",
    );
    router.refresh();
  }

  async function saveStatus(next: WeddingLeadStatus) {
    setStatus(next);
    setStatusBusy(true);
    setError("");
    const response = await fetch(`/api/weddings/admin/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setStatusBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not update status.");
      return;
    }
    router.refresh();
  }

  async function submitNote() {
    if (!note.trim()) return;
    setNoteBusy(true);
    setError("");
    const response = await fetch(`/api/weddings/admin/leads/${lead.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setNoteBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not save the note.");
      return;
    }
    setNote("");
    router.refresh();
  }

  return (
    <>
      <p><Link href="/weddings/admin">← Back to inbox</Link></p>
      <div className="staff-page-intro">
        <div><span className="section-kicker">{lead.ceremonyType || "Still exploring"}{lead.packageName ? ` · ${lead.packageName}` : ""}</span><h1>{lead.names}</h1></div>
        <p>Enquiry received {formatWhen(lead.createdAt)}. Reference {lead.publicToken.slice(0, 8)}.</p>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="wedding-admin-panel">
        <h2>Status</h2>
        <div className="staff-filter">
          {WEDDING_LEAD_STATUSES.map((s) => (
            <button key={s} className={status === s ? "is-active" : ""} disabled={statusBusy} onClick={() => saveStatus(s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>

      <div className="wedding-admin-panel">
        <h2>After the wedding</h2>
        <p>{lead.completedOn ? `Marked as completed on ${lead.completedOn}${lead.deskCoordinated ? ", coordinated by the Desk." : "."}` : "Once the wedding has happened, record it here."}</p>
        <div className="staff-info-grid">
          <label><span>Date of the wedding</span><input type="date" value={completedOn} onChange={(event) => setCompletedOn(event.target.value)} /></label>
          <label><input type="checkbox" checked={deskCoordinated} onChange={(event) => setDeskCoordinated(event.target.checked)} /> <span>The Wedding Desk coordinated it</span></label>
        </div>
        <button disabled={completeBusy || !completedOn} onClick={markCompleted}>{completeBusy ? "Saving…" : lead.completedOn ? "Save" : "Mark the wedding completed"}</button>
        {completeNote && <p role="status">{completeNote}</p>}
      </div>

      <div className="wedding-admin-panel">
        <h2>What they submitted</h2>
        <div className="staff-info-grid">
          <div><span>Email</span><strong>{lead.email || "Not given"}</strong></div>
          <div><span>Phone</span><strong>{lead.phone || "Not given"}</strong></div>
          <div><span>Travelling from</span><strong>{lead.travelOrigin || "Not given"}</strong></div>
          <div><span>Preferred date</span><strong>{lead.preferredWeddingDate || "Still deciding"}</strong></div>
        </div>
        <div className="staff-info-grid">
          <div><span>Arrival date</span><strong>{lead.arrivalDate || "Not given"}</strong></div>
          <div><span>Guests</span><strong>{lead.guestCount ?? "Not specified"}</strong></div>
          <div><span>Venue preference</span><strong>{lead.venuePreference || "Still deciding"}</strong></div>
          <div><span>Location idea</span><strong>{lead.locationIdea || "Not given"}</strong></div>
        </div>
        <div className="staff-info-grid">
          <div><span>Services requested</span><strong>{lead.requestedServices.length ? lead.requestedServices.join(", ") : "None"}</strong></div>
          <div><span>Consultation method</span><strong>{lead.consultationMethod || "Not chosen"}</strong></div>
          <div><span>Consultation timing</span><strong>{lead.consultationPreferredDate || "Not specified"} {lead.consultationPreferredTime || ""} {lead.consultationTimeZone || ""}</strong></div>
          <div><span>Contact consent</span><strong>{lead.contactConsent ? "Yes" : "No"}</strong></div>
        </div>
        {lead.notes && (
          <div className="wedding-admin-field-full" style={{ marginTop: 16 }}>
            <span className="section-kicker">Their notes to us</span>
            <p>{lead.notes}</p>
          </div>
        )}
      </div>

      <div className="wedding-admin-panel">
        <h2>Internal notes</h2>
        <p className="bws-hint" style={{ color: "var(--muted)", fontSize: ".78rem" }}>Visible to staff only — the couple never sees these.</p>
        {lead.internalNotes.length === 0 && <p>No internal notes yet.</p>}
        <ul className="wedding-notes-list">
          {lead.internalNotes.map((n) => (
            <li key={n.id}><strong>{n.author}</strong><span>{formatWhen(n.createdAt)}</span><p>{n.note}</p></li>
          ))}
        </ul>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Add an internal note — call outcome, quote given, anything the next person should know…"
          style={{ width: "100%", border: "1px solid var(--line)", padding: 10, fontFamily: "inherit", fontSize: ".85rem" }}
        />
        <div className="staff-actions">
          <button disabled={noteBusy || !note.trim()} onClick={submitNote}>{noteBusy ? "Saving…" : "Add note"}</button>
        </div>
      </div>
    </>
  );
}
