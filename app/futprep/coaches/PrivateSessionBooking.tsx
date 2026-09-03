"use client";

import { FormEvent, useMemo, useState } from "react";

type CoachChoice={id:number;displayName:string};

export function PrivateSessionBooking({
  coaches,schemaReady,preferredCoachId,triggerLabel,
}:{
  coaches:CoachChoice[];schemaReady:boolean;preferredCoachId?:number;triggerLabel:string;
}){
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [reference,setReference]=useState("");
  const today=useMemo(()=>new Date().toISOString().slice(0,10),[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setBusy(true);setError("");
    const form=new FormData(event.currentTarget);
    try{
      const response=await fetch("/api/futprep/private-sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        requestType:form.get("requestType"),
        preferredCoachId:Number(form.get("preferredCoachId"))||null,
        parentName:form.get("parentName"),
        parentEmail:form.get("parentEmail"),
        parentPhone:form.get("parentPhone"),
        childName:form.get("childName"),
        childAge:Number(form.get("childAge")),
        requestedDate:form.get("requestedDate"),
        requestedStartTime:form.get("requestedStartTime"),
        durationMinutes:Number(form.get("durationMinutes")),
        locationPreference:form.get("locationPreference"),
        sessionGoal:form.get("sessionGoal"),
        notes:form.get("notes"),
      })});
      const data=await response.json() as {referenceCode?:string;error?:string};
      if(!response.ok) throw new Error(data.error??"Could not send your request.");
      setReference(data.referenceCode??"Sent");
    }catch(e){setError(e instanceof Error?e.message:"Could not send your request.");}
    finally{setBusy(false);}
  }

  return <>
    <button className="private-session-trigger" type="button" onClick={()=>setOpen(true)}>{triggerLabel}</button>
    {open && <div className="private-session-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}>
      <aside className="private-session-drawer" role="dialog" aria-modal="true" aria-label="Request a Futprep session" onMouseDown={(e)=>e.stopPropagation()}>
        <button className="private-session-close" type="button" onClick={()=>setOpen(false)} aria-label="Close">×</button>
        {reference ? <div className="private-session-success">
          <span>Request mailed</span>
          <div className="request-mail-scene" aria-hidden="true">
            <div className="request-mail-card">
              <div className="request-mail-stamp">FP</div>
              <div className="request-mail-lines"><i/><i/><i/></div>
            </div>
            <div className="request-mail-boat">
              <svg viewBox="0 0 180 120" role="presentation">
                <path className="request-boat-hull" d="M29 78h121l-20 25H52z" />
                <path className="request-boat-mast" d="M89 24v57" />
                <path className="request-boat-sail request-boat-sail-main" d="M93 28v48h48z" />
                <path className="request-boat-sail request-boat-sail-mail" d="M85 35v40H48z" />
                <path className="request-boat-mail-fold" d="M50 38l18 14 16-14" />
              </svg>
            </div>
            <div className="request-mail-water"><i/><i/><i/></div>
          </div>
          <h2>On its way.</h2>
          <p>Your request has sailed over to the Futprep coaching team. It is not confirmed until a coach accepts it.</p>
          <div className="request-reference"><small>Keep this reference</small><strong>{reference}</strong></div>
          <button type="button" onClick={()=>setOpen(false)}>Done</button>
        </div> : <>
          <span className="private-session-kicker">Futprep private sessions</span>
          <h2>Tell us what your child needs.</h2>
          <p className="private-session-intro">Stay on this page while you request a private lesson or birthday session. A coach will review the request before it is confirmed.</p>
          {!schemaReady && <p className="private-session-warning">Booking storage is being connected. The form will be active after the Futprep coach migration is installed.</p>}
          <form onSubmit={submit}>
            <div className="private-session-two">
              <label><span>Request type</span><select name="requestType" defaultValue="private_lesson"><option value="private_lesson">Private lesson</option><option value="birthday">Birthday session</option></select></label>
              <label><span>Preferred coach</span><select name="preferredCoachId" defaultValue={preferredCoachId??""}><option value="">Any available coach</option>{coaches.map((coach)=><option value={coach.id} key={coach.id}>{coach.displayName}</option>)}</select></label>
            </div>
            <div className="private-session-two">
              <label><span>Parent / guardian</span><input name="parentName" required /></label>
              <label><span>Phone</span><input name="parentPhone" required /></label>
            </div>
            <label><span>Email</span><input name="parentEmail" type="email" required /></label>
            <div className="private-session-two">
              <label><span>Child name</span><input name="childName" required /></label>
              <label><span>Child age</span><input name="childAge" type="number" min="1" max="18" required /></label>
            </div>
            <div className="private-session-two">
              <label><span>Requested date</span><input name="requestedDate" type="date" min={today} required /></label>
              <label><span>Preferred start time</span><input name="requestedStartTime" type="time" required /></label>
            </div>
            <div className="private-session-two">
              <label><span>Length</span><select name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></label>
              <label><span>Location preference</span><input name="locationPreference" placeholder="Lyford Cay, home, other…" /></label>
            </div>
            <label><span>What should the coach focus on?</span><textarea name="sessionGoal" rows={3} placeholder="Confidence, first touch, shooting, birthday games…" /></label>
            <label><span>Anything else?</span><textarea name="notes" rows={2} /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="private-session-submit" disabled={busy || !schemaReady} type="submit">{busy?"Sending…":"Send request →"}</button>
          </form>
        </>}
      </aside>
    </div>}
  </>;
}
