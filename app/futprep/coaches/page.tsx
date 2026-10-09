import { BrandLogo } from "@/app/_components/BrandLogo";
import { CoachPhoto } from "@/app/_components/CoachPhoto";
import Link from "next/link";
import { currentFutprepStaffId, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { coachSlotPrompt, listFutprepPrivateServices, listPublicCoachProfiles } from "@/db/coaches";
import { isUploadedCoachPhoto } from "@/lib/imageUpload";
import { money, sessionButtonLabel } from "@/lib/privateSessions";
import { workingDaysLabel } from "@/lib/workingDays";
import "./booking-days.css";
import { initialsOf } from "@/lib/team";
import { PrivateSessionBooking } from "./PrivateSessionBooking";

// force-dynamic (not ISR/revalidate) because this repo's CI build has no
// Supabase credentials available at build time, and a numeric revalidate
// makes Next try to prerender this page's DB-backed data during `next build`.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Futprep coaches and private sessions in Nassau | PortPass",
  description: "Meet Futprep Athletics' coaches and book a private football session in Nassau. Real prices and times, booked online.",
  alternates: { canonical: "https://portpassbahamas.com/futprep/coaches" },
};

function dayLabel(value:string){
  return new Intl.DateTimeFormat("en-BS",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));
}

export default async function FutprepCoachesPage(){
  const [{schemaReady,coaches},services,staffId]=await Promise.all([
    listPublicCoachProfiles(),
    // Only confirmed (published) prices are offered to parents.
    listFutprepPrivateServices({publishedOnly:true}).catch(()=>[]),
    // Brief 16, C1: a coach signed in to the staff area sees a prompt on
    // their own card while their schedule is empty. Parents never do: the
    // prompt needs the staff cookie and a login linked to this coach. A
    // helper can't open the slot editor, so a helper never sees it either.
    Promise.all([currentFutprepStaffId(),currentFutprepStaffRole()]).then(([id,role])=>role&&role!=="helper"?id:null).catch(()=>null),
  ]);
  const own=staffId?await coachSlotPrompt(staffId).catch(()=>null):null;
  const bookable=coaches.filter((coach)=>coach.bookable && coach.member_type==="coach");
  const bookingCoaches=bookable.map((c)=>({id:c.id,displayName:c.display_name,workingDays:c.working_days??[],slots:c.availability.filter((s)=>s.status==="available").map((s)=>({id:s.id,date:s.availability_date,startTime:s.start_time,endTime:s.end_time,location:s.location}))}));
  const bookingServices=services.map((s)=>({slug:s.slug,name:s.name,priceCents:s.priceCents,priceUnit:s.priceUnit,kind:s.kind,durationMinutes:s.durationMinutes,minChildren:s.minChildren,maxChildren:s.maxChildren,perChildCents:s.perChildCents}));
  // Brief 29, part B: the button reads the published sessions ("30 min $35 ·
  // 60 min $70"), and the party button is there only while a party service
  // is published.
  const sessionLabel=sessionButtonLabel(services);
  const partyService=services.find((s)=>s.kind==="party"&&s.priceCents!==null);
  const partyLabel=partyService?`Book a party · ${money(partyService.priceCents!)} →`:null;

  return (
    <main className="futprep-team-page">
      <header className="futprep-team-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <nav><Link href="/sports-fitness/futprep-athletics">Futprep home</Link> <Link href="/futprep/camps">Holiday camps</Link></nav>
      </header>

      <section className="futprep-team-hero">
        <span>Futprep Athletics · Team</span>
        <h1>The people behind<br/>the <em>progress.</em></h1>
        <p>Meet the coaches and team members shaping the Futprep experience on the field and in the community.</p>
        <PrivateSessionBooking coaches={bookingCoaches} services={bookingServices} schemaReady={schemaReady} triggerLabel="Book a private session →" />
      </section>

      <section className="futprep-team-grid">
        {coaches.map((coach)=>(
          <article className="futprep-team-card" id={coach.slug} key={coach.slug}>
            <div className={isUploadedCoachPhoto(coach.photo_url) ? "futprep-team-photo is-square" : "futprep-team-photo"}>
              {coach.photo_url ? <CoachPhoto src={coach.photo_url} alt={coach.display_name} fallback={<div className="futprep-team-initial"><span className="coach-initials" aria-hidden="true">{initialsOf(coach.display_name)}</span></div>} /> : <div className="futprep-team-initial"><span className="coach-initials" aria-hidden="true">{initialsOf(coach.display_name)}</span></div>}
              <span>{coach.member_type==="coach" ? "Coach" : "Team"}</span>
            </div>
            <div className="futprep-team-copy">
              <small>{coach.position_title}</small>
              <h2>{coach.display_name}</h2>
              {coach.nickname && <p className="coach-nickname">&ldquo;{coach.nickname}&rdquo;</p>}
              <p>{coach.bio}</p>
              {(coach.licenses.length>0 || coach.played_at.length>0 || coach.favorite_player || coach.favorite_team) && (
                <dl className="coach-facts">
                  {coach.licenses.length>0 && <div><dt>Licenses</dt><dd>{coach.licenses.join(" · ")}</dd></div>}
                  {coach.played_at.length>0 && <div><dt>Played at</dt><dd>{coach.played_at.join(" · ")}</dd></div>}
                  {coach.favorite_player && <div><dt>Favorite player</dt><dd>{coach.favorite_player}</dd></div>}
                  {coach.favorite_team && <div><dt>Favorite team</dt><dd>{coach.favorite_team}</dd></div>}
                </dl>
              )}
              {own?.coachId===coach.id && own.needsSlots && (
                <Link className="coach-own-prompt" href={`/futprep/staff/private-sessions?coach=${coach.id}#weekly-slots`}>
                  <strong>This is your card.</strong> <span>Add your weekly slots so parents can book</span> <span className="prompt-arrow" aria-hidden="true">→</span>
                </Link>
              )}
              {coach.bookable && (
                <div className="coach-availability">
                  <strong>Availability</strong>
                  {(coach.working_days??[]).length>0 && <span className="availability-days">{workingDaysLabel(coach.working_days)} · suggest a time</span>}
                  {(()=>{const open=coach.availability.filter((s)=>s.status==="available").slice(0,3);return open.length ? open.map((slot)=>(
                    <span className={`availability-${slot.status}`} key={slot.id}>{dayLabel(slot.availability_date)} · {slot.start_time}–{slot.end_time}</span>
                  )) : (coach.working_days??[]).length===0 && <span className="availability-unset">Schedule not posted yet — you can still request a time.</span>;})()}
                  <div className="coach-book-actions">
                    <PrivateSessionBooking coaches={bookingCoaches} services={bookingServices} schemaReady={schemaReady} preferredCoachId={coach.id>0?coach.id:undefined} defaultKind="session" triggerLabel={sessionLabel} />
                    {partyLabel && <PrivateSessionBooking coaches={bookingCoaches} services={bookingServices} schemaReady={schemaReady} preferredCoachId={coach.id>0?coach.id:undefined} defaultKind="party" triggerLabel={partyLabel} />}
                  </div>
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
        <PrivateSessionBooking coaches={bookingCoaches} services={bookingServices} schemaReady={schemaReady} triggerLabel="Start a request →" />
      </section>

      <footer className="futprep-team-footer">
        <span>Futprep Athletics · Booking and payments powered by PortPass</span>
        <Link href="/futprep/staff/login">Staff login</Link>
      </footer>
    </main>
  );
}
