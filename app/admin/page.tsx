import Link from "next/link";
import { getAdminOverview } from "@/db/adminStats";
import { requireAdmin } from "@/lib/auth/admin";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { AdminShell } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overview | PortPass admin",
  robots: { index: false, follow: false },
};

// The Control Center's first screen: what needs attention, this week,
// the platform's shape. Each tile is a link to where the work happens.
export default async function AdminOverviewPage() {
  const session = await requireAdmin("/admin");
  const o = await getAdminOverview();

  return (
    <AdminShell session={session} current="/admin" title="Overview" lede="What needs attention today, and how the week is going.">
      <section className="admin-group" aria-labelledby="needs">
        <h2 id="needs">Needs action</h2>
        <div className="admin-tiles">
          <Link className={`admin-tile${o.needsAction.businessesAwaiting ? " is-alert" : ""}`} href="/admin/businesses?status=submitted"><strong>{o.needsAction.businessesAwaiting}</strong><span>Businesses awaiting approval</span></Link>
          <Link className={`admin-tile${o.needsAction.newApplications ? " is-alert" : ""}`} href="/admin/applications"><strong>{o.needsAction.newApplications}</strong><span>New /apply submissions</span></Link>
          <Link className={`admin-tile${o.needsAction.unansweredLeads ? " is-alert" : ""}`} href="/weddings/admin"><strong>{o.needsAction.unansweredLeads}</strong><span>Unanswered wedding leads</span></Link>
          <div className="admin-tile is-muted"><strong>—</strong><span>Failed emails</span><small>Messages log arrives in build C</small></div>
          <div className="admin-tile is-muted"><strong>—</strong><span>Site errors (24h)</span><small>Health tiles arrive in build C</small></div>
        </div>
      </section>

      <section className="admin-group" aria-labelledby="week">
        <h2 id="week">This week</h2>
        <div className="admin-tiles">
          <Link className="admin-tile" href="/admin/people"><strong>{o.thisWeek.signUps}</strong><span>New sign-ups</span></Link>
          <Link className="admin-tile" href="/admin/businesses"><strong>{o.thisWeek.businesses}</strong><span>New businesses</span></Link>
          <Link className="admin-tile" href="/futprep/staff/admin"><strong>{o.thisWeek.registrations}</strong><span>Registrations</span></Link>
          <Link className="admin-tile" href="/futprep/staff/admin"><strong>{o.thisWeek.paymentsCount}</strong><span>Payments recorded</span><small>{formatPriceCents(o.thisWeek.paymentsCents, { currency: false })} received</small></Link>
          <Link className="admin-tile" href="/weddings/admin"><strong>{o.thisWeek.leads}</strong><span>Wedding leads</span></Link>
        </div>
      </section>

      <section className="admin-group" aria-labelledby="platform">
        <h2 id="platform">Platform</h2>
        <div className="admin-tiles">
          <Link className="admin-tile" href="/admin/businesses"><strong>{o.platform.liveListings}</strong><span>Live businesses</span><small>{o.platform.totalListings} approved or live in total</small></Link>
          <Link className="admin-tile" href="/admin/people"><strong>{o.platform.accounts}</strong><span>Accounts</span></Link>
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
          <div className="admin-tile is-muted"><strong>—</strong><span>Production status</span><small>Build C</small></div>
          <div className="admin-tile is-muted"><strong>—</strong><span>Runtime errors (24h)</span><small>Build C</small></div>
          <div className="admin-tile is-muted"><strong>—</strong><span>Last database backup</span><small>After the OptiPlex heartbeat is set up</small></div>
          <div className="admin-tile is-muted"><strong>—</strong><span>Supabase advisor warnings</span><small>Build C</small></div>
        </div>
      </section>
    </AdminShell>
  );
}
