import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { requireFutprepStaff, currentFutprepStaffCanViewMedical, currentFutprepStaffId, currentFutprepStaffName } from "../../staff-auth";
import { canSeeMedical, COACH_WORKSPACE_ROLES } from "@/lib/futprepRoles";
import { coachSlotPrompt } from "@/db/coaches";
import {
  getFutprepSessionPlan,
  getFutprepWorkLog,
  listFutprepStaffRegistrations,
  listFutprepStaffSessions,
  rosterForSession,
} from "@/db/staff";
import { getSessionStaff, listPayCoaches } from "@/db/coachPay";
import { CoachRoster } from "./CoachRoster";
import { CoachSessionTools } from "./CoachSessionTools";
import { StaffLogoutButton } from "../StaffLogoutButton";
import "../coaches.css";

export const dynamic = "force-dynamic";

export default async function FutprepCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; program?: string }>;
}) {
  // The Saturday nudge email links to one session's roster. A coach is
  // usually signed out by then, so the session is kept through the sign-in.
  const { session, program } = await searchParams;
  // Brief 31 (D): admins too, for passports (Antonio coaches as Coach Bex on an admin login).
  const role = await requireFutprepStaff([...COACH_WORKSPACE_ROLES], session && /^[0-9]+$/.test(session) ? `/futprep/staff/coach?session=${session}` : "/futprep/staff/coach");
  const readOnly = role === "helper";
  // An admin here gets the roster for passports and attendance, without the
  // emergency, pickup and health columns: the desk's own views carry those
  // (rule 3; brief 31 D review). Switch back: drop the two `admin` checks.
  const admin = role === "admin";
  const healthShown = !readOnly && !admin && canSeeMedical(role, await currentFutprepStaffCanViewMedical());
  const [staffName, sessions, staffId] = await Promise.all([
    currentFutprepStaffName(),
    listFutprepStaffSessions(),
    currentFutprepStaffId(),
  ]);
  // Brief 16, C1: a coach whose login is linked to a bookable profile with
  // no open times is pointed at the slot editor. Helpers aren't coaches.
  const slotPrompt = !readOnly && staffId ? await coachSlotPrompt(staffId).catch(() => null) : null;
  // Program -> term -> day (brief 06 v2): a program tab, then its days.
  // A ?session= link wins; else ?program=; else the next session overall.
  const requested = Number(session);
  const requestedProgram = Number(program);
  const today = new Date().toISOString().slice(0,10);
  const inProgram = (id: number) => sessions.filter((item)=>item.program_id===id);
  const selected = sessions.find((item)=>item.id===requested)
    ?? (requestedProgram ? inProgram(requestedProgram).find((item)=>item.session_date>=today) ?? inProgram(requestedProgram)[0] : undefined)
    ?? sessions.find((item)=>item.session_date>=today)
    ?? sessions[0];
  const programTabs = sessions.filter((item, index, all)=>all.findIndex((other)=>other.program_id===item.program_id)===index);
  const pickerSessions = selected ? inProgram(selected.program_id) : [];

  const [roster, registrations, sessionPlan, workLog, sessionStaff, payCoaches] = selected
    ? await Promise.all([
        // A helper's roster is fetched without the emergency, pickup and
        // health columns, so they never reach that browser.
        // Brief 31 (A1): a coach login gets the health columns only when
        // the CEO has switched its medical view on; the CEO always does.
        rosterForSession(selected.id, { includeSafety: !readOnly && !admin, includeHealth: healthShown }),
        listFutprepStaffRegistrations(),
        getFutprepSessionPlan(selected.id),
        getFutprepWorkLog(selected.id, staffName ?? role),
        // Brief 13: who coached (names and roles only; never pay).
        getSessionStaff(selected.id).catch(() => ({ entries: [], suggestedLead: null })),
        listPayCoaches().catch(() => []),
      ])
    : [[], [], null, null, { entries: [], suggestedLead: null }, []];

  // Only the payment fields: these rows become page data in the browser.
  const paymentRows = selected
    ? registrations
        .filter((item)=>item.program_slug===selected.program_slug)
        .map((item)=>({ id: item.id, amount_due_cents: item.amount_due_cents, paid_cents: item.paid_cents, payment_method: item.payment_method, payment_status: item.payment_status }))
    : [];

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · Coaching workspace</span></div>
        <nav>
          {role==="ceo" && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          {!readOnly && <Link href="/futprep/staff/private-sessions">Private sessions</Link>}
          {!readOnly && <Link href="/futprep/staff/my-days">My days</Link>}
          {!readOnly && <Link href="/futprep/staff/programs">Programs</Link>}
          {!readOnly && <Link href="/futprep/staff/pay">Coach pay</Link>}
          {role==="ceo" && <Link href="/futprep/staff/contracts">Contracts</Link>}
          <Link href="/sports-fitness/futprep-athletics/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">{staffName ?? "Coach"} · {readOnly ? "session helper" : "coaching operations"}</span><h1>{selected?.program_type === "camp" ? "Camp days." : selected?.program_type === "contract" ? "School sessions." : "Sessions."}</h1></div>
          <p>{readOnly
            ? "See which session is up, who's on the roster, and the coach's plan for it."
            : "Plan sessions, tell parents what to expect for the future parent area, track your hours, view payment readiness, see safety information, and mark attendance."}</p>
        </div>

        {slotPrompt?.needsSlots && (
          <Link className="staff-prompt" href={`/futprep/staff/private-sessions?coach=${slotPrompt.coachId}#weekly-slots`}>
            <div><strong>Add your weekly slots so parents can book.</strong><br /><span>Your card on the coaches page says &ldquo;Schedule not posted yet&rdquo; until you do.</span></div>
            <span className="prompt-arrow">Open the slot editor <span aria-hidden="true">→</span></span>
          </Link>
        )}

        {programTabs.length > 1 && (
          <nav className="staff-filter" aria-label="Program">
            {programTabs.map((item)=>(
              <Link key={item.program_id} className={selected?.program_id===item.program_id ? "is-active" : ""} href={`?program=${item.program_id}`}>
                {item.program_name}{item.program_type==="camp" ? " · camp" : ""}
              </Link>
            ))}
          </nav>
        )}

        <div className="session-picker">
          {pickerSessions.map((item)=>(
            <Link className={`${selected?.id===item.id ? "is-active" : ""}${item.over_cap ? " is-over-cap" : ""}`} href={`?session=${item.id}`} key={item.id}>
              <span>{item.session_date}{item.is_taster ? " · taster" : ""}</span><strong>{item.term_name || item.program_name}</strong><small>{item.start_time}</small>
              {/* Brief 12: more families registered than the coaches on duty allow. */}
              {item.over_cap && <em className="session-over-cap" title={`${item.registered} registered; ${item.coaches_on_duty} on duty allow ${item.effective_cap}`}>Over cap: {item.registered}/{item.effective_cap}</em>}
            </Link>
          ))}
        </div>

        {selected && !readOnly && (
          <p className="coach-export">
            <a className="secondary-button" href={`/api/futprep/staff/roster-csv?program=${selected.program_id}&term=${selected.term_id}`}>Download {selected.program_name} · {selected.term_name} roster (CSV, no medical details) ↓</a>
          </p>
        )}

        {selected?.over_cap && (
          <p className="coach-cap-warning" role="status">
            {selected.registered} children are registered, but {selected.coaches_on_duty} {selected.coaches_on_duty === 1 ? "coach" : "coaches"} on duty allow {selected.effective_cap}. Add a coach under &ldquo;Coaches today&rdquo;, or new families will keep going to the waitlist.
          </p>
        )}

        {selected ? (
          <>
            <CoachSessionTools session={selected} initialPlan={sessionPlan} initialWorkLog={workLog} readOnly={readOnly} />
            <CoachRoster session={selected} initialRoster={roster} registrations={paymentRows} readOnly={readOnly} healthHidden={!readOnly && !healthShown} coachOptions={payCoaches.map((coach) => ({ id: coach.id, name: coach.name }))} initialStaff={readOnly ? sessionStaff.entries.map((entry) => ({ ...entry, locked: false })) : sessionStaff.entries} suggestedLead={sessionStaff.suggestedLead} />
          </>
        ) : <div className="dashboard-empty"><h3>No sessions scheduled.</h3></div>}
      </section>
    </main>
  );
}
