import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOrganization,
  getOrganizationStats,
  getRegistrationCountsByProgram,
  listOrganizationLocations,
  listOrganizationPrograms,
  listOrganizationStaff,
  listUpcomingSessions,
} from "@/db/organizations";
import { requirePortpassAdmin } from "@/lib/admin-session";

const navigation = [
  ["dashboard","Dashboard"],["programs","Programs"],["locations","Locations"],
  ["coaches","Coaches"],["registrations","Registrations"],["payments","Payments"],
  ["schedule","Schedule"],["messages","Messages"],["settings","Settings"],
] as const;

function money(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-BS",{style:"currency",currency:"BSD",minimumFractionDigits:0}).format(cents/100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-BS",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));
}

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string; section?: string[] }>;
}) {
  const { id, section: parts } = await params;
  await requirePortpassAdmin(`/organizations/${id}${parts?.length ? `/${parts.join("/")}` : ""}`);

  const organizationId = Number(id);
  if (!Number.isInteger(organizationId) || organizationId < 1) notFound();

  const organization = await getOrganization(organizationId);
  if (!organization) notFound();

  const section = parts?.[0] ?? "dashboard";
  if (!navigation.some(([key]) => key === section)) notFound();

  const [stats,programs,locations,staff,sessions,registrationCounts] = await Promise.all([
    getOrganizationStats(organizationId),
    listOrganizationPrograms(organizationId),
    listOrganizationLocations(organizationId),
    listOrganizationStaff(organizationId),
    listUpcomingSessions(organizationId,20),
    getRegistrationCountsByProgram(organizationId),
  ]);

  const isFutprep = /futprep|footprep/i.test(organization.name);
  const title = navigation.find(([key])=>key===section)?.[1] ?? "Dashboard";

  return (
    <main className="organization-app">
      <aside className="organization-sidebar">
        <Link className="brand organization-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="organization-switcher">
          <span>Organization</span><strong>{organization.name}</strong><small>{organization.activity_type}</small>
        </div>
        <nav className="organization-nav">
          {navigation.map(([key,label]) => (
            <Link className={section===key ? "is-active" : ""} href={key==="dashboard" ? `/organizations/${organizationId}` : `/organizations/${organizationId}/${key}`} key={key}>
              <span className="nav-dot"/>{label}
            </Link>
          ))}
        </nav>
        <div className="organization-sidebar-foot"><span>PortPass early access</span><small>Bahamas pilot</small></div>
      </aside>

      <section className="organization-main">
        <header className="organization-topbar">
          <div><span className="mobile-organization-label">{organization.name}</span><h1>{title}</h1></div>
          <div className="organization-top-actions">
            {isFutprep && <Link className="dashboard-secondary-action" href="/futprep/lil-kickers">Parent registration ↗</Link>}
            <span className="organization-avatar">{organization.name.slice(0,1).toUpperCase()}</span>
          </div>
        </header>

        <div className="organization-content">
          {section === "dashboard" && (
            <>
              <div className="dashboard-welcome">
                <div><span className="section-kicker">Organization overview</span><h2>Welcome to {organization.name}.</h2></div>
                <p>{organization.activity_type} · {organization.main_location}</p>
              </div>
              <div className="dashboard-stats">
                <article><span>Total players</span><strong>{stats.totalPlayers}</strong><small>Active registrations</small></article>
                <article><span>Active programs</span><strong>{stats.activePrograms}</strong><small>Currently open</small></article>
                <article><span>Upcoming sessions</span><strong>{stats.upcomingSessions}</strong><small>Scheduled ahead</small></article>
                <article><span>Pending payments</span><strong>{stats.pendingPayments}</strong><small>Needs follow-up</small></article>
                <article><span>New registrations</span><strong>{stats.newRegistrations}</strong><small>Past 7 days</small></article>
              </div>
              {isFutprep && programs.length > 0 ? (
                <div className="dashboard-grid">
                  <article className="dashboard-panel dashboard-feature">
                    <div className="panel-head">
                      <div><span className="panel-kicker">Term 1 pilot</span><h3>Lil Kickers is ready for registration.</h3></div>
                      <Link href="/futprep/lil-kickers/register">Open form ↗</Link>
                    </div>
                    <div className="mini-program-list">
                      {programs.map((program)=>(
                        <div key={program.id}>
                          <div><strong>{program.name}</strong><span>Ages {program.age_min}–{program.age_max} · {program.day_of_week} {program.start_time}</span></div>
                          <div className="mini-capacity"><strong>{program.registrations}/{program.capacity}</strong><span>registered</span></div>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="dashboard-panel">
                    <div className="panel-head"><div><span className="panel-kicker">Next up</span><h3>Upcoming sessions</h3></div></div>
                    <div className="mini-session-list">
                      {sessions.slice(0,4).map((session)=><div key={session.id}><span>{date(session.session_date)}</span><strong>{session.program_name}</strong><small>{session.start_time}</small></div>)}
                    </div>
                  </article>
                </div>
              ) : <Empty text="Programs, locations, coaches, and registrations will appear here as your organization gets started." />}
            </>
          )}

          {section === "programs" && (
            <Section kicker="Programs" title="Organize classes and age groups." copy="Keep each registerable program clear: who it is for, when it runs, capacity, and pricing.">
              {programs.length ? <div className="management-grid">{programs.map((program)=>(
                <article className="management-card" key={program.id}>
                  <div className="management-card-top"><span className="status status-approved">Active</span><span>{program.registrations}/{program.capacity} registered</span></div>
                  <h3>{program.name}</h3>
                  <p>Ages {program.age_min}–{program.age_max} · {program.day_of_week} · {program.start_time}</p>
                  <dl className="management-details">
                    <div><dt>Location</dt><dd>{program.location}</dd></div>
                    <div><dt>Term</dt><dd>{program.term_name ?? "—"}</dd></div>
                    <div><dt>Weekly</dt><dd>{money(program.weekly_fee_cents)}</dd></div>
                    <div><dt>Full term</dt><dd>{money(program.term_fee_cents)}</dd></div>
                  </dl>
                </article>
              ))}</div> : <Empty text="No programs have been created yet." />}
              {isFutprep && <Callout title="Share the parent registration link" text="/futprep/lil-kickers/register"><Link className="primary-button" href="/futprep/lil-kickers/register">Open registration →</Link></Callout>}
            </Section>
          )}

          {section === "locations" && (
            <Section kicker="Locations" title="Where your programs happen." copy="Locations keep schedules and registrations tied to the right field or facility.">
              {locations.length ? <div className="management-grid">{locations.map((location)=>(
                <article className="management-card" key={location.id}><span className="panel-kicker">Active location</span><h3>{location.name}</h3><p>{location.address}</p><div className="location-pin">⌖ {location.map_label ?? location.name}</div></article>
              ))}</div> : <Empty text="No locations have been added yet." />}
            </Section>
          )}

          {section === "coaches" && (
            <Section kicker="Team" title="Coaches and program staff." copy="Separate coaching work from registration and payment administration.">
              {staff.length ? <div className="management-grid">{staff.map((member)=>(
                <article className="management-card" key={member.id}><span className="panel-kicker">{member.role==="coach" ? "Coach" : "Admin / registrar"}</span><h3>{member.name}</h3><p>{member.responsibilities}</p><div className="staff-access">{member.email ?? "Account email to be added"}</div></article>
              ))}</div> : <Empty text="No coaches or staff have been added yet." />}
            </Section>
          )}

          {section === "registrations" && (
            <Section kicker="Registrations" title="Track enrollment without the spreadsheet." copy="Enrollment and payment status stay connected to the correct program.">
              {registrationCounts.length ? <div className="registration-summary-grid">{registrationCounts.map((item)=>(
                <article key={item.program_name}><span>{item.program_name}</span><strong>{item.registrations}</strong><small>{Math.max(0,item.capacity-item.registrations)} spots remaining</small><div><span>{item.pending_payments ?? 0} payment pending</span><span>{item.paid ?? 0} paid</span></div></article>
              ))}</div> : <Empty text="No registrations have been received yet." />}
              {isFutprep && <Callout title="Parent registration is ready." text="Cash and bank transfer are active. Online payment is marked Coming Soon."><Link className="primary-button" href="/futprep/lil-kickers/register">Test registration →</Link></Callout>}
            </Section>
          )}

          {section === "payments" && (
            <Section kicker="Payments" title="Know what has and hasn’t been paid." copy="For the pilot, Futprep accepts cash and bank transfer.">
              <div className="dashboard-stats compact-stats">
                <article><span>Pending</span><strong>{stats.pendingPayments}</strong><small>Needs confirmation</small></article>
                <article><span>Cash</span><strong>Active</strong><small>A coach records it</small></article>
                <article><span>Bank transfer</span><strong>Active</strong><small>Admin verifies it</small></article>
                <article><span>Online</span><strong>Soon</strong><small>Coming later</small></article>
              </div>
              {isFutprep && <Callout title="Admin workspace" text="Detailed payment confirmation and registration actions are the next protected staff module." />}
            </Section>
          )}

          {section === "schedule" && (
            <Section kicker="Schedule" title="Term 1 at a glance." copy="Saturday sessions are laid out around the two October break weekends.">
              {sessions.length ? <div className="schedule-list">{sessions.map((session)=>(
                <article key={session.id}><div className="schedule-date"><strong>{date(session.session_date)}</strong></div><div><strong>{session.program_name}</strong><span>{session.start_time}</span></div><span className="schedule-location">{session.location}</span><span className="status status-approved">{session.status}</span></article>
              ))}</div> : <Empty text="No sessions are scheduled yet." />}
            </Section>
          )}

          {section === "messages" && <Section kicker="Messages" title="Keep families in the loop." copy="Basic in-app announcements are part of Stage 1."><Empty text="Messaging will be connected after the registration and staff workflows are complete." /></Section>}

          {section === "settings" && (
            <Section kicker="Settings" title="Organization details." copy="Keep the basics accurate so registrations and schedules use the right information.">
              <dl className="settings-list">
                <div><dt>Organization</dt><dd>{organization.name}</dd></div>
                <div><dt>Main sport</dt><dd>{organization.activity_type}</dd></div>
                <div><dt>Main location</dt><dd>{organization.main_location}</dd></div>
                <div><dt>Primary contact</dt><dd>{organization.primary_contact}</dd></div>
                <div><dt>Email</dt><dd>{organization.email}</dd></div>
                <div><dt>Phone</dt><dd>{organization.phone}</dd></div>
              </dl>
            </Section>
          )}
        </div>
      </section>
    </main>
  );
}

function Section({kicker,title,copy,children}:{kicker:string;title:string;copy:string;children:React.ReactNode}) {
  return <><div className="management-intro"><span className="section-kicker">{kicker}</span><h2>{title}</h2><p>{copy}</p></div>{children}</>;
}
function Empty({text}:{text:string}) {
  return <div className="dashboard-empty small-empty"><h3>Nothing here yet.</h3><p>{text}</p></div>;
}
function Callout({title,text,children}:{title:string;text:string;children?:React.ReactNode}) {
  return <div className="management-callout"><div><strong>{title}</strong><span>{text}</span></div>{children}</div>;
}
