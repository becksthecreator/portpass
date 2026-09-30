"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StaffRegistration } from "@/db/staff";
import { missingRegistrationFields } from "@/lib/futprepRegistrations";

function money(cents:number) {
  return new Intl.NumberFormat("en-BS",{style:"currency",currency:"BSD",minimumFractionDigits:0}).format(cents/100);
}

function paymentMethodLabel(method:string|null) {
  if (!method) return "Not chosen yet";
  if (method==="cash") return "Cash";
  if (method==="online_banking") return "Online banking transfer";
  return "Bank transfer";
}

function whatsappTo(phone: string, message: string) {
  window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

// Part C (brief 06 v2): after a free trial, the rest of the term at the
// prorated price, tagged as a PortPass member perk.
function openJoinWhatsApp(item: StaffRegistration) {
  if (!item.parent_phone) return;
  const link = `${window.location.origin}/futprep/register?program=${encodeURIComponent(item.program_slug)}&term=${item.term_id}&join=${encodeURIComponent(item.reference_code)}&utm_source=portpass&utm_medium=member_perk&utm_campaign=trial_join`;
  whatsappTo(item.parent_phone, `Hi! Thanks for trying Futprep with ${item.child_name.split(" ")[0]}. Here's the link to join the term: ${link}`);
}

function openCompletionWhatsApp(item: StaffRegistration) {
  if (!item.parent_phone) return;
  const link = `${window.location.origin}/futprep/my/${item.reference_code}/complete`;
  const message = `Hi! We've started ${item.child_name}'s Futprep registration. Please finish it here: ${link}`;
  window.open(`https://wa.me/${item.parent_phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

export function AdminRegistrationManager({ initialRegistrations }: { initialRegistrations: StaffRegistration[] }) {
  const [items,setItems] = useState(initialRegistrations);
  const [filter,setFilter] = useState("all");
  const [onlyBalance,setOnlyBalance] = useState(false);
  const [onlyIncomplete,setOnlyIncomplete] = useState(false);
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState<number|null>(null);
  const [amounts,setAmounts] = useState<Record<number,string>>({});
  const [copied,setCopied] = useState(false);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.program_slug !== filter) return false;
      if (onlyBalance && item.amount_due_cents - item.paid_cents <= 0) return false;
      if (onlyIncomplete && missingRegistrationFields(item).length === 0) return false;
      if (!query) return true;
      return item.reference_code.toLowerCase().includes(query) || item.child_name.toLowerCase().includes(query);
    });
  }, [items,filter,onlyBalance,onlyIncomplete,search]);

  // Built from whatever programs actually have registrations, so a newly
  // added program (e.g. Futprep Out East) gets its own filter automatically.
  const programFilters = useMemo(() => {
    const seen = new Map<string,string>();
    for (const item of items) if (!seen.has(item.program_slug)) seen.set(item.program_slug,item.program_name);
    return Array.from(seen.entries());
  }, [items]);

  async function copyRegistrationLink() {
    const url=`${window.location.origin}/futprep/register`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),1800);
  }

  const [notice,setNotice] = useState("");

  // One early-access link for one family (Part C), opened in WhatsApp for
  // staff to send by hand. Never bulk.
  async function sendReturnLink(item: StaffRegistration) {
    if (!item.parent_phone) return;
    setBusy(item.id);
    setNotice("");
    const response = await fetch("/api/futprep/staff/return-links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({registrationId:item.id})});
    const data = await response.json().catch(()=>({})) as { url?: string; termNames?: string[]; error?: string };
    setBusy(null);
    if (!response.ok || !data.url) { setNotice(data.error ?? "Could not create the link."); return; }
    await navigator.clipboard?.writeText(data.url).catch(()=>{});
    const terms = (data.termNames ?? []).join(" / ") || "next term";
    whatsappTo(item.parent_phone, `Hi! As a Futprep family you get early access to ${terms}. Register ${item.child_name.split(" ")[0]} here before it opens to everyone: ${data.url}`);
    setNotice(`Return link for ${item.child_name} copied and opened in WhatsApp.`);
  }

  async function patch(id:number, values: Record<string,string>) {
    setBusy(id);
    setNotice("");
    const response = await fetch(`/api/futprep/staff/registrations/${id}`,{
      method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)
    });
    setBusy(null);
    if (!response.ok) {
      const data = await response.json().catch(()=>({})) as { error?: string };
      setNotice(data.error ?? "Could not update the registration.");
      return;
    }
    setItems((current)=>current.map((item)=>item.id===id ? {...item,...{
      ...(values.registrationStatus ? {registration_status:values.registrationStatus}:{}),
      ...(values.paymentStatus ? {payment_status:values.paymentStatus}:{}),
    }} : item));
  }

  async function recordTransfer(item: StaffRegistration) {
    const dollars = Number(amounts[item.id] || item.amount_due_cents/100);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    setBusy(item.id);
    const response = await fetch("/api/futprep/staff/payments",{
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
      {notice && <p className="coach-manager-message" role="status">{notice}</p>}
      <div className="registration-share-card">
        <div><span className="section-kicker">Parent registration link</span><strong>/futprep/register</strong><p>Send this whenever a parent messages you. Their submission appears here automatically.</p></div>
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
        <button className={onlyBalance?"is-active":""} onClick={()=>setOnlyBalance((v)=>!v)}>Has a balance</button>
        <button className={onlyIncomplete?"is-active":""} onClick={()=>setOnlyIncomplete((v)=>!v)}>Details incomplete</button>
      </div>

      <div className="staff-registration-list">
        {visible.length===0 && <div className="dashboard-empty"><h3>No registrations yet.</h3></div>}
        {visible.map((item)=>{
          const missing = missingRegistrationFields(item);
          return (
          <article className="staff-registration-card" key={item.id}>
            <div className="staff-registration-head">
              <div><span className="panel-kicker">{item.reference_code}</span><h2>{item.child_name}</h2><p>{item.program_name} · {item.child_dob ?? "Date of birth pending"}</p></div>
              <div className="staff-status-stack">
                <span className="status status-submitted">{item.registration_status}</span>
                <span className="status status-approved">{item.payment_status}</span>
                <Link href={`/futprep/staff/admin/${item.id}`}>Open child →</Link>
              </div>
            </div>

            {missing.length > 0 && (
              <div className="pending-details-flag">
                <strong>Pending details</strong> — missing: {missing.join(", ")}.
                {item.parent_phone && <button type="button" onClick={() => openCompletionWhatsApp(item)}>Send completion link on WhatsApp →</button>}
              </div>
            )}

            <div className="staff-info-grid">
              <div><span>Parent / guardian</span><strong>{item.parent_name ?? "Not on file yet"}</strong><small>{item.parent_email ?? ""}<br/>{item.parent_phone ?? ""}</small></div>
              <div><span>Emergency contact</span><strong>{item.emergency_contact_name ?? "Not on file yet"}</strong><small>{item.emergency_contact_phone ?? ""}</small></div>
              <div><span>Payment</span><strong>{item.payment_frequency==="term" ? "Full term" : "Weekly"} · {paymentMethodLabel(item.payment_method)}</strong><small>Due {money(item.amount_due_cents)} · Recorded {money(item.paid_cents)} · <span className={item.amount_due_cents-item.paid_cents>0 ? "money-outstanding" : "money-settled"}>Balance {money(Math.max(0,item.amount_due_cents-item.paid_cents))}</span></small></div>
              <div><span>Photo / video</span><strong>{item.photo_consent === "yes" ? "Allowed" : item.photo_consent === "no" ? "Not allowed" : "No information on file yet"}</strong></div>
            </div>

            {(item.registration_status==="waitlist" || item.registration_status==="trial") && (
              <div className="pending-details-flag">
                {item.registration_status==="waitlist" ? (
                  <>
                    <strong>Waitlist</strong> — the class was full when this was sent.
                    <button type="button" disabled={busy===item.id} onClick={()=>patch(item.id,{registrationStatus:"pending"})}>Promote from waitlist</button>
                  </>
                ) : (
                  <>
                    <strong>Free taster</strong> — one Saturday, no charge.
                    {item.parent_phone && <button type="button" onClick={()=>openJoinWhatsApp(item)}>Send &ldquo;join the rest of the term&rdquo; on WhatsApp →</button>}
                  </>
                )}
              </div>
            )}

            <div className="staff-actions">
              {item.parent_phone && item.registration_status!=="trial" && item.registration_status!=="waitlist" && (
                <button type="button" disabled={busy===item.id} title="One early-access link for this family, sent by you on WhatsApp" onClick={()=>sendReturnLink(item)}>Copy return link</button>
              )}
              <button disabled={busy===item.id || ["pending_details","trial","waitlist"].includes(item.registration_status)} title={item.registration_status==="pending_details" ? "The parent needs to finish this registration first" : item.registration_status==="waitlist" ? "Promote from the waitlist first" : item.registration_status==="trial" ? "A free trial is one Saturday; send the join link instead" : undefined} onClick={()=>patch(item.id,{registrationStatus:"confirmed"})}>Confirm registration</button>
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
          );
        })}
      </div>
    </>
  );
}
