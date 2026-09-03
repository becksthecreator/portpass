import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
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
  searchParams: Promise<{ session?: string }>;
}) {
  const role = await requireFutprepStaff(["coach","ceo"], "/futprep/lil-kickers/staff/coach");
  const sessions = await listFutprepStaffSessions();
  const { session } = await searchParams;
  const requested = Number(session);
  const today = new Date().toISOString().slice(0,10);
  const selected = sessions.find((item)=>item.id===requested)
    ?? sessions.find((item)=>item.session_date>=today)
    ?? sessions[0];

  const [roster, registrations, sessionPlan, workLog] = selected
    ? await Promise.all([
        rosterForSession(selected.id),
        listFutprepStaffRegistrations(),
        getFutprepSessionPlan(selected.id),
        getFutprepWorkLog(selected.id),
      ])
    : [[], [], null, null];

  const paymentRows = selected
    ? registrations.filter((item)=>item.program_slug===selected.program_slug)
    : [];

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link><span className="staff-workspace-label">Futprep · Coach Bex</span></div>
        <nav>
          {role==="ceo" && <Link href="/futprep/lil-kickers/staff/ceo">CEO overview</Link>}
          <Link href="/futprep/lil-kickers/staff/private-sessions">Private sessions</Link>
          <Link href="/futprep/lil-kickers/staff/notes">Notes</Link>
          <Link href="/futprep/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Coach Bex · coaching operations</span><h1>Saturday sessions.</h1></div>
          <p>Plan sessions, tell parents what to expect for the future parent area, track your hours, view payment readiness, see safety information, and mark attendance.</p>
        </div>

        <div className="session-picker">
          {sessions.map((item)=>(
            <Link className={selected?.id===item.id ? "is-active":""} href={`?session=${item.id}`} key={item.id}>
              <span>{item.session_date}</span><strong>{item.program_name}</strong><small>{item.start_time}</small>
            </Link>
          ))}
        </div>

        {selected ? (
          <>
            <CoachSessionTools session={selected} initialPlan={sessionPlan} initialWorkLog={workLog} />
            <CoachRoster session={selected} initialRoster={roster} registrations={paymentRows} />
          </>
        ) : <div className="dashboard-empty"><h3>No sessions scheduled.</h3></div>}
      </section>
    </main>
  );
}
