import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { requireFutprepStaff, canManageFutprepTeam } from "../../staff-auth";
import { listAllCoachProfiles, listFutprepPrivateServices, listPrivateSessionRequests, privateSessionStats } from "@/db/coaches";
import { PrivateSessionManager } from "./PrivateSessionManager";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic="force-dynamic";

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export default async function PrivateSessionsPage({ searchParams }: { searchParams: Promise<{ coach?: string }> }){
  const role=await requireFutprepStaff(["admin","coach","ceo"],"/futprep/staff/private-sessions");
  const { coach } = await searchParams;
  const defaultCoachId = Number(coach) > 0 ? Number(coach) : null;
  const [{schemaReady,requests},{coaches},services,stats]=await Promise.all([
    listPrivateSessionRequests(),
    listAllCoachProfiles(),
    listFutprepPrivateServices().catch(()=>[]),
    privateSessionStats().catch(()=>({requested:0,accepted:0,paid:0,revenueCents:0})),
  ]);
  const unpublished=services.filter((s)=>!s.isPublished);
  return <main className="staff-workspace theme-night">
    <header className="staff-workspace-header"><div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · Private sessions</span></div><nav>{canManageFutprepTeam(role)&&<Link href="/futprep/staff/team">Team</Link>}<Link href="/futprep/coaches">Parent view ↗</Link><StaffLogoutButton /></nav></header>
    <section className="staff-workspace-content">
      <div className="staff-page-intro"><div><span className="section-kicker">Lessons · parties · payments</span><h1>Private sessions.</h1></div><p>Post open times, accept or decline requests (accepting books the time and emails the parent), refer to another coach, and record payments against the PS- code.</p></div>
      <div className="staff-summary staff-summary-4">
        <article><span>Requested</span><strong>{stats.requested}</strong></article>
        <article><span>Accepted</span><strong>{stats.accepted}</strong></article>
        <article><span>Paid</span><strong>{stats.paid}</strong></article>
        <article><span>Received</span><strong>{money(stats.revenueCents)}</strong></article>
      </div>
      {unpublished.length>0&&<div className="staff-migration-warning"><strong>Prices not live yet.</strong><span>{unpublished.map((s)=>s.name).join(", ")} {unpublished.length===1?"is":"are"} waiting for confirmed prices, so parents can&apos;t book {unpublished.length===1?"it":"them"} online yet.</span></div>}
      {!schemaReady&&<div className="staff-migration-warning"><strong>Database migration required.</strong><span>Run the new Futprep coaches/private-session migration, then this inbox becomes active.</span></div>}
      <PrivateSessionManager initialRequests={requests} coaches={coaches.filter((c)=>c.member_type==="coach"&&c.active)} services={services.map((s)=>({slug:s.slug,name:s.name}))} schemaReady={schemaReady} defaultCoachId={defaultCoachId} />
    </section>
  </main>;
}
