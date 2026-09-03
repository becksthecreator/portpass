import Link from "next/link";
import { requireFutprepStaff, currentFutprepStaffAccount } from "../../staff-auth";
import { listAllCoachProfiles, listPrivateSessionRequests } from "@/db/coaches";
import { PrivateSessionManager } from "./PrivateSessionManager";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic="force-dynamic";

export default async function PrivateSessionsPage(){
  await requireFutprepStaff(["admin","coach","ceo"],"/futprep/lil-kickers/staff/private-sessions");
  const account=await currentFutprepStaffAccount();
  const [{schemaReady,requests},{coaches}]=await Promise.all([listPrivateSessionRequests(),listAllCoachProfiles()]);
  return <main className="staff-workspace">
    <header className="staff-workspace-header"><div><Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link><span className="staff-workspace-label">Futprep · Private sessions</span></div><nav>{(account==="ceo"||account==="adon")&&<Link href="/futprep/lil-kickers/staff/team">Team</Link>}<Link href="/futprep/lil-kickers/staff/notes">Notes</Link><Link href="/futprep/coaches">Parent view ↗</Link><StaffLogoutButton /></nav></header>
    <section className="staff-workspace-content">
      <div className="staff-page-intro"><div><span className="section-kicker">Lessons · birthdays · referrals</span><h1>Session requests.</h1></div><p>Accept, decline with a reason, or refer a request to another coach. Referred sessions stay flagged until the parent has been informed.</p></div>
      {!schemaReady&&<div className="staff-migration-warning"><strong>Database migration required.</strong><span>Run the new Futprep coaches/private-session migration, then this inbox becomes active.</span></div>}
      <PrivateSessionManager initialRequests={requests} coaches={coaches.filter((c)=>c.member_type==="coach"&&c.active)} schemaReady={schemaReady} />
    </section>
  </main>;
}
