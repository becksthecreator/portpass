"use client";
import { FormEvent, useState } from "react";
import type { CoachProfile } from "@/db/coaches";

export function CoachTeamManager({initialCoaches,schemaReady}:{initialCoaches:CoachProfile[];schemaReady:boolean}){
  const [coaches,setCoaches]=useState(initialCoaches);
  const [message,setMessage]=useState("");

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
    const form=new FormData(event.currentTarget);
    const ok=await action({action:"save",displayName:form.get("displayName"),slug:form.get("slug"),positionTitle:form.get("positionTitle"),memberType:form.get("memberType"),bio:form.get("bio"),licenses:form.get("licenses"),playedAt:form.get("playedAt"),favoritePlayer:form.get("favoritePlayer"),favoriteTeam:form.get("favoriteTeam"),photoUrl:form.get("photoUrl"),introVideoUrl:form.get("introVideoUrl"),testimonialQuote:form.get("testimonialQuote"),testimonialName:form.get("testimonialName"),publicVisible:true,bookable:form.get("memberType")==="coach",sortOrder:100});
    if(ok) event.currentTarget.reset();
  }

  async function availability(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    await action({action:"availability",coachId:Number(form.get("coachId")),date:form.get("date"),startTime:form.get("startTime"),endTime:form.get("endTime"),status:form.get("status"),location:form.get("location"),note:form.get("note")});
  }

  return <div className="team-manager">
    {message&&<p className="coach-manager-message">{message}</p>}
    <div className="team-manager-grid">
      {coaches.map((coach)=><article className="team-manager-card" key={coach.id}>
        <div><span>{coach.position_title}</span><h2>{coach.display_name}</h2><p>{coach.bio||"Bio not added yet."}</p></div>
        <div className="team-manager-flags"><span className={coach.public_visible?"flag-on":"flag-off"}>{coach.public_visible?"Visible":"Hidden"}</span><span className={coach.bookable?"flag-on":"flag-off"}>{coach.bookable?"Bookable":"Not bookable"}</span></div>
        <div className="team-manager-actions">
          <button disabled={!schemaReady} onClick={()=>action({action:"save",id:coach.id,displayName:coach.display_name,slug:coach.slug,positionTitle:coach.position_title,memberType:coach.member_type,bio:coach.bio,licenses:coach.licenses.join(", "),playedAt:coach.played_at.join(", "),favoritePlayer:coach.favorite_player??"",favoriteTeam:coach.favorite_team??"",photoUrl:coach.photo_url??"",introVideoUrl:coach.intro_video_url??"",testimonialQuote:coach.testimonial_quote??"",testimonialName:coach.testimonial_name??"",publicVisible:!coach.public_visible,bookable:coach.bookable,sortOrder:coach.sort_order})}>{coach.public_visible?"Hide":"Unhide"}</button>
          <button disabled={!schemaReady||coach.member_type!=="coach"} onClick={()=>action({action:"save",id:coach.id,displayName:coach.display_name,slug:coach.slug,positionTitle:coach.position_title,memberType:coach.member_type,bio:coach.bio,licenses:coach.licenses.join(", "),playedAt:coach.played_at.join(", "),favoritePlayer:coach.favorite_player??"",favoriteTeam:coach.favorite_team??"",photoUrl:coach.photo_url??"",introVideoUrl:coach.intro_video_url??"",testimonialQuote:coach.testimonial_quote??"",testimonialName:coach.testimonial_name??"",publicVisible:coach.public_visible,bookable:!coach.bookable,sortOrder:coach.sort_order})}>{coach.bookable?"Pause bookings":"Allow bookings"}</button>
          <button className="danger-action" disabled={!schemaReady} onClick={()=>{if(confirm(`Remove ${coach.display_name} from the active team? Booking history will be kept.`))action({action:"delete",id:coach.id});}}>Delete</button>
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
        <label><span>Coach</span><select name="coachId">{coaches.filter((c)=>c.member_type==="coach").map((coach)=><option value={coach.id} key={coach.id}>{coach.display_name}</option>)}</select></label>
        <div className="team-form-two"><label><span>Date</span><input name="date" type="date" required /></label><label><span>Status</span><select name="status"><option value="available">Available</option><option value="blocked">Unavailable</option><option value="booked">Booked</option></select></label></div>
        <div className="team-form-two"><label><span>Start</span><input name="startTime" type="time" required /></label><label><span>End</span><input name="endTime" type="time" required /></label></div>
        <label><span>Location</span><input name="location" /></label><label><span>Note</span><textarea name="note" rows={2}/></label>
        <button className="primary-button" disabled={!schemaReady}>Save availability →</button>
      </form>
    </div>
  </div>;
}
