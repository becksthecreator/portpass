import Link from "next/link";
import { listPublicCoachProfiles } from "@/db/coaches";
import { PrivateSessionBooking } from "./PrivateSessionBooking";

// Coach profiles/availability change rarely (staff-edited), so this page is
// cached and re-rendered at most every 30s instead of on every visitor.
export const revalidate=30;

function dayLabel(value:string){
  return new Intl.DateTimeFormat("en-BS",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));
}

export default async function FutprepCoachesPage(){
  const {schemaReady,coaches}=await listPublicCoachProfiles();
  const bookable=coaches.filter((coach)=>coach.bookable && coach.member_type==="coach");

  return (
    <main className="futprep-team-page">
      <header className="futprep-team-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <nav><Link href="/futprep">Futprep home</Link><Link href="/futprep/programs">Programs</Link><Link href="/futprep/lil-kickers/staff/login">Staff login</Link></nav>
      </header>

      <section className="futprep-team-hero">
        <span>Futprep Athletics · Team</span>
        <h1>The people behind<br/>the <em>progress.</em></h1>
        <p>Meet the coaches and team members shaping the Futprep experience on the field and in the community.</p>
        <PrivateSessionBooking coaches={bookable.map(({id,display_name})=>({id,displayName:display_name}))} schemaReady={schemaReady} triggerLabel="Request a private session →" />
      </section>

      <section className="futprep-team-grid">
        {coaches.map((coach)=>(
          <article className="futprep-team-card" key={coach.slug}>
            <div className="futprep-team-photo">
              {coach.photo_url ? <img src={coach.photo_url} alt={coach.display_name} /> : <div className="futprep-team-initial">{coach.display_name.split(" ").filter(Boolean).slice(-1)[0]?.slice(0,1) ?? "F"}</div>}
              <span>{coach.member_type==="coach" ? "Coach" : "Team"}</span>
            </div>
            <div className="futprep-team-copy">
              <small>{coach.position_title}</small>
              <h2>{coach.display_name}</h2>
              <p>{coach.bio}</p>
              {(coach.licenses.length>0 || coach.played_at.length>0 || coach.favorite_player || coach.favorite_team) && (
                <dl className="coach-facts">
                  {coach.licenses.length>0 && <div><dt>Licenses</dt><dd>{coach.licenses.join(" · ")}</dd></div>}
                  {coach.played_at.length>0 && <div><dt>Played at</dt><dd>{coach.played_at.join(" · ")}</dd></div>}
                  {coach.favorite_player && <div><dt>Favorite player</dt><dd>{coach.favorite_player}</dd></div>}
                  {coach.favorite_team && <div><dt>Favorite team</dt><dd>{coach.favorite_team}</dd></div>}
                </dl>
              )}
              {coach.bookable && (
                <div className="coach-availability">
                  <strong>Availability</strong>
                  {coach.availability.length ? coach.availability.slice(0,5).map((slot)=>(
                    <span className={`availability-${slot.status}`} key={slot.id}>{dayLabel(slot.availability_date)} · {slot.start_time}–{slot.end_time} · {slot.status}</span>
                  )) : <span className="availability-unset">Schedule not posted yet — you can still request a time.</span>}
                  <PrivateSessionBooking coaches={bookable.map(({id,display_name})=>({id,displayName:display_name}))} schemaReady={schemaReady} preferredCoachId={coach.id>0?coach.id:undefined} triggerLabel={`Request ${coach.display_name.replace("Coach ","")} →`} />
                </div>
              )}
              {coach.testimonial_quote && <blockquote>“{coach.testimonial_quote}”{coach.testimonial_name && <cite>— {coach.testimonial_name}</cite>}</blockquote>}
              {coach.intro_video_url && <a className="coach-video-link" href={coach.intro_video_url} target="_blank" rel="noreferrer">Watch introduction ↗</a>}
            </div>
          </article>
        ))}
      </section>

      <section className="futprep-team-note">
        <div><span>Private lessons + birthdays</span><h2>Request it here. Keep the conversation simple.</h2></div>
        <p>A request is not confirmed until a coach accepts it. If a coach needs to refer the session, Futprep tracks the handoff and the parent must be informed.</p>
        <PrivateSessionBooking coaches={bookable.map(({id,display_name})=>({id,displayName:display_name}))} schemaReady={schemaReady} triggerLabel="Start a request →" />
      </section>
    </main>
  );
}
