"use client";

import { useEffect, useRef, useState } from "react";
import type { AttendanceRow, StaffRegistration, StaffSession } from "@/db/staff";

type AttendanceStatus = "present" | "absent" | "excused" | "late";
// Sentinel stored alongside real statuses in the offline queue: "clear the
// mark" isn't a fifth attendance status, it's a delete, but the queue map
// needs one shape for both kinds of pending change.
const CLEAR = "__clear__" as const;
type QueuedChange = AttendanceStatus | typeof CLEAR;

function money(cents:number){return new Intl.NumberFormat("en-BS",{style:"currency",currency:"BSD",minimumFractionDigits:0}).format(cents/100)}

function hasMedicalInfo(row: AttendanceRow) {
  const fields = [row.allergies, row.medical_conditions, row.medications, row.special_needs];
  return fields.some((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 && !/^(none|no|n\/a|na)$/i.test(trimmed);
  });
}

// Queued changes are persisted to localStorage (not just component state)
// so a mark made with no connection survives a phone lock, a backgrounded
// tab, or a refresh -- not only the brief connectivity blip the old
// in-memory-only queue tolerated. This does not make a cold page LOAD
// work with zero connectivity (that needs real service-worker/PWA
// infrastructure this repo doesn't have); it makes everything AFTER the
// roster has loaded once tolerate losing the connection for the rest of
// the session, which is the case a coach on a field actually hits.
function queueKeyFor(sessionId: number) {
  return `fp_attendance_queue_${sessionId}`;
}
function readQueue(sessionId: number): Record<number, QueuedChange> {
  try {
    const raw = localStorage.getItem(queueKeyFor(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, QueuedChange>;
    return Object.fromEntries(Object.entries(parsed).map(([id, change]) => [Number(id), change]));
  } catch {
    return {};
  }
}
function writeQueue(sessionId: number, queue: Record<number, QueuedChange>) {
  try {
    if (Object.keys(queue).length === 0) localStorage.removeItem(queueKeyFor(sessionId));
    else localStorage.setItem(queueKeyFor(sessionId), JSON.stringify(queue));
  } catch {
    // Private browsing / storage disabled: the in-memory queue still
    // works for this tab session, it just won't survive a reload.
  }
}

export function CoachRoster({
  session,
  initialRoster,
  registrations,
  readOnly = false,
}: {
  session: StaffSession;
  initialRoster: AttendanceRow[];
  registrations: StaffRegistration[];
  readOnly?: boolean;
}) {
  const [roster,setRoster] = useState(initialRoster);
  const [payments,setPayments] = useState(registrations);
  const [savingId,setSavingId] = useState<number|null>(null);
  const [failedIds,setFailedIds] = useState<Record<number,QueuedChange>>({});
  const [amounts,setAmounts] = useState<Record<number,string>>({});
  const [cashBusy,setCashBusy] = useState<number|null>(null);
  const [addingWalkIn,setAddingWalkIn] = useState(false);
  const [walkInName,setWalkInName] = useState("");
  const [walkInError,setWalkInError] = useState<string|null>(null);
  const paymentById = new Map(payments.map((item)=>[item.id,item]));
  const failedQueue = useRef<Record<number,QueuedChange>>({});
  const rosterRef = useRef(roster);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  async function applyChange(registrationId:number, change:QueuedChange) {
    const previous = rosterRef.current.find((row)=>row.registration_id===registrationId)?.attendance_status ?? null;
    const optimistic = change === CLEAR ? null : change;
    setRoster((current)=>current.map((row)=>row.registration_id===registrationId ? {...row,attendance_status:optimistic}:row));
    setSavingId(registrationId);

    try {
      const response = change === CLEAR
        ? await fetch("/api/futprep/staff/attendance",{
            method:"DELETE",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({sessionId:session.id,registrationId}),
          })
        : await fetch("/api/futprep/staff/attendance",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({sessionId:session.id,registrationId,status:change}),
          });
      if (!response.ok) throw new Error("Attendance save failed");
      delete failedQueue.current[registrationId];
      writeQueue(session.id, failedQueue.current);
      setFailedIds((current)=>{
        if (!(registrationId in current)) return current;
        const next = {...current};
        delete next[registrationId];
        return next;
      });
    } catch {
      setRoster((current)=>current.map((row)=>row.registration_id===registrationId ? {...row,attendance_status:previous}:row));
      failedQueue.current[registrationId] = change;
      writeQueue(session.id, failedQueue.current);
      setFailedIds((current)=>({...current,[registrationId]:change}));
    } finally {
      setSavingId(null);
    }
  }

  function tap(registrationId:number, status:AttendanceStatus) {
    const current = rosterRef.current.find((row)=>row.registration_id===registrationId)?.attendance_status;
    applyChange(registrationId, current===status ? CLEAR : status);
  }

  // Load anything queued from a previous visit (offline marks that never
  // made it out) before this component ever painted a button, and try to
  // flush it right away in case connectivity is already back.
  useEffect(() => {
    const saved = readQueue(session.id);
    const entries = Object.entries(saved);
    if (entries.length === 0) return;
    failedQueue.current = Object.fromEntries(entries.map(([id, change]) => [Number(id), change]));
    setFailedIds({...failedQueue.current});
    setRoster((current)=>current.map((row)=>{
      const queued = failedQueue.current[row.registration_id];
      if (queued === undefined) return row;
      return {...row, attendance_status: queued===CLEAR ? null : queued};
    }));
    for (const [id, change] of entries) applyChange(Number(id), change as QueuedChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    function flushQueue() {
      const entries = Object.entries(failedQueue.current);
      for (const [id, change] of entries) {
        applyChange(Number(id), change as QueuedChange);
      }
    }
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addWalkIn() {
    const childName = walkInName.trim();
    if (!childName) return;
    setWalkInError(null);
    setAddingWalkIn(true);
    try {
      const response = await fetch("/api/futprep/staff/registrations", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ childName, programSlug: session.program_slug }),
      });
      const data = await response.json() as { registrationId?: number; error?: string };
      if (!response.ok || !data.registrationId) {
        setWalkInError(data.error ?? "Could not add this child.");
        return;
      }
      const newRow: AttendanceRow = {
        registration_id: data.registrationId,
        registration_status: "pending_details",
        child_name: childName,
        parent_name: null,
        parent_phone: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        authorized_pickup: null,
        allergies: null,
        medical_conditions: null,
        medications: null,
        special_needs: null,
        attendance_status: null,
        is_backfill: false,
      };
      setRoster((current)=>[...current, newRow].sort((a,b)=>a.child_name.localeCompare(b.child_name)));
      setWalkInName("");
    } catch {
      setWalkInError("Could not add this child -- check your connection and try again.");
    } finally {
      setAddingWalkIn(false);
    }
  }

  async function cash(item:StaffRegistration) {
    const dollars = Number(amounts[item.id] || item.amount_due_cents/100);
    if (!Number.isFinite(dollars) || dollars<=0) return;
    setCashBusy(item.id);
    const response = await fetch("/api/futprep/staff/payments",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({registrationId:item.id,amountCents:Math.round(dollars*100),method:"cash",note:`Cash received for ${session.session_date}`}),
    });
    const data = await response.json() as {paidCents?:number;paymentStatus?:string};
    setCashBusy(null);
    if (response.ok) setPayments((current)=>current.map((row)=>row.id===item.id ? {...row,paid_cents:data.paidCents ?? row.paid_cents,payment_status:data.paymentStatus ?? row.payment_status}:row));
  }

  const failedCount = Object.keys(failedIds).length;
  const sessionIsPast = session.session_date < new Date().toISOString().slice(0,10);

  return (
    <>
      <div className="coach-session-heading">
        <div><span className="panel-kicker">{session.session_date}</span><h2>{session.program_name} · {session.start_time}</h2><p>{session.location}</p></div>
        <strong>{roster.length} players</strong>
      </div>

      {sessionIsPast && !readOnly && (
        <div className="coach-backfill-banner">This session already happened -- marks made here are recorded as entered late.</div>
      )}

      {failedCount > 0 && (
        <div className="coach-unsaved-banner">
          {failedCount} {failedCount === 1 ? "change" : "changes"} not saved — will retry automatically when you're back online.
        </div>
      )}

      {!readOnly && (
        <div className="coach-walkin">
          <input
            placeholder="Add a walk-in by name"
            value={walkInName}
            onChange={(e)=>setWalkInName(e.target.value)}
            onKeyDown={(e)=>{ if (e.key==="Enter") addWalkIn(); }}
          />
          <button type="button" disabled={addingWalkIn || !walkInName.trim()} onClick={addWalkIn}>
            {addingWalkIn ? "Adding…" : "Add to roster"}
          </button>
          {walkInError && <span className="coach-walkin-error">{walkInError}</span>}
        </div>
      )}

      <div className="coach-roster">
        {roster.length===0 && <div className="dashboard-empty"><h3>No players registered yet.</h3></div>}
        {roster.map((row)=>{
          const payment=paymentById.get(row.registration_id);
          const balanceCents = payment ? Math.max(0, payment.amount_due_cents - payment.paid_cents) : 0;
          const showCash = payment?.payment_method === "cash" && balanceCents > 0;
          const failedChange = failedIds[row.registration_id];
          return (
            <article key={row.registration_id}>
              <div className="coach-player-main">
                <div className="coach-player-name-line">
                  <strong>{row.child_name}</strong>
                  {row.registration_status === "pending_details" && <span className="coach-pending-flag" title="Parent hasn't finished registration yet">● Pending details</span>}
                  {hasMedicalInfo(row) && <span className="coach-medical-flag" title="Has allergy, medical, medication, or special-needs notes">● Medical</span>}
                </div>
                <span>{row.parent_name ?? "Parent not on file yet"} · {row.parent_phone ?? ""}</span>
                <span className={`coach-payment-badge payment-${payment?.payment_status ?? "pending"}`}>Payment: {payment?.payment_status ?? "pending"}</span>
              </div>
              <details><summary>Safety notes</summary><p><b>Emergency:</b> {row.emergency_contact_name ? `${row.emergency_contact_name} · ${row.emergency_contact_phone ?? ""}` : "No information on file yet"}</p><p><b>Authorized pickup:</b> {row.authorized_pickup ?? "No information on file yet"}</p><p><b>Allergies:</b> {row.allergies === null ? "No information on file yet" : row.allergies || "None provided"}</p><p><b>Medical:</b> {row.medical_conditions === null ? "No information on file yet" : row.medical_conditions || "None provided"}</p><p><b>Medications:</b> {row.medications === null ? "No information on file yet" : row.medications || "None provided"}</p><p><b>Special needs:</b> {row.special_needs === null ? "No information on file yet" : row.special_needs || "None provided"}</p></details>
              {readOnly ? (
                <div className="attendance-actions attendance-actions-readonly">
                  <span className={row.attendance_status ? "is-active" : ""}>{row.attendance_status ?? "Not marked yet"}</span>
                </div>
              ) : (
                <>
                  <div className="attendance-actions">
                    {(["present","absent","excused","late"] as const).map((status)=><button className={row.attendance_status===status ? "is-active":""} disabled={savingId===row.registration_id} onClick={()=>tap(row.registration_id,status)} key={status}>{status}</button>)}
                  </div>
                  <p className="coach-attendance-state">
                    {row.attendance_status ? "Tap the highlighted status again to undo." : "Not marked yet."}
                    {row.is_backfill && " · Entered late."}
                  </p>
                  {failedChange && (
                    <div className="coach-attendance-retry">
                      <span>Couldn&apos;t save {failedChange===CLEAR ? "the undo" : `"${failedChange}"`}.</span>
                      <button type="button" onClick={()=>applyChange(row.registration_id,failedChange)}>Retry now</button>
                    </div>
                  )}
                  {showCash && (
                    <div className="record-payment-inline coach-cash-inline">
                      <span>$</span>
                      <input inputMode="decimal" value={amounts[row.registration_id] ?? String((balanceCents)/100)} onChange={(e)=>setAmounts((current)=>({...current,[row.registration_id]:e.target.value}))} />
                      <button disabled={cashBusy===payment!.id} onClick={()=>cash(payment!)}>Record cash</button>
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
