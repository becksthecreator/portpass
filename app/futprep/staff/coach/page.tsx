import Link from "next/link";
import { requireFutprepStaff, currentFutprepStaffName } from "../../staff-auth";
import {
  getFutprepSessionPlan,
  getFutprepWorkLog,
  listFutprepStaffRegistrations,
  listFutprepStaffSessions,
  rosterForSession,
} from "@/db/staff";
import { CoachRoster } from "./CoachRoster";
import { CoachSessionTools } from "./CoachSessionTools";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

export default async function FutprepCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; program?: string }>;
}) {
  const role = await requireFutprepStaff(["coach","ceo","helper"], "/futprep/staff/coach");
  const readOnly = role === "helper";
  const [staffName, sessions, { session, program }] = await Promise.all([
    currentFutprepStaffName(),
    listFutprepStaffSessions(),
    searchParams,
  ]);
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

  const [roster, registrations, sessionPlan, workLog] = selected
    ? await Promise.all([
        rosterForSession(selected.id),
        listFutprepStaffRegistrations(),
        getFutprepSessionPlan(selected.id),
        getFutprepWorkLog(selected.id, staffName ?? role),
      ])
    : [[], [], null, null];

  const paymentRows = selected
    ? registrations.filter((item)=>item.program_slug===selected.program_slug)
    : [];

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link><span className="staff-workspace-label">Futprep · Coaching workspace</span></div>
        <nav>
          {role==="ceo" && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          {!readOnly && <Link href="/futprep/staff/private-sessions">Private sessions</Link>}
          {!readOnly && <Link href="/futprep/staff/programs">Programs</Link>}
          <Link href="/sports-fitness/futprep-athletics/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">{staffName ?? "Coach"} · {readOnly ? "session helper" : "coaching operations"}</span><h1>{selected?.program_type === "camp" ? "Camp days." : "Sessions."}</h1></div>
          <p>{readOnly
            ? "See which session is up, who's on the roster, and the coach's plan for it."
            : "Plan sessions, tell parents what to expect for the future parent area, track your hours, view payment readiness, see safety information, and mark attendance."}</p>
        </div>

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
            <Link className={selected?.id===item.id ? "is-active":""} href={`?session=${item.id}`} key={item.id}>
              <span>{item.session_date}</span><strong>{item.term_name || item.program_name}</strong><small>{item.start_time}</small>
            </Link>
          ))}
        </div>

        {selected && !readOnly && (
          <p className="coach-export">
            <a className="secondary-button" href={`/api/futprep/staff/roster-csv?program=${selected.program_id}&term=${selected.term_id}`}>Download {selected.program_name} · {selected.term_name} roster (CSV, no medical details) ↓</a>
          </p>
        )}

        {selected ? (
          <>
            <CoachSessionTools session={selected} initialPlan={sessionPlan} initialWorkLog={workLog} readOnly={readOnly} />
            <CoachRoster session={selected} initialRoster={roster} registrations={paymentRows} readOnly={readOnly} />
          </>
        ) : <div className="dashboard-empty"><h3>No sessions scheduled.</h3></div>}
      </section>
    </main>
  );
}
