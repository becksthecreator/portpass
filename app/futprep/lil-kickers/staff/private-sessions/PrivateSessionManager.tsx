"use client";
import { useState } from "react";
import type { CoachProfile, PrivateSessionRequest } from "@/db/coaches";

export function PrivateSessionManager({initialRequests,coaches,schemaReady}:{initialRequests:PrivateSessionRequest[];coaches:CoachProfile[];schemaReady:boolean}){
  const [requests,setRequests]=useState(initialRequests);
  const [message,setMessage]=useState("");
  async function act(id:number,action:string,coachId?:number,targetCoachId?:number,reason?:string){
    setMessage("");
    const response=await fetch(`/api/futprep/private-sessions/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,coachId,targetCoachId,reason})});
    const data=await response.json() as {error?:string;requests?:PrivateSessionRequest[]};
    if(!response.ok){setMessage(data.error??"Could not update request.");return;}
    if(data.requests)setRequests(data.requests);
    setMessage("Updated.");
  }
  return <div className="private-session-manager">
    {message&&<p className="coach-manager-message">{message}</p>}
    {!requests.length&&<div className="dashboard-empty"><h3>No private-session requests yet.</h3><p>Requests from the public coach page will appear here.</p></div>}
    {requests.map((request)=><article className="private-request-card" key={request.id}>
      <div className="private-request-head"><div><span className={`request-type request-${request.request_type}`}>{request.request_type==="birthday"?"Birthday":"Private lesson"}</span><h2>{request.child_name}, age {request.child_age}</h2><p>{request.parent_name} · {request.parent_phone} · {request.parent_email}</p></div><span className={`request-status status-${request.status}`}>{request.status}</span></div>
      <div className="private-request-grid">
        <div><span>Requested</span><strong>{request.requested_date} · {request.requested_start_time}</strong><small>{request.duration_minutes} min</small></div>
        <div><span>Preferred coach</span><strong>{request.preferred_coach_name??"Any available coach"}</strong><small>Assigned: {request.assigned_coach_name??"Not yet"}</small></div>
        <div><span>Location</span><strong>{request.location_preference||"Flexible"}</strong></div>
        <div><span>Goal / occasion</span><strong>{request.session_goal||"Not provided"}</strong><small>{request.notes}</small></div>
      </div>
      {request.status==="declined"&&request.decline_reason&&<p className="request-alert">Decline reason: {request.decline_reason}</p>}
      {request.status==="referred"&&!request.parent_notified_at&&<p className="request-alert">Parent notification required before the handoff is considered complete.</p>}
      {request.parent_notified_at&&<p className="request-ok">Parent informed ✓</p>}
      <div className="private-request-actions">
        <select id={`coach-${request.id}`} defaultValue={request.assigned_coach_id??request.preferred_coach_id??""}><option value="">Choose coach</option>{coaches.filter((c)=>c.bookable).map((coach)=><option value={coach.id} key={coach.id}>{coach.display_name}</option>)}</select>
        <button disabled={!schemaReady} onClick={()=>{const el=document.getElementById(`coach-${request.id}`) as HTMLSelectElement|null;act(request.id,"accept",Number(el?.value)||undefined);}}>Accept</button>
        <button disabled={!schemaReady} onClick={()=>{const reason=prompt("Why are you declining this request?");if(reason)act(request.id,"decline",undefined,undefined,reason);}}>Decline</button>
        <button disabled={!schemaReady} onClick={()=>{const el=document.getElementById(`coach-${request.id}`) as HTMLSelectElement|null;const target=Number(el?.value);if(!target)return alert("Choose the coach receiving the referral first.");const note=prompt("Referral note (optional):")??"";act(request.id,"refer",request.assigned_coach_id??undefined,target,note);}}>Refer</button>
        {request.status==="referred"&&!request.parent_notified_at&&<button disabled={!schemaReady} onClick={()=>act(request.id,"parent_notified")}>Parent informed</button>}
        {request.status==="accepted"&&<button disabled={!schemaReady} onClick={()=>act(request.id,"complete")}>Complete</button>}
      </div>
    </article>)}
  </div>;
}
