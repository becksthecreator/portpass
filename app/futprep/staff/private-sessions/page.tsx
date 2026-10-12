import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { requireFutprepStaff, canManageFutprepTeam } from "../../staff-auth";
import { listAllCoachProfiles, listFutprepPrivateServices, privateSessionStats } from "@/db/coaches";
import { seesEveryRequest } from "@/lib/privateSessionAccess";
import { PrivateSessionManager } from "./PrivateSessionManager";
import { currentInboxViewer, inboxRequests } from "./viewer";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic="force-dynamic";

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

// Brief 31 (C1): the CEO and admins see every request and Futprep's
// totals; a coach sees only their own requests (preferred or assigned).
export default async function PrivateSessionsPage({ searchParams }: { searchParams: Promise<{ coach?: string }> }){
  const role=await requireFutprepStaff(["admin","coach","ceo"],"/futprep/staff/private-sessions");
  const { coach } = await searchParams;
  const { viewer } = await currentInboxViewer();
  const seesAll=seesEveryRequest(role);
  const defaultCoachId = seesAll ? (Number(coach) > 0 ? Number(coach) : null) : viewer.coachId;
  const [{schemaReady,requests},{coaches},services,stats]=await Promise.all([
    inboxRequests(viewer),
    listAllCoachProfiles(),
    listFutprepPrivateServices().catch(()=>[]),
    seesAll ? privateSessionStats().catch(()=>({requested:0,accepted:0,paid:0,revenueCents:0})) : Promise.resolve(null),
  ]);
  const unpublished=services.filter((s)=>!s.isPublished);
  return <main className="staff-workspace theme-night">
    <header className="staff-workspace-header"><div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · Private sessions</span></div><nav>{viewer.coachId!==null&&<Link href="/futprep/staff/my-days">My days</Link>}{canManageFutprepTeam(role)&&<Link href="/futprep/staff/team">Team</Link>}<Link href="/futprep/coaches">Parent view ↗</Link><StaffLogoutButton /></nav></header>
    <section className="staff-workspace-content">
      <div className="staff-page-intro"><div><span className="section-kicker">{seesAll?"Lessons · parties · payments":"Your requests"}</span><h1>Private sessions.</h1></div><p>{seesAll?"Post open times, accept or decline requests (accepting books the time and emails the parent), refer to another coach, and record payments against the reference.":"Requests that name you, or that the desk has given you. Accept or decline, refer to another coach, mark a session completed, and post your open times. Set your working days and days away on My days."}</p></div>
      {stats&&<div className="staff-summary staff-summary-4">
        <article><span>Requested</span><strong>{stats.requested}</strong></article>
        <article><span>Accepted</span><strong>{stats.accepted}</strong></article>
        <article><span>Paid</span><strong>{stats.paid}</strong></article>
        <article><span>Received</span><strong>{money(stats.revenueCents)}</strong></article>
      </div>}
      {seesAll&&unpublished.length>0&&<div className="staff-migration-warning"><strong>Prices not live yet.</strong><span>{unpublished.map((s)=>s.name).join(", ")} {unpublished.length===1?"is":"are"} waiting for confirmed prices, so parents can&apos;t book {unpublished.length===1?"it":"them"} online yet.</span></div>}
      {!schemaReady&&<div className="staff-migration-warning"><strong>Database migration required.</strong><span>Run the new Futprep coaches/private-session migration, then this inbox becomes active.</span></div>}
      <PrivateSessionManager initialRequests={requests} coaches={coaches.filter((c)=>c.member_type==="coach"&&c.active)} services={services.map((s)=>({slug:s.slug,name:s.name}))} schemaReady={schemaReady} defaultCoachId={defaultCoachId} canRequestPayment={seesAll} seesAll={seesAll} myCoachId={viewer.coachId} />
    </section>
  </main>;
}
