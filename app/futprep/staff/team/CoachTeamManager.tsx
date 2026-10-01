"use client";
import { ChangeEvent, FormEvent, useState } from "react";
import type { CoachProfile } from "@/db/coaches";
import { squareCropBox } from "@/lib/imageUpload";
import { initialsOf } from "@/lib/team";

// Brief 16, C2: a coach photo is cropped to a centred square in the
// browser and resampled to at most 1000px before upload, so nothing near
// the 4 MB cap is ever sent.
// Falls back to the original file where the browser can't draw it.
async function squarePhoto(file:File):Promise<Blob>{
  try{
    const bitmap=await createImageBitmap(file);
    const {sx,sy,size,out}=squareCropBox(bitmap.width,bitmap.height);
    const canvas=document.createElement("canvas");
    canvas.width=out;canvas.height=out;
    const context=canvas.getContext("2d")!;
    // JPEG has no transparency: a cut-out PNG would otherwise turn black.
    context.fillStyle="#ffffff";
    context.fillRect(0,0,out,out);
    context.drawImage(bitmap,sx,sy,size,size,0,0,out,out);
    bitmap.close?.();
    const blob=await new Promise<Blob|null>((resolve)=>canvas.toBlob(resolve,"image/jpeg",0.86));
    if(!blob) throw new Error("toBlob failed");
    return blob;
  }catch{
    return file;
  }
}

