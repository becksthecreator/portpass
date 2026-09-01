import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import {
  listFutprepStaffRegistrations,
  listFutprepStaffSessions,
  rosterForSession,
} from "@/db/staff";
import { CoachRoster } from "./CoachRoster";

export const dynamic = "force-dynamic";

export default async function FutprepCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  await requireFutprepStaff(["coach","admin"], "/futprep/lil-kickers/staff/coach");
  const sessions = await listFutprepStaffSessions();
  const { session } = await searchParams;
  const requested = Number(session);
  const today = new Date().toISOString().slice(0,10);
  const selected = sessions.find((item)=>item.id===requested)
    ?? sessions.find((item)=>item.session_date>=today)
    ?? sessions[0];

  const [roster, registrations] = selected
    ? await Promise.all([rosterForSession(selected.id), listFutprepStaffRegistrations()])
    : [[], []];

  const paymentRows = selected
    ? registrations.filter((item)=>item.program_slug===selected.program_slug)
    : [];

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link><span className="staff-workspace-label">Futprep · Coach Bex</span></div>
        <nav><Link href="/futprep/lil-kickers/staff/admin">Admin view</Link><Link href="/futprep/lil-kickers">Parent view ↗</Link></nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Roster & attendance</span><h1>Saturday sessions.</h1></div>
          <p>View the correct class roster, see relevant safety information, mark attendance, and record cash payments.</p>
        </div>

        <div className="session-picker">
          {sessions.map((item)=>(
            <Link className={selected?.id===item.id ? "is-active":""} href={`?session=${item.id}`} key={item.id}>
              <span>{item.session_date}</span><strong>{item.program_name}</strong><small>{item.start_time}</small>
            </Link>
          ))}
        </div>

        {selected ? <CoachRoster session={selected} initialRoster={roster} registrations={paymentRows} /> : <div className="dashboard-empty"><h3>No sessions scheduled.</h3></div>}
      </section>
    </main>
  );
}
