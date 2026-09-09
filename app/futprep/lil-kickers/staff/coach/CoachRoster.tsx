"use client";

import { useEffect, useRef, useState } from "react";
import type { AttendanceRow, StaffRegistration, StaffSession } from "@/db/staff";

type AttendanceStatus = "present" | "absent" | "excused" | "late";

function money(cents:number){return new Intl.NumberFormat("en-BS",{style:"currency",currency:"BSD",minimumFractionDigits:0}).format(cents/100)}

function hasMedicalInfo(row: AttendanceRow) {
  const fields = [row.allergies, row.medical_conditions, row.medications, row.special_needs];
  return fields.some((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 && !/^(none|no|n\/a|na)$/i.test(trimmed);
  });
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
  const [failedIds,setFailedIds] = useState<Record<number,AttendanceStatus>>({});
  const [amounts,setAmounts] = useState<Record<number,string>>({});
  const [cashBusy,setCashBusy] = useState<number|null>(null);
  const paymentById = new Map(payments.map((item)=>[item.id,item]));
  const failedQueue = useRef<Record<number,AttendanceStatus>>({});
  const rosterRef = useRef(roster);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  async function attendance(registrationId:number,status:AttendanceStatus) {
    const previous = rosterRef.current.find((row)=>row.registration_id===registrationId)?.attendance_status ?? null;
    setRoster((current)=>current.map((row)=>row.registration_id===registrationId ? {...row,attendance_status:status}:row));
    setSavingId(registrationId);

    try {
      const response = await fetch("/api/futprep/lil-kickers/staff/attendance",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sessionId:session.id,registrationId,status}),
      });
      if (!response.ok) throw new Error("Attendance save failed");
      delete failedQueue.current[registrationId];
      setFailedIds((current)=>{
        if (!(registrationId in current)) return current;
        const next = {...current};
        delete next[registrationId];
        return next;
      });
    } catch {
      setRoster((current)=>current.map((row)=>row.registration_id===registrationId ? {...row,attendance_status:previous}:row));
      failedQueue.current[registrationId] = status;
      setFailedIds((current)=>({...current,[registrationId]:status}));
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    function flushQueue() {
      const entries = Object.entries(failedQueue.current);
      for (const [id, status] of entries) {
        attendance(Number(id), status as AttendanceStatus);
      }
    }
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cash(item:StaffRegistration) {
    const dollars = Number(amounts[item.id] || item.amount_due_cents/100);
    if (!Number.isFinite(dollars) || dollars<=0) return;
    setCashBusy(item.id);
    const response = await fetch("/api/futprep/lil-kickers/staff/payments",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({registrationId:item.id,amountCents:Math.round(dollars*100),method:"cash",note:`Cash received for ${session.session_date}`}),
    });
    const data = await response.json() as {paidCents?:number;paymentStatus?:string};
    setCashBusy(null);
    if (response.ok) setPayments((current)=>current.map((row)=>row.id===item.id ? {...row,paid_cents:data.paidCents ?? row.paid_cents,payment_status:data.paymentStatus ?? row.payment_status}:row));
  }

  const failedCount = Object.keys(failedIds).length;

  return (
    <>
      <div className="coach-session-heading">
        <div><span className="panel-kicker">{session.session_date}</span><h2>{session.program_name} · {session.start_time}</h2><p>{session.location}</p></div>
        <strong>{roster.length} players</strong>
      </div>

      {failedCount > 0 && (
        <div className="coach-unsaved-banner">
          {failedCount} {failedCount === 1 ? "change" : "changes"} not saved — will retry automatically when you're back online.
        </div>
      )}

      <div className="coach-roster">
        {roster.length===0 && <div className="dashboard-empty"><h3>No players registered yet.</h3></div>}
        {roster.map((row)=>{
          const payment=paymentById.get(row.registration_id);
          const balanceCents = payment ? Math.max(0, payment.amount_due_cents - payment.paid_cents) : 0;
          const showCash = payment?.payment_method === "cash" && balanceCents > 0;
          const failedStatus = failedIds[row.registration_id];
          return (
            <article key={row.registration_id}>
              <div className="coach-player-main">
                <div className="coach-player-name-line">
                  <strong>{row.child_name}</strong>
                  {hasMedicalInfo(row) && <span className="coach-medical-flag" title="Has allergy, medical, medication, or special-needs notes">● Medical</span>}
                </div>
                <span>{row.parent_name} · {row.parent_phone}</span>
                <span className={`coach-payment-badge payment-${payment?.payment_status ?? "pending"}`}>Payment: {payment?.payment_status ?? "pending"}</span>
              </div>
              <details><summary>Safety notes</summary><p><b>Emergency:</b> {row.emergency_contact_name} · {row.emergency_contact_phone}</p><p><b>Authorized pickup:</b> {row.authorized_pickup}</p><p><b>Allergies:</b> {row.allergies || "None provided"}</p><p><b>Medical:</b> {row.medical_conditions || "None provided"}</p><p><b>Medications:</b> {row.medications || "None provided"}</p><p><b>Special needs:</b> {row.special_needs || "None provided"}</p></details>
              {readOnly ? (
                <div className="attendance-actions attendance-actions-readonly">
                  <span className={row.attendance_status ? "is-active" : ""}>{row.attendance_status ?? "Not marked yet"}</span>
                </div>
              ) : (
                <>
                  <div className="attendance-actions">
                    {(["present","absent","excused","late"] as const).map((status)=><button className={row.attendance_status===status ? "is-active":""} disabled={savingId===row.registration_id} onClick={()=>attendance(row.registration_id,status)} key={status}>{status}</button>)}
                  </div>
                  {failedStatus && (
                    <div className="coach-attendance-retry">
                      <span>Couldn&apos;t save &quot;{failedStatus}&quot;.</span>
                      <button type="button" onClick={()=>attendance(row.registration_id,failedStatus)}>Retry now</button>
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
