"use client";

import { useMemo, useState } from "react";
import type { StaffSession, StaffSessionPlan, StaffWorkLog } from "@/db/staff";

export function CoachSessionTools({
  session,
  initialPlan,
  initialWorkLog,
  readOnly = false,
}: {
  session: StaffSession;
  initialPlan: StaffSessionPlan | null;
  initialWorkLog: StaffWorkLog | null;
  readOnly?: boolean;
}) {
  const [title,setTitle] = useState(initialPlan?.title ?? "");
  const [planText,setPlanText] = useState(initialPlan?.plan_text ?? "");
  const [parentNote,setParentNote] = useState(initialPlan?.parent_note ?? "");
  const [attachmentUrl,setAttachmentUrl] = useState(initialPlan?.attachment_url ?? "");
  const [workDate,setWorkDate] = useState(initialWorkLog?.work_date ?? session.session_date);
  const [startTime,setStartTime] = useState(initialWorkLog?.start_time ?? "");
  const [endTime,setEndTime] = useState(initialWorkLog?.end_time ?? "");
  const [hours,setHours] = useState(initialWorkLog ? String(initialWorkLog.hours) : "");
  const [notes,setNotes] = useState(initialWorkLog?.notes ?? "");
  const [saving,setSaving] = useState<"plan"|"hours"|null>(null);
  const [message,setMessage] = useState("");

  const calculatedHours = useMemo(() => {
    if (!startTime || !endTime) return null;
    const [sh,sm] = startTime.split(":").map(Number);
    const [eh,em] = endTime.split(":").map(Number);
    if (![sh,sm,eh,em].every(Number.isFinite)) return null;
    let minutes=(eh*60+em)-(sh*60+sm);
    if (minutes<0) minutes+=24*60;
    return Math.round((minutes/60)*100)/100;
  },[startTime,endTime]);

  function useCalculatedHours() {
    if (calculatedHours !== null) setHours(String(calculatedHours));
  }

  async function savePlan() {
    setSaving("plan"); setMessage("");
    const response = await fetch(`/api/futprep/lil-kickers/staff/sessions/${session.id}/plan`,{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({title,planText,parentNote,attachmentUrl}),
    });
    const data=await response.json() as {error?:string};
    setSaving(null);
    setMessage(response.ok ? "Session plan saved." : (data.error ?? "Could not save session plan."));
  }

  async function saveHours() {
    const parsed=Number(hours);
    if (!Number.isFinite(parsed) || parsed<0) {
      setMessage("Enter valid hours worked.");
      return;
    }
    setSaving("hours"); setMessage("");
    const response = await fetch(`/api/futprep/lil-kickers/staff/sessions/${session.id}/work-log`,{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({workDate,startTime,endTime,hours:parsed,notes}),
    });
    const data=await response.json() as {error?:string};
    setSaving(null);
    setMessage(response.ok ? "Work hours saved." : (data.error ?? "Could not save work hours."));
  }

  if (readOnly) {
    return (
      <section className="coach-tools-grid">
        <article className="coach-tool-panel">
          <span className="section-kicker">Session plan</span>
          <h2>{title || "No plan added yet."}</h2>
          {planText && <p className="coach-tool-readonly-text">{planText}</p>}
          {parentNote && <p className="coach-tool-hint">What parents were told: {parentNote}</p>}
          {attachmentUrl && <a className="header-link" href={attachmentUrl} target="_blank" rel="noreferrer">Open plan link ↗</a>}
        </article>
      </section>
    );
  }

  return (
    <section className="coach-tools-grid">
      <article className="coach-tool-panel">
        <span className="section-kicker">Session planning</span>
        <h2>Plan this session.</h2>
        <label><span>Plan title</span><input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g. Ball mastery + finishing" /></label>
        <label><span>Full session plan</span><textarea rows={8} value={planText} onChange={(e)=>setPlanText(e.target.value)} placeholder="Warm-up, technical work, games, progressions, equipment, coaching points…" /></label>
        <label><span>Plan link <small>(optional)</small></span><input type="url" value={attachmentUrl} onChange={(e)=>setAttachmentUrl(e.target.value)} placeholder="Google Drive, PDF, or other plan link" /></label>
        <label><span>What parents can expect</span><textarea rows={4} value={parentNote} onChange={(e)=>setParentNote(e.target.value)} placeholder="e.g. High-energy dribbling day. Bring water and arrive 10 minutes early." /></label>
        <p className="coach-tool-hint">This parent note is stored now and can appear automatically in parent accounts when that feature is turned on.</p>
        <button className="primary-button" type="button" disabled={saving==="plan"} onClick={savePlan}>{saving==="plan" ? "Saving…" : "Save session plan"}</button>
      </article>

      <article className="coach-tool-panel">
        <span className="section-kicker">Work log</span>
        <h2>Track hours.</h2>
        <div className="coach-work-grid">
          <label><span>Date</span><input type="date" value={workDate} onChange={(e)=>setWorkDate(e.target.value)} /></label>
          <label><span>Started</span><input type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} /></label>
          <label><span>Finished</span><input type="time" value={endTime} onChange={(e)=>setEndTime(e.target.value)} /></label>
          <label><span>Hours worked</span><input inputMode="decimal" value={hours} onChange={(e)=>setHours(e.target.value)} placeholder="0" /></label>
        </div>
        {calculatedHours !== null && <button className="calculated-hours" type="button" onClick={useCalculatedHours}>Use calculated time: {calculatedHours} hrs</button>}
        <label><span>Work notes</span><textarea rows={4} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Setup, coaching, pack down, parent conversations, etc." /></label>
        <button className="primary-button" type="button" disabled={saving==="hours"} onClick={saveHours}>{saving==="hours" ? "Saving…" : "Save work hours"}</button>
      </article>
      {message && <p className="coach-tool-message">{message}</p>}
    </section>
  );
}
