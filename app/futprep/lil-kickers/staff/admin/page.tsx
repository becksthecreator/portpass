import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import { listFutprepStaffRegistrations } from "@/db/staff";
import { AdminRegistrationManager } from "./AdminRegistrationManager";

export const dynamic = "force-dynamic";

export default async function FutprepStaffAdminPage() {
  await requireFutprepStaff(["admin"], "/futprep/lil-kickers/staff/admin");
  const registrations = await listFutprepStaffRegistrations();

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <span className="staff-workspace-label">Futprep · Kiki admin</span>
        </div>
        <nav><Link href="/futprep/lil-kickers/staff/coach">Coach view</Link><Link href="/futprep/lil-kickers">Parent view ↗</Link></nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Registrations & payments</span><h1>Term 1 admin.</h1></div>
          <p>Confirm registrations, verify bank transfers, record payments, and review health or emergency information when needed.</p>
        </div>
        <AdminRegistrationManager initialRegistrations={registrations} />
      </section>
    </main>
  );
}
