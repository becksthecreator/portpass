"use client";

import { useMemo, useState } from "react";
import type { StaffRegistration } from "@/db/staff";

function money(cents:number) {
  return new Intl.NumberFormat("en-BS",{style:"currency",currency:"BSD",minimumFractionDigits:0}).format(cents/100);
}

export function AdminRegistrationManager({ initialRegistrations }: { initialRegistrations: StaffRegistration[] }) {
  const [items,setItems] = useState(initialRegistrations);
  const [filter,setFilter] = useState("all");
  const [busy,setBusy] = useState<number|null>(null);
  const [amounts,setAmounts] = useState<Record<number,string>>({});

  const visible = useMemo(
    ()=>items.filter((item)=>filter==="all" || item.program_slug===filter),
    [items,filter]
  );

  async function patch(id:number, values: Record<string,string>) {
    setBusy(id);
    const response = await fetch(`/api/futprep/lil-kickers/staff/registrations/${id}`,{
      method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)
    });
    setBusy(null);
    if (!response.ok) return;
    setItems((current)=>current.map((item)=>item.id===id ? {...item,...{
      ...(values.registrationStatus ? {registration_status:values.registrationStatus}:{}),
      ...(values.paymentStatus ? {payment_status:values.paymentStatus}:{}),
    }} : item));
  }

  async function recordTransfer(item: StaffRegistration) {
    const dollars = Number(amounts[item.id] || item.amount_due_cents/100);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    setBusy(item.id);
    const response = await fetch("/api/futprep/lil-kickers/staff/payments",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({registrationId:item.id,amountCents:Math.round(dollars*100),method:"bank_transfer"})
    });
    const data = await response.json() as { paidCents?:number; paymentStatus?:string };
    setBusy(null);
    if (response.ok) {
      setItems((current)=>current.map((row)=>row.id===item.id ? {...row,paid_cents:data.paidCents ?? row.paid_cents,payment_status:data.paymentStatus ?? row.payment_status}:row));
    }
  }

  return (
    <>
      <div className="staff-summary">
        <article><span>Total registrations</span><strong>{items.length}</strong></article>
        <article><span>Confirmed</span><strong>{items.filter(i=>i.registration_status==="confirmed").length}</strong></article>
        <article><span>Payment pending</span><strong>{items.filter(i=>["pending","partial","overdue"].includes(i.payment_status)).length}</strong></article>
      </div>
      <div className="staff-filter">
        <button className={filter==="all"?"is-active":""} onClick={()=>setFilter("all")}>All</button>
        <button className={filter==="lil-kickers"?"is-active":""} onClick={()=>setFilter("lil-kickers")}>Lil Kickers</button>
        <button className={filter==="rookies"?"is-active":""} onClick={()=>setFilter("rookies")}>Rookies</button>
      </div>

      <div className="staff-registration-list">
        {visible.length===0 && <div className="dashboard-empty"><h3>No registrations yet.</h3></div>}
        {visible.map((item)=>(
          <article className="staff-registration-card" key={item.id}>
            <div className="staff-registration-head">
              <div><span className="panel-kicker">{item.reference_code}</span><h2>{item.child_name}</h2><p>{item.program_name} · {item.child_dob}</p></div>
              <div className="staff-status-stack"><span className="status status-submitted">{item.registration_status}</span><span className="status status-approved">{item.payment_status}</span></div>
            </div>

            <div className="staff-info-grid">
              <div><span>Parent / guardian</span><strong>{item.parent_name}</strong><small>{item.parent_email}<br/>{item.parent_phone}</small></div>
              <div><span>Emergency</span><strong>{item.emergency_contact_name}</strong><small>{item.emergency_contact_phone}</small></div>
              <div><span>Payment</span><strong>{item.payment_frequency==="term" ? "Full term" : "Weekly"} · {item.payment_method==="cash" ? "Cash" : "Bank transfer"}</strong><small>Due {money(item.amount_due_cents)} · Recorded {money(item.paid_cents)}</small></div>
              <div><span>Photo / video</span><strong>{item.photo_consent==="yes" ? "Allowed" : "Not allowed"}</strong></div>
            </div>

            <details className="medical-details">
              <summary>Medical, special needs & pickup details</summary>
              <dl>
                <div><dt>Allergies</dt><dd>{item.allergies || "None provided"}</dd></div>
                <div><dt>Medical conditions</dt><dd>{item.medical_conditions || "None provided"}</dd></div>
                <div><dt>Medications</dt><dd>{item.medications || "None provided"}</dd></div>
                <div><dt>Special needs / accommodations</dt><dd>{item.special_needs || "None provided"}</dd></div>
                <div><dt>Authorized pickup</dt><dd>{item.authorized_pickup}</dd></div>
                <div><dt>Additional notes</dt><dd>{item.additional_notes || "None"}</dd></div>
              </dl>
            </details>

            <div className="staff-actions">
              <button disabled={busy===item.id} onClick={()=>patch(item.id,{registrationStatus:"confirmed"})}>Confirm registration</button>
              <select value={item.payment_status} onChange={(e)=>patch(item.id,{paymentStatus:e.target.value})}>
                <option value="pending">Payment pending</option><option value="partial">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="waived">Waived</option>
              </select>
              {item.payment_method==="bank_transfer" && (
                <div className="record-payment-inline">
                  <span>$</span><input inputMode="decimal" value={amounts[item.id] ?? String(item.amount_due_cents/100)} onChange={(e)=>setAmounts((current)=>({...current,[item.id]:e.target.value}))} />
                  <button disabled={busy===item.id} onClick={()=>recordTransfer(item)}>Record bank transfer</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
