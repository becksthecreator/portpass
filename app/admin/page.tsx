import Link from "next/link";
import { getAdminOverview } from "@/db/adminStats";
import { requireAdmin } from "@/lib/auth/admin";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { backupState, deploymentInfo } from "@/lib/adminHealth";
import { shortDate } from "@/lib/growth";
import { AdminShell } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overview | PortPass admin",
  robots: { index: false, follow: false },
};

// A tile whose count failed shows a dash (db/adminStats.ts logs which one),
// never an error page.
const show = (value: number | null) => (value === null ? "—" : String(value));

// The Control Center's first screen: what needs attention, this week,
// the platform's shape. Each tile is a link to where the work happens.
export default async function AdminOverviewPage() {
  const session = await requireAdmin("/admin");
  const o = await getAdminOverview();
  const deployment = deploymentInfo();
  const backup = backupState(o.health.backup, new Date());
  const checkProblems = o.health.databaseChecks === null ? null : o.health.databaseChecks.reduce((sum, check) => sum + check.problems, 0);
  const backupDay = backup.at ? new Date(backup.at).toLocaleString("en-BS", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Nassau" }) : null;

  return (
    <AdminShell session={session} current="/admin" title="Overview" lede="What needs attention today, and how the week is going.">
      <section className="admin-group" aria-labelledby="needs">
        <h2 id="needs">Needs action</h2>
        <div className="admin-tiles">
          <Link className={`admin-tile${o.needsAction.businessesAwaiting ? " is-alert" : ""}`} href="/admin/businesses?status=submitted"><strong>{show(o.needsAction.businessesAwaiting)}</strong><span>Businesses awaiting approval</span></Link>
          <Link className={`admin-tile${o.needsAction.newApplications ? " is-alert" : ""}`} href="/admin/applications"><strong>{show(o.needsAction.newApplications)}</strong><span>New /apply submissions</span></Link>
          <Link className={`admin-tile${o.needsAction.unansweredLeads ? " is-alert" : ""}`} href="/weddings/admin"><strong>{show(o.needsAction.unansweredLeads)}</strong><span>Unanswered wedding leads</span></Link>
          {/* A session with no attendance by noon on the day (brief 05, part 3). */}
          <Link className={`admin-tile${o.attendance && o.attendance.length > 0 ? " is-alert" : ""}`} href="/futprep/staff/coach">
            <strong>{o.attendance === null ? "—" : String(o.attendance.length)}</strong>
            <span>Sessions with attendance not marked</span>
            {o.attendance && o.attendance.length > 0 && <small>{o.attendance.slice(0, 3).map((s) => `${s.organizationName} · ${s.programName} · ${shortDate(s.date)}`).join("; ")}</small>}
          </Link>
          <Link className={`admin-tile${o.health.emailProblems ? " is-alert" : ""}`} href="/admin/messages?status=problems"><strong>{show(o.health.emailProblems)}</strong><span>Emails that did not arrive</span><small>Failed, bounced or marked as spam, last 7 days</small></Link>
          <Link className={`admin-tile${o.health.siteErrors ? " is-alert" : ""}`} href="/admin/health"><strong>{show(o.health.siteErrors)}</strong><span>Site errors (24h)</span></Link>
        </div>
      </section>

      <section className="admin-group" aria-labelledby="week">
        <h2 id="week">This week</h2>
        <div className="admin-tiles">
          <Link className="admin-tile" href="/admin/people"><strong>{show(o.thisWeek.signUps)}</strong><span>New sign-ups</span></Link>
          <Link className="admin-tile" href="/admin/businesses"><strong>{show(o.thisWeek.businesses)}</strong><span>New businesses</span></Link>
          <Link className="admin-tile" href="/futprep/staff/admin"><strong>{show(o.thisWeek.registrations)}</strong><span>Registrations</span></Link>
          <Link className="admin-tile" href="/futprep/staff/admin"><strong>{show(o.thisWeek.paymentsCount)}</strong><span>Payments recorded</span><small>{o.thisWeek.paymentsCents === null ? "—" : `${formatPriceCents(o.thisWeek.paymentsCents, { currency: false })} received`}</small></Link>
          <Link className="admin-tile" href="/weddings/admin"><strong>{show(o.thisWeek.leads)}</strong><span>Wedding leads</span></Link>
        </div>
      </section>

      <section className="admin-group" aria-labelledby="platform">
        <h2 id="platform">Platform</h2>
        <div className="admin-tiles">
          <Link className="admin-tile" href="/admin/businesses"><strong>{show(o.platform.liveListings)}</strong><span>Live businesses</span><small>{show(o.platform.totalListings)} approved or live in total</small></Link>
          <Link className="admin-tile" href="/admin/people"><strong>{show(o.platform.accounts)}</strong><span>Accounts</span></Link>
          {o.platform.sections.map((s) => (
            <Link key={s.slug} className={`admin-tile${s.live === 0 ? " is-muted" : ""}`} href={`/admin/businesses?section=${encodeURIComponent(s.slug)}`}>
              <strong>{s.live}</strong>
              <span>{s.name}</span>
              <small>{s.live === 0 ? "Coming soon on the site" : "live"}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="admin-group" aria-labelledby="health">
        <h2 id="health">Health</h2>
        <div className="admin-tiles">
          <Link className="admin-tile" href="/admin/health"><strong>{deployment.commit ?? "—"}</strong><span>Version running</span><small>{deployment.environment ?? "This copy doesn't say which environment it is"}</small></Link>
          <Link className={`admin-tile${o.health.siteErrors ? " is-alert" : ""}`} href="/admin/health"><strong>{show(o.health.siteErrors)}</strong><span>Server errors (24h)</span></Link>
          <Link className={`admin-tile${backup.state === "late" || backup.state === "failed" ? " is-alert" : backup.state === "ok" ? "" : " is-muted"}`} href="/admin/health">
            <strong>{backup.state === "ok" ? "✓" : backup.state === "late" ? "Late" : backup.state === "failed" ? "Failed" : "—"}</strong>
            <span>Last database backup</span>
            <small>{backupDay ?? (backup.state === "never" ? "No backup has reported in yet" : "Could not be read")}</small>
          </Link>
          <Link className={`admin-tile${checkProblems ? " is-alert" : ""}`} href="/admin/health"><strong>{show(checkProblems)}</strong><span>Database safety warnings</span><small>Row level security, search paths, privileged functions</small></Link>
        </div>
      </section>
    </AdminShell>
  );
}
