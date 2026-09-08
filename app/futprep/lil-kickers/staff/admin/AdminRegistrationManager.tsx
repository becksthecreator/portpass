"use client";

import { useMemo, useState } from "react";
import type { StaffRegistration } from "@/db/staff";

function money(cents:number) {
  return new Intl.NumberFormat("en-BS",{style:"currency",currency:"BSD",minimumFractionDigits:0}).format(cents/100);
}

function paymentMethodLabel(method:string) {
  if (method==="cash") return "Cash";
  if (method==="online_banking") return "Online banking transfer";
  return "Bank transfer";
}

export function AdminRegistrationManager({ initialRegistrations }: { initialRegistrations: StaffRegistration[] }) {
  const [items,setItems] = useState(initialRegistrations);
  const [filter,setFilter] = useState("all");
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState<number|null>(null);
  const [amounts,setAmounts] = useState<Record<number,string>>({});
  const [copied,setCopied] = useState(false);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.program_slug !== filter) return false;
      if (!query) return true;
      return item.reference_code.toLowerCase().includes(query) || item.child_name.toLowerCase().includes(query);
    });
  }, [items,filter,search]);

  // Built from whatever programs actually have registrations, so a newly
  // added program (e.g. Futprep Out East) gets its own filter automatically.
  const programFilters = useMemo(() => {
    const seen = new Map<string,string>();
    for (const item of items) if (!seen.has(item.program_slug)) seen.set(item.program_slug,item.program_name);
    return Array.from(seen.entries());
  }, [items]);

  async function copyRegistrationLink() {
    const url=`${window.location.origin}/futprep/lil-kickers/register`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),1800);
  }

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
      body:JSON.stringify({registrationId:item.id,amountCents:Math.round(dollars*100),method:item.payment_method})
    });
    const data = await response.json() as { paidCents?:number; paymentStatus?:string };
    setBusy(null);
    if (response.ok) {
      setItems((current)=>current.map((row)=>row.id===item.id ? {...row,paid_cents:data.paidCents ?? row.paid_cents,payment_status:data.paymentStatus ?? row.payment_status}:row));
    }
  }

  return (
    <>
      <div className="registration-share-card">
        <div><span className="section-kicker">Parent registration link</span><strong>/futprep/lil-kickers/register</strong><p>Send this whenever a parent messages you. Their submission appears here automatically.</p></div>
        <button type="button" onClick={copyRegistrationLink}>{copied ? "Copied ✓" : "Copy registration link"}</button>
      </div>

      <div className="staff-summary staff-summary-four">
        <article><span>Total registrations</span><strong>{items.length}</strong></article>
        <article><span>Confirmed</span><strong>{items.filter(i=>i.registration_status==="confirmed").length}</strong></article>
        <article><span>Paid</span><strong>{items.filter(i=>i.payment_status==="paid").length}</strong></article>
        <article><span>Awaiting payment</span><strong>{items.filter(i=>["pending","partial","overdue"].includes(i.payment_status)).length}</strong></article>
      </div>
      <input
        className="staff-search-input"
        type="search"
        placeholder="Search by reference code or child name…"
        value={search}
        onChange={(e)=>setSearch(e.target.value)}
      />

      <div className="staff-filter">
        <button className={filter==="all"?"is-active":""} onClick={()=>setFilter("all")}>All</button>
        {programFilters.map(([slug,name])=>(
          <button key={slug} className={filter===slug?"is-active":""} onClick={()=>setFilter(slug)}>{name}</button>
        ))}
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
              <div><span>Emergency contact</span><strong>{item.emergency_contact_name}</strong><small>{item.emergency_contact_phone}</small></div>
              <div><span>Payment</span><strong>{item.payment_frequency==="term" ? "Full term" : "Weekly"} · {paymentMethodLabel(item.payment_method)}</strong><small>Due {money(item.amount_due_cents)} · Recorded {money(item.paid_cents)}</small></div>
              <div><span>Photo / video</span><strong>{item.photo_consent==="yes" ? "Allowed" : "Not allowed"}</strong></div>
            </div>

            <div className="staff-actions">
              <button disabled={busy===item.id} onClick={()=>patch(item.id,{registrationStatus:"confirmed"})}>Confirm registration</button>
              <select value={item.payment_status} onChange={(e)=>patch(item.id,{paymentStatus:e.target.value})}>
                <option value="pending">Not paid / pending</option><option value="partial">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="waived">Waived</option>
              </select>
              {(item.payment_method==="bank_transfer" || item.payment_method==="online_banking") && (
                <div className="record-payment-inline">
                  <span>$</span><input inputMode="decimal" value={amounts[item.id] ?? String(item.amount_due_cents/100)} onChange={(e)=>setAmounts((current)=>({...current,[item.id]:e.target.value}))} />
                  <button disabled={busy===item.id} onClick={()=>recordTransfer(item)}>Record transfer</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
