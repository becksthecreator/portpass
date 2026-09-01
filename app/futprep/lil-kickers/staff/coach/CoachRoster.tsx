"use client";

import { useState } from "react";
import type { AttendanceRow, StaffRegistration, StaffSession } from "@/db/staff";

function money(cents:number){return new Intl.NumberFormat("en-BS",{style:"currency",currency:"BSD",minimumFractionDigits:0}).format(cents/100)}

export function CoachRoster({
  session,
  initialRoster,
  registrations,
}: {
  session: StaffSession;
  initialRoster: AttendanceRow[];
  registrations: StaffRegistration[];
}) {
  const [roster,setRoster] = useState(initialRoster);
  const [payments,setPayments] = useState(registrations);
  const [busy,setBusy] = useState<number|null>(null);
  const [amounts,setAmounts] = useState<Record<number,string>>({});

  async function attendance(registrationId:number,status:"present"|"absent"|"excused") {
    setBusy(registrationId);
    const response = await fetch("/api/futprep/lil-kickers/staff/attendance",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({sessionId:session.id,registrationId,status}),
    });
    setBusy(null);
    if (response.ok) setRoster((current)=>current.map((row)=>row.registration_id===registrationId ? {...row,attendance_status:status}:row));
  }

  async function cash(item:StaffRegistration) {
    const dollars = Number(amounts[item.id] || item.amount_due_cents/100);
    if (!Number.isFinite(dollars) || dollars<=0) return;
    setBusy(item.id);
    const response = await fetch("/api/futprep/lil-kickers/staff/payments",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({registrationId:item.id,amountCents:Math.round(dollars*100),method:"cash",note:`Cash received for ${session.session_date}`}),
    });
    const data = await response.json() as {paidCents?:number;paymentStatus?:string};
    setBusy(null);
    if (response.ok) setPayments((current)=>current.map((row)=>row.id===item.id ? {...row,paid_cents:data.paidCents ?? row.paid_cents,payment_status:data.paymentStatus ?? row.payment_status}:row));
  }

  return (
    <>
      <div className="coach-session-heading">
        <div><span className="panel-kicker">{session.session_date}</span><h2>{session.program_name} · {session.start_time}</h2><p>{session.location}</p></div>
        <strong>{roster.length} players</strong>
      </div>

      <div className="coach-roster">
        {roster.length===0 && <div className="dashboard-empty"><h3>No players registered yet.</h3></div>}
        {roster.map((row)=>(
          <article key={row.registration_id}>
            <div className="coach-player-main"><strong>{row.child_name}</strong><span>{row.parent_name} · {row.parent_phone}</span></div>
            <details><summary>Safety notes</summary><p><b>Emergency:</b> {row.emergency_contact_name} · {row.emergency_contact_phone}</p><p><b>Authorized pickup:</b> {row.authorized_pickup}</p><p><b>Allergies:</b> {row.allergies || "None provided"}</p><p><b>Medical:</b> {row.medical_conditions || "None provided"}</p><p><b>Medications:</b> {row.medications || "None provided"}</p><p><b>Special needs:</b> {row.special_needs || "None provided"}</p></details>
            <div className="attendance-actions">
              {(["present","absent","excused"] as const).map((status)=><button className={row.attendance_status===status ? "is-active":""} disabled={busy===row.registration_id} onClick={()=>attendance(row.registration_id,status)} key={status}>{status}</button>)}
            </div>
          </article>
        ))}
      </div>

      <div className="cash-section">
        <span className="section-kicker">Cash collection</span>
        <h2>Record cash received.</h2>
        <div className="cash-list">
          {payments.map((item)=>(
            <article key={item.id}>
              <div><strong>{item.child_name}</strong><span>{item.payment_frequency==="term" ? "Full term" : "Weekly"} · {item.payment_status} · recorded {money(item.paid_cents)}</span></div>
              <div className="record-payment-inline"><span>$</span><input inputMode="decimal" value={amounts[item.id] ?? String(item.amount_due_cents/100)} onChange={(e)=>setAmounts((current)=>({...current,[item.id]:e.target.value}))}/><button disabled={busy===item.id} onClick={()=>cash(item)}>Record cash</button></div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
