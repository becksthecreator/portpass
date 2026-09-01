import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import {
  listFutprepSessionPlans,
  listFutprepStaffRegistrations,
  listFutprepStaffSessions,
  listFutprepWorkLogs,
} from "@/db/staff";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

function money(cents:number) {
  return new Intl.NumberFormat("en-BS",{
    style:"currency",
    currency:"BSD",
    minimumFractionDigits:0,
  }).format(cents/100);
}

export default async function FutprepCeoPage() {
  await requireFutprepStaff(["ceo"], "/futprep/lil-kickers/staff/ceo");

  const [registrations,sessions,plans,workLogs] = await Promise.all([
    listFutprepStaffRegistrations(),
    listFutprepStaffSessions(),
    listFutprepSessionPlans(),
    listFutprepWorkLogs(),
  ]);

  const today=new Date().toISOString().slice(0,10);
  const upcoming=sessions.filter((item)=>item.session_date>=today && item.status==="scheduled");
  const paid=registrations.filter((item)=>item.payment_status==="paid");
  const awaiting=registrations.filter((item)=>["pending","partial","overdue"].includes(item.payment_status));
  const totalRecorded=registrations.reduce((sum,item)=>sum+item.paid_cents,0);
  const coachHours=workLogs
    .filter((item)=>item.staff_name==="Coach Bex")
    .reduce((sum,item)=>sum+Number(item.hours),0);

  const planBySession=new Map(plans.map((item)=>[item.session_id,item]));
  const workBySession=new Map(workLogs.filter((item)=>item.staff_name==="Coach Bex").map((item)=>[item.session_id,item]));

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <span className="staff-workspace-label">Futprep · Coach Alex · CEO</span>
        </div>
        <nav>
          <Link href="/futprep/lil-kickers/staff/admin">Kiki area</Link>
          <Link href="/futprep/lil-kickers/staff/coach">Coach Bex area</Link>
          <Link href="/futprep/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>

      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Coach Alex · CEO oversight</span><h1>Futprep overview.</h1></div>
          <p>See registration, payment, session, coaching-plan, attendance-area, and staff-hour activity from one place. You can also enter Kiki or Coach Bex&apos;s workspace when you need the full detail.</p>
        </div>

        <div className="ceo-summary-grid">
          <article><span>Registrations</span><strong>{registrations.length}</strong><small>{registrations.filter((item)=>item.registration_status==="confirmed").length} confirmed</small></article>
          <article><span>Paid</span><strong>{paid.length}</strong><small>{money(totalRecorded)} recorded</small></article>
          <article><span>Awaiting payment</span><strong>{awaiting.length}</strong><small>Pending, partial or overdue</small></article>
          <article><span>Upcoming sessions</span><strong>{upcoming.length}</strong><small>{upcoming[0]?.session_date ?? "No upcoming date"}</small></article>
          <article><span>Coach Bex hours</span><strong>{coachHours.toFixed(1)}</strong><small>Hours logged</small></article>
        </div>

        <div className="ceo-access-grid">
          <Link href="/futprep/lil-kickers/staff/admin">
            <span className="section-kicker">Kiki</span>
            <h2>Registration desk</h2>
            <p>Registrations, parent contacts, payment tracking, bank transfers and confirmation.</p>
            <strong>Open Kiki area →</strong>
          </Link>
          <Link href="/futprep/lil-kickers/staff/coach">
            <span className="section-kicker">Coach Bex</span>
            <h2>Coaching area</h2>
            <p>Session plans, parent-day notes, roster safety information, attendance, cash and hours.</p>
            <strong>Open coaching area →</strong>
          </Link>
        </div>

        <section className="ceo-panel">
          <div className="ceo-panel-head">
            <div><span className="section-kicker">Registration snapshot</span><h2>Who is ready.</h2></div>
            <Link href="/futprep/lil-kickers/staff/admin">Manage registrations →</Link>
          </div>
          <div className="ceo-registration-table">
            {registrations.length===0 && <p>No registrations yet.</p>}
            {registrations.slice(0,12).map((item)=>(
              <div key={item.id}>
                <div><strong>{item.child_name}</strong><span>{item.program_name}</span></div>
                <span>{item.registration_status}</span>
                <span>{item.payment_status}</span>
                <span>{money(item.paid_cents)} recorded</span>
              </div>
            ))}
          </div>
        </section>

        <section className="ceo-panel">
          <div className="ceo-panel-head">
            <div><span className="section-kicker">Coaching operations</span><h2>Plans & hours.</h2></div>
            <Link href="/futprep/lil-kickers/staff/coach">Open coaching area →</Link>
          </div>
          <div className="ceo-session-table">
            {sessions.map((session)=>{
              const plan=planBySession.get(session.id);
              const work=workBySession.get(session.id);
              return (
                <Link href={`/futprep/lil-kickers/staff/coach?session=${session.id}`} key={session.id}>
                  <div><strong>{session.session_date}</strong><span>{session.program_name} · {session.start_time}</span></div>
                  <span className={plan?.plan_text ? "ceo-ready":"ceo-missing"}>{plan?.plan_text ? "Plan ready":"Plan needed"}</span>
                  <span className={plan?.parent_note ? "ceo-ready":"ceo-missing"}>{plan?.parent_note ? "Parent note ready":"Parent note needed"}</span>
                  <span>{work ? `${Number(work.hours).toFixed(1)} hrs` : "Hours not logged"}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