export function CoachTeamManager({initialCoaches,schemaReady}:{initialCoaches:CoachProfile[];schemaReady:boolean}){
  const [coaches,setCoaches]=useState(initialCoaches);
  const [message,setMessage]=useState("");
  const [uploadingId,setUploadingId]=useState<number|null>(null);
  // Shown on the coach's own card: the page-level message can be far above
  // it on a phone.
  const [photoNote,setPhotoNote]=useState<{id:number;text:string}|null>(null);

  async function uploadPhoto(coach:CoachProfile,event:ChangeEvent<HTMLInputElement>){
    const input=event.currentTarget;
    const file=input.files?.[0];
    if(!file) return;
    setPhotoNote(null);
    setUploadingId(coach.id);
    const body=new FormData();
    body.append("coachId",String(coach.id));
    body.append("file",await squarePhoto(file),file.name.replace(/\.[^.]+$/,"")+".jpg");
    const response=await fetch("/api/futprep/team/photo",{method:"POST",body}).catch(()=>null);
    const data=response?((await response.json().catch(()=>({}))) as {error?:string;photoUrl?:string|null;coaches?:CoachProfile[]}):{};
    setUploadingId(null);
    input.value="";
    if(!response||!response.ok){setPhotoNote({id:coach.id,text:data.error??"Could not upload that photo."});return;}
    applyPhoto(coach.id,data);
    setPhotoNote({id:coach.id,text:"Photo updated. It shows on the coaches page and the Futprep home grid."});
  }

  async function removePhoto(coach:CoachProfile){
    if(!confirm(`Remove ${coach.display_name}'s photo? The card shows their initials until a new one is uploaded.`)) return;
    setPhotoNote(null);
    const response=await fetch("/api/futprep/team/photo",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({coachId:coach.id})}).catch(()=>null);
    const data=response?((await response.json().catch(()=>({}))) as {error?:string;photoUrl?:string|null;coaches?:CoachProfile[]}):{};
    if(!response||!response.ok){setPhotoNote({id:coach.id,text:data.error??"Could not remove that photo."});return;}
    applyPhoto(coach.id,data);
    setPhotoNote({id:coach.id,text:"Photo removed."});
  }

  // The route sends the refreshed list; if that re-read failed, the saved
  // photo is still patched into this page's copy of the coach.
  function applyPhoto(coachId:number,data:{photoUrl?:string|null;coaches?:CoachProfile[]}){
    if(data.coaches){setCoaches(data.coaches);return;}
    if(data.photoUrl!==undefined) setCoaches((current)=>current.map((c)=>c.id===coachId?{...c,photo_url:data.photoUrl??null}:c));
  }

  async function action(payload:Record<string,unknown>){
    setMessage("");
    const response=await fetch("/api/futprep/team",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await response.json() as {error?:string;coaches?:CoachProfile[]};
    if(!response.ok){setMessage(data.error??"Could not save.");return false;}
    if(data.coaches)setCoaches(data.coaches);
    setMessage("Saved.");
    return true;
  }

  async function add(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const formEl=event.currentTarget;
    const form=new FormData(formEl);
    const ok=await action({action:"save",displayName:form.get("displayName"),slug:form.get("slug"),positionTitle:form.get("positionTitle"),memberType:form.get("memberType"),bio:form.get("bio"),licenses:form.get("licenses"),playedAt:form.get("playedAt"),favoritePlayer:form.get("favoritePlayer"),favoriteTeam:form.get("favoriteTeam"),photoUrl:form.get("photoUrl"),introVideoUrl:form.get("introVideoUrl"),testimonialQuote:form.get("testimonialQuote"),testimonialName:form.get("testimonialName"),publicVisible:true,bookable:form.get("memberType")==="coach",sortOrder:100});
    if(ok) formEl.reset();
  }

  async function availability(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    await action({action:"availability",coachId:Number(form.get("coachId")),date:form.get("date"),startTime:form.get("startTime"),endTime:form.get("endTime"),status:form.get("status"),location:form.get("location"),note:form.get("note")});
  }

  return <div className="team-manager">
    {message&&<p className="coach-manager-message" role="status">{message}</p>}
    <div className="team-manager-grid">
      {coaches.map((coach)=><article className="team-manager-card" key={coach.id}>
        <div className="team-manager-head">
          {coach.photo_url ? <img className="team-manager-photo" src={coach.photo_url} alt="" /> : <span className="team-manager-photo team-manager-initials" aria-hidden="true">{initialsOf(coach.display_name)}</span>}
          <div><span>{coach.position_title}</span><h2>{coach.display_name}</h2>{coach.nickname&&<p className="coach-nickname">&ldquo;{coach.nickname}&rdquo;</p>}<p>{coach.bio||"Bio not added yet."}</p></div>
        </div>
        {coach.active&&<div className="team-photo-actions">
          <label className={"team-photo-upload"+(uploadingId===coach.id?" is-busy":"")+(!schemaReady||(uploadingId!==null&&uploadingId!==coach.id)?" is-disabled":"")}>
            <span>{uploadingId===coach.id?"Uploading…":coach.photo_url?"Replace photo":"Upload photo"}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={(coach.photo_url?"Replace the photo of ":"Upload a photo of ")+coach.display_name} disabled={!schemaReady||uploadingId!==null} onChange={(event)=>uploadPhoto(coach,event)} />
          </label>
          {coach.photo_url&&<button type="button" className="team-photo-remove" disabled={!schemaReady||uploadingId!==null} onClick={()=>removePhoto(coach)}>Remove photo</button>}
          {photoNote?.id===coach.id&&<span className="team-photo-note" role="status">{photoNote.text}</span>}
        </div>}
        <div className="team-manager-flags">
          {coach.active
            ? <><span className={coach.public_visible?"flag-on":"flag-off"}>{coach.public_visible?"Visible":"Hidden"}</span><span className={coach.bookable?"flag-on":"flag-off"}>{coach.bookable?"Bookable":"Not bookable"}</span></>
            : <span className="flag-off">Deleted</span>}
        </div>
        <div className="team-manager-actions">
          {coach.active ? <>
            <button disabled={!schemaReady||uploadingId!==null} onClick={()=>action({action:"save",id:coach.id,displayName:coach.display_name,slug:coach.slug,positionTitle:coach.position_title,memberType:coach.member_type,bio:coach.bio,licenses:coach.licenses.join(", "),playedAt:coach.played_at.join(", "),favoritePlayer:coach.favorite_player??"",favoriteTeam:coach.favorite_team??"",introVideoUrl:coach.intro_video_url??"",testimonialQuote:coach.testimonial_quote??"",testimonialName:coach.testimonial_name??"",publicVisible:!coach.public_visible,bookable:coach.bookable,sortOrder:coach.sort_order})}>{coach.public_visible?"Hide":"Unhide"}</button>
            <button disabled={!schemaReady||uploadingId!==null||coach.member_type!=="coach"} onClick={()=>action({action:"save",id:coach.id,displayName:coach.display_name,slug:coach.slug,positionTitle:coach.position_title,memberType:coach.member_type,bio:coach.bio,licenses:coach.licenses.join(", "),playedAt:coach.played_at.join(", "),favoritePlayer:coach.favorite_player??"",favoriteTeam:coach.favorite_team??"",introVideoUrl:coach.intro_video_url??"",testimonialQuote:coach.testimonial_quote??"",testimonialName:coach.testimonial_name??"",publicVisible:coach.public_visible,bookable:!coach.bookable,sortOrder:coach.sort_order})}>{coach.bookable?"Pause bookings":"Allow bookings"}</button>
            <button className="danger-action" disabled={!schemaReady} onClick={()=>{if(confirm(`Remove ${coach.display_name} from the active team? Booking history is kept, and you can restore the profile later from this page.`))action({action:"delete",id:coach.id});}}>Delete</button>
          </> : (
            <button disabled={!schemaReady} onClick={()=>action({action:"restore",id:coach.id})}>Restore</button>
          )}
        </div>
        <details className="team-profile-details"><summary>Profile details</summary><dl>
          <div><dt>Licenses</dt><dd>{coach.licenses.join(" · ")||"Not added"}</dd></div>
          <div><dt>Played at</dt><dd>{coach.played_at.join(" · ")||"Not added"}</dd></div>
          <div><dt>Favorite player</dt><dd>{coach.favorite_player||"Not added"}</dd></div>
          <div><dt>Favorite team</dt><dd>{coach.favorite_team||"Not added"}</dd></div>
          <div><dt>Photo</dt><dd>{coach.photo_url?"Added":"Not added"}</dd></div>
          <div><dt>Video</dt><dd>{coach.intro_video_url?"Added":"Not added"}</dd></div>
        </dl></details>
      </article>)}
    </div>

    <div className="team-admin-panels">
      <form className="team-admin-form" onSubmit={add}><span className="section-kicker">Add team member</span><h2>New profile.</h2>
        <div className="team-form-two"><label><span>Name</span><input name="displayName" required /></label><label><span>Slug</span><input name="slug" placeholder="ronaldo-greene" required /></label></div>
        <div className="team-form-two"><label><span>Position</span><input name="positionTitle" placeholder="Coach" required /></label><label><span>Type</span><select name="memberType"><option value="coach">Coach</option><option value="relations">Relations</option><option value="admin">Admin</option></select></label></div>
        <label><span>Bio</span><textarea name="bio" rows={3}/></label>
        <div className="team-form-two"><label><span>Licenses</span><input name="licenses" placeholder="Comma separated" /></label><label><span>Played at</span><input name="playedAt" placeholder="Comma separated" /></label></div>
        <div className="team-form-two"><label><span>Favorite player</span><input name="favoritePlayer" /></label><label><span>Favorite team</span><input name="favoriteTeam" /></label></div>
        <label><span>Photo URL</span><input name="photoUrl" /></label><label><span>Intro video URL</span><input name="introVideoUrl" /></label>
        <label><span>Testimonial quote</span><textarea name="testimonialQuote" rows={2}/></label><label><span>Testimonial name</span><input name="testimonialName" /></label>
        <button className="primary-button" disabled={!schemaReady}>Add team member →</button>
      </form>

      <form className="team-admin-form" onSubmit={availability}><span className="section-kicker">Coach calendar</span><h2>Set availability.</h2>
        <label><span>Coach</span><select name="coachId">{coaches.filter((c)=>c.member_type==="coach"&&c.active).map((coach)=><option value={coach.id} key={coach.id}>{coach.display_name}</option>)}</select></label>
        <div className="team-form-two"><label><span>Date</span><input name="date" type="date" required /></label><label><span>Status</span><select name="status"><option value="available">Available</option><option value="blocked">Unavailable</option><option value="booked">Booked</option></select></label></div>
        <div className="team-form-two"><label><span>Start</span><input name="startTime" type="time" required /></label><label><span>End</span><input name="endTime" type="time" required /></label></div>
        <label><span>Location</span><input name="location" /></label><label><span>Note</span><textarea name="note" rows={2}/></label>
        <button className="primary-button" disabled={!schemaReady}>Save availability →</button>
      </form>
    </div>
  </div>;
}
