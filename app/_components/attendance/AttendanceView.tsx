import Link from "next/link";
import { getBusinessSessionRoster, listBusinessSessions } from "@/db/businessAttendance";
import { nassauToday } from "@/lib/futprepTerms";
import { AttendanceRegister } from "./AttendanceRegister";
import "@/app/business/[slug]/registrations/registrations.css";
import "./attendance.css";

// A business's attendance register (brief 18, part B), drawn the same way
// through either door: the team's own sign-in (/business/<slug>/attendance)
// and the demo (/demo/attendance). Names only: nothing about a child's
// health, emergency contact or pickup is read for it.

const dayLabel = (iso: string, today: string) =>
  iso === today ? "Today" : new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export async function AttendanceView({
  organizationId,
  businessName,
  basePath,
  endpoint,
  sessionId,
  homeHref,
  homeLabel,
}: {
  organizationId: number;
  businessName: string;
  // This screen's own address: a session opens at `${basePath}?session=<id>`.
  basePath: string;
  // Where a mark is sent.
  endpoint: string;
  sessionId: number | null;
  homeHref: string;
  homeLabel: string;
}) {
  const today = nassauToday();
  const sessions = await listBusinessSessions(organizationId, today);
  const roster = sessionId ? await getBusinessSessionRoster(organizationId, sessionId) : null;

  if (sessionId && roster) {
    return (
      <>
        <div className="eyebrow"><span className="eyebrow-dot" />{dayLabel(roster.session.date, today)} · {roster.session.startTime}</div>
        <h1>{roster.session.programName}</h1>
        <p className="auth-lead">{roster.session.location}. Mark each person as they arrive; every press is saved straight away.</p>
        {roster.rows.length === 0 ? <p className="auth-lead">Nobody is registered for this session yet.</p> : <AttendanceRegister endpoint={endpoint} sessionId={roster.session.id} rows={roster.rows} />}
        <p className="auth-alt"><Link href={basePath}>All sessions</Link></p>
      </>
    );
  }

  const past = sessions.filter((s) => s.date <= today);
  const coming = sessions.filter((s) => s.date > today).reverse();
  const line = (s: (typeof sessions)[number]) => (
    <li key={s.id}>
      <div>
        <strong><Link href={`${basePath}?session=${s.id}`}>{s.programName}</Link></strong>
        <span>{dayLabel(s.date, today)} · {s.startTime} · {s.location}</span>
      </div>
      <div className="reg-list-state">
        <b>{s.marked} of {s.expected}</b>
        <span>{s.expected === 0 ? "Nobody registered" : s.marked === 0 ? (s.date <= today ? "Not marked" : "Coming up") : s.marked >= s.expected ? "Marked" : "Part marked"}</span>
      </div>
    </li>
  );

  return (
    <>
      <div className="eyebrow"><span className="eyebrow-dot" />{businessName}</div>
      <h1>Attendance</h1>
      <p className="auth-lead">Who came to each session. Open a session to mark its register; the growth report counts who showed up from here.</p>
      {sessionId && !roster && <p className="form-error" role="alert">That session isn&rsquo;t one of yours.</p>}
      <section className="account-section" aria-labelledby="att-past">
        <h2 id="att-past">Today and the last three weeks</h2>
        {past.length === 0 ? <p className="auth-lead">No sessions yet. A class&rsquo;s sessions appear here once it has a term.</p> : <ul className="reg-list">{past.map(line)}</ul>}
      </section>
      {coming.length > 0 && (
        <section className="account-section" aria-labelledby="att-next">
          <h2 id="att-next">Coming up</h2>
          <ul className="reg-list">{coming.map(line)}</ul>
        </section>
      )}
      <p className="auth-alt"><Link href={homeHref}>{homeLabel}</Link></p>
    </>
  );
}
