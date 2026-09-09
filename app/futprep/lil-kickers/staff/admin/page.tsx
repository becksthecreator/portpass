import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import { listFutprepStaffRegistrations } from "@/db/staff";
import { AdminRegistrationManager } from "./AdminRegistrationManager";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

export default async function FutprepStaffAdminPage() {
  const role = await requireFutprepStaff(["admin","ceo"], "/futprep/lil-kickers/staff/admin");
  const registrations = await listFutprepStaffRegistrations();

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <span className="staff-workspace-label">Futprep · Registration desk</span>
        </div>
        <nav>
          {role==="ceo" && <Link href="/futprep/lil-kickers/staff/ceo">CEO overview</Link>}
          <Link href="/futprep/lil-kickers/staff/private-sessions">Private sessions</Link>
          <Link href="/futprep/lil-kickers/staff/programs">Programs</Link>
          <Link href="/futprep/lil-kickers/staff/accounts">Staff accounts</Link>
          <Link href="/futprep/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Registrations & payments</span><h1>Registration desk.</h1></div>
          <p>Send parents the registration link, confirm children, and keep payment status current. Coaches see those updates automatically in their own areas.</p>
        </div>
        <AdminRegistrationManager initialRegistrations={registrations} />
      </section>
    </main>
  );
}
