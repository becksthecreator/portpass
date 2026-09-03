"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  FutprepNote,
  FutprepNoteCategory,
  FutprepNotePriority,
  FutprepNoteStatus,
} from "@/db/notes";

const categories:{value:FutprepNoteCategory;label:string}[]=[
  {value:"product",label:"Product"},
  {value:"operations",label:"Operations"},
  {value:"content",label:"Content"},
  {value:"lead",label:"Lead"},
  {value:"brand",label:"Brand"},
  {value:"issue",label:"Issue"},
  {value:"idea",label:"Idea"},
];

function accountLabel(value:string){
  if(value==="admin") return "Kiki";
  if(value==="coach") return "Coach Bex";
  if(value==="ceo") return "Coach Alex";
  if(value==="kione") return "Coach Kione";
  if(value==="adon") return "Adon";
  return value;
}

export function NotesManager({
  initialNotes,
  schemaReady,
}:{
  initialNotes:FutprepNote[];
  schemaReady:boolean;
}) {
  const [notes,setNotes]=useState(initialNotes);
  const [filter,setFilter]=useState<"all"|FutprepNoteStatus>("inbox");
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [category,setCategory]=useState<FutprepNoteCategory>("idea");
  const [priority,setPriority]=useState<FutprepNotePriority>("normal");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const visible=useMemo(
    ()=>filter==="all" ? notes : notes.filter((note)=>note.status===filter),
    [notes,filter]
  );

  async function refresh(){
    const response=await fetch("/api/futprep/lil-kickers/staff/notes",{cache:"no-store"});
    if(!response.ok) return;
    const data=await response.json() as {notes?:FutprepNote[]};
    if(data.notes) setNotes(data.notes);
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    setBusy(true); setMessage("");
    try{
      const response=await fetch("/api/futprep/lil-kickers/staff/notes",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({title,body,category,priority}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error??"Could not save note.");
      setTitle(""); setBody(""); setCategory("idea"); setPriority("normal");
      setMessage("Saved to the notes inbox.");
      await refresh();
    }catch(error){
      setMessage(error instanceof Error ? error.message : "Could not save note.");
    }finally{
      setBusy(false);
    }
  }

  async function changeStatus(id:number,status:FutprepNoteStatus){
    if(id<0){setMessage("Run the notes migration first; these starter notes are read-only previews.");return;}
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/futprep/lil-kickers/staff/notes",{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id,status}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error??"Could not update note.");
      await refresh();
    }catch(error){
      setMessage(error instanceof Error ? error.message : "Could not update note.");
    }finally{
      setBusy(false);
    }
  }

  return <div className="notes-workspace">
    <aside className="notes-capture">
      <span className="section-kicker">Quick capture</span>
      <h2>Drop the thought here.</h2>
      <p>Save product ideas, problems, leads, content thoughts and anything we need to come back to.</p>
      <form onSubmit={submit}>
        <label><span>Title</span><input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="What is this about?" required /></label>
        <label><span>Note</span><textarea rows={7} value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Write it exactly as it came to you. We can organize it later." required /></label>
        <div className="notes-form-row">
          <label><span>Category</span><select value={category} onChange={(e)=>setCategory(e.target.value as FutprepNoteCategory)}>{categories.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Priority</span><select value={priority} onChange={(e)=>setPriority(e.target.value as FutprepNotePriority)}><option value="normal">Normal</option><option value="high">High</option></select></label>
        </div>
        <button className="primary-button" disabled={busy||!schemaReady} type="submit">{busy?"Saving…":"Save note →"}</button>
      </form>
      {!schemaReady&&<small className="notes-schema-note">The interface is ready. Run the notes migration once to turn on saving; the strategy notes shown on the right are already staged as a preview.</small>}
      {message&&<p className="notes-message">{message}</p>}
    </aside>

    <section className="notes-inbox">
      <div className="notes-inbox-head">
        <div><span className="section-kicker">Shared thinking</span><h2>Notes inbox.</h2></div>
        <div className="notes-counts"><span>{notes.filter(n=>n.status==="inbox").length} inbox</span><span>{notes.filter(n=>n.priority==="high"&&n.status==="inbox").length} high priority</span></div>
      </div>

      <div className="staff-filter notes-filter">
        {(["inbox","actioned","archived","all"] as const).map((value)=><button type="button" className={filter===value?"is-active":""} onClick={()=>setFilter(value)} key={value}>{value}</button>)}
      </div>

      <div className="notes-list">
        {visible.length===0&&<div className="notes-empty">Nothing in this view yet.</div>}
        {visible.map((note)=><article className={`note-card note-${note.priority}`} key={note.id}>
          <div className="note-card-top">
            <div className="note-tags"><span>{note.category}</span>{note.priority==="high"&&<span className="note-priority">High priority</span>}</div>
            <small>{new Date(note.created_at).toLocaleDateString("en-BS",{month:"short",day:"numeric"})}</small>
          </div>
          <h3>{note.title}</h3>
          <p>{note.body}</p>
          <div className="note-card-bottom">
            <small>Added by {accountLabel(note.created_by)}</small>
            <div>
              {note.status!=="actioned"&&note.status!=="archived"&&<button disabled={busy} type="button" onClick={()=>changeStatus(note.id,"actioned")}>Mark actioned</button>}
              {note.status==="actioned"&&<button disabled={busy} type="button" onClick={()=>changeStatus(note.id,"inbox")}>Return to inbox</button>}
              {note.status!=="archived"&&<button disabled={busy} type="button" onClick={()=>changeStatus(note.id,"archived")}>Archive</button>}
            </div>
          </div>
        </article>)}
      </div>
    </section>
  </div>;
}
