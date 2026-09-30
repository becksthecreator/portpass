"use client";
import { FormEvent, useState } from "react";
import type { CoachProfile, PrivateSessionRequest } from "@/db/coaches";

type ServiceName = { slug: string; name: string };
const money = (cents: number | null) => (cents === null ? "—" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Private sessions inbox (brief 06 v2, Part B), phone-first: post weekly
// open times, accept or decline requests (accepting books the slot and
// emails the parent), record payments against the PS- code.
export function PrivateSessionManager({ initialRequests, coaches, services, schemaReady }: { initialRequests: PrivateSessionRequest[]; coaches: CoachProfile[]; services: ServiceName[]; schemaReady: boolean }) {
  const [requests, setRequests] = useState(initialRequests);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const serviceName = (slug: string | null) => services.find((s) => s.slug === slug)?.name ?? null;

  async function act(id: number, action: string, coachId?: number, targetCoachId?: number, reason?: string) {
    setMessage("");
    const response = await fetch(`/api/futprep/private-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, coachId, targetCoachId, reason }) });
    const data = (await response.json()) as { error?: string; requests?: PrivateSessionRequest[] };
    if (!response.ok) { setMessage(data.error ?? "Could not update request."); return; }
    if (data.requests) setRequests(data.requests);
    setMessage(action === "accept" ? "Accepted. The parent has been emailed the time, place, price and payment reference." : "Updated.");
  }

  async function addSlots(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/futprep/staff/coach-slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coachId: Number(form.get("coachId")), dayOfWeek: form.get("dayOfWeek"), startTime: form.get("startTime"), endTime: form.get("endTime"), weeks: Number(form.get("weeks")), location: form.get("location") }) });
      const data = (await response.json()) as { error?: string; added?: number };
      if (!response.ok) throw new Error(data.error ?? "Could not add the times.");
      setMessage(`${data.added ?? 0} open ${data.added === 1 ? "time" : "times"} added. Parents can pick them on the coaches page.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not add the times.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setMessage("");
    const response = await fetch(`/api/futprep/private-sessions/${id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountDollars: Number(form.get("amount")), method: form.get("method"), reference: form.get("reference") }) });
    const data = (await response.json()) as { error?: string; requests?: PrivateSessionRequest[] };
    if (!response.ok) { setMessage(data.error ?? "Could not record the payment."); return; }
    if (data.requests) setRequests(data.requests);
    formEl.reset();
    setMessage("Payment recorded.");
  }

  const bookable = coaches.filter((c) => c.bookable);

  return <div className="private-session-manager">
    {message && <p className="coach-manager-message" role="status">{message}</p>}

    <form className="team-admin-form private-slots-form" onSubmit={addSlots}>
      <span className="section-kicker">Open times</span>
      <h2>Add weekly times.</h2>
      <p>Pick a coach, a day and a time; parents see these on the coaches page and can book one.</p>
      <div className="team-form-two">
        <label><span>Coach *</span><select name="coachId" required defaultValue={bookable[0]?.id ?? ""}>{bookable.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
        <label><span>Day *</span><select name="dayOfWeek" required defaultValue="Wednesday">{DAYS.map((d) => <option key={d}>{d}</option>)}</select></label>
      </div>
      <div className="team-form-two">
        <label><span>Start *</span><input name="startTime" placeholder="4:00 PM" required /></label>
        <label><span>End *</span><input name="endTime" placeholder="4:45 PM" required /></label>
      </div>
      <div className="team-form-two">
        <label><span>For how many weeks *</span><input name="weeks" type="number" min={1} max={26} defaultValue={6} required /></label>
        <label><span>Where</span><input name="location" placeholder="Lyford Cay Lower Campus Soccer Field" /></label>
      </div>
      <button className="primary-button" disabled={busy || !schemaReady || !bookable.length}>{busy ? "Adding…" : "Add times →"}</button>
    </form>

    {!requests.length && <div className="dashboard-empty"><h3>No private-session requests yet.</h3><p>Requests from the public coaches page will appear here.</p></div>}
    {requests.map((request) => <article className="private-request-card" key={request.id}>
      <div className="private-request-head"><div><span className={`request-type request-${request.request_type}`}>{serviceName(request.service_slug) ?? (request.request_type === "birthday" ? "Birthday" : "Private lesson")}</span><h2>{request.child_name}, age {request.child_age}</h2><p>{request.parent_name} · {request.parent_phone} · {request.parent_email}</p><p><strong>{request.reference_code}</strong></p></div><span className={`request-status status-${request.status}`}>{request.status}</span></div>
      <div className="private-request-grid">
        <div><span>Requested</span><strong>{request.requested_date} · {request.requested_start_time}</strong><small>{request.duration_minutes} min{request.availability_id ? " · picked an open time" : " · suggested time"}</small></div>
        <div><span>Preferred coach</span><strong>{request.preferred_coach_name ?? "Any available coach"}</strong><small>Assigned: {request.assigned_coach_name ?? "Not yet"}</small></div>
        <div><span>Price</span><strong>{money(request.price_cents)}</strong><small>Paid {money(request.paid_cents)} · {request.payment_status}</small></div>
        <div><span>Goal / occasion</span><strong>{request.session_goal || "Not provided"}</strong><small>{request.location_preference ? `Where: ${request.location_preference}. ` : ""}{request.notes}</small></div>
      </div>
      {request.status === "declined" && request.decline_reason && <p className="request-alert">Decline reason: {request.decline_reason}</p>}
      {request.status === "referred" && !request.parent_notified_at && <p className="request-alert">Parent notification required before the handoff is considered complete.</p>}
      {request.parent_notified_at && <p className="request-ok">Parent informed ✓</p>}
      <div className="private-request-actions">
        <select id={`coach-${request.id}`} defaultValue={request.assigned_coach_id ?? request.preferred_coach_id ?? ""}><option value="">Choose coach</option>{bookable.map((coach) => <option value={coach.id} key={coach.id}>{coach.display_name}</option>)}</select>
        <button disabled={!schemaReady} onClick={() => { const el = document.getElementById(`coach-${request.id}`) as HTMLSelectElement | null; void act(request.id, "accept", Number(el?.value) || undefined); }}>Accept</button>
        <button disabled={!schemaReady} onClick={() => { const reason = prompt("Why are you declining this request?"); if (reason) void act(request.id, "decline", undefined, undefined, reason); }}>Decline</button>
        <button disabled={!schemaReady} onClick={() => { const el = document.getElementById(`coach-${request.id}`) as HTMLSelectElement | null; const target = Number(el?.value); if (!target) return alert("Choose the coach receiving the referral first."); const note = prompt("Referral note (optional):") ?? ""; void act(request.id, "refer", request.assigned_coach_id ?? undefined, target, note); }}>Refer</button>
        {request.status === "referred" && !request.parent_notified_at && <button disabled={!schemaReady} onClick={() => void act(request.id, "parent_notified")}>Parent informed</button>}
        {request.status === "accepted" && <button disabled={!schemaReady} onClick={() => void act(request.id, "complete")}>Complete</button>}
      </div>
      {(request.status === "accepted" || request.status === "completed") && request.payment_status !== "paid" && (
        <form className="private-request-payment" onSubmit={(e) => void recordPayment(e, request.id)}>
          <label><span>Received ($)</span><input name="amount" type="number" min="0.01" step="0.01" defaultValue={request.price_cents ? ((request.price_cents - request.paid_cents) / 100).toFixed(2) : ""} required /></label>
          <label><span>How</span><select name="method" defaultValue="cash"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="online_banking">Online banking</option></select></label>
          <label><span>Reference</span><input name="reference" placeholder={request.reference_code} /></label>
          <button type="submit">Record payment</button>
        </form>
      )}
    </article>)}
  </div>;
}
