import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import { listAllCoachProfiles } from "@/db/coaches";
import { CoachTeamManager } from "./CoachTeamManager";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic="force-dynamic";

export default async function FutprepTeamPage(){
  const role=await requireFutprepStaff(["admin","ceo"],"/futprep/lil-kickers/staff/team");
  const {schemaReady,coaches}=await listAllCoachProfiles();
  return <main className="staff-workspace">
    <header className="staff-workspace-header">
      <div><Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link><span className="staff-workspace-label">Futprep · Team management</span></div>
      <nav><Link href="/futprep/lil-kickers/staff/private-sessions">Private sessions</Link><Link href="/futprep/lil-kickers/staff/accounts">Staff accounts</Link>{role==="ceo"&&<Link href="/futprep/lil-kickers/staff/ceo">CEO overview</Link>}<Link href="/futprep/coaches">Public team ↗</Link><StaffLogoutButton /></nav>
    </header>
    <section className="staff-workspace-content">
      <div className="staff-page-intro"><div><span className="section-kicker">{role==="ceo"?"CEO":"Admin"} · team control</span><h1>Futprep team.</h1></div><p>Add, hide, unhide, update, or retire team profiles. Public-facing bios, licenses, playing history, videos and testimonials live here so the same information can later power marketing assets.</p></div>
      {!schemaReady && <div className="staff-migration-warning"><strong>One database step remains.</strong><span>Run supabase/migrations/202609030001_futprep_coaches_private_sessions.sql before saving team changes or bookings.</span></div>}
      <CoachTeamManager initialCoaches={coaches} schemaReady={schemaReady} />
    </section>
  </main>;
}
