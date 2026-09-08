import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import { listFutprepPrograms } from "@/db/programs";
import { AddProgramManager } from "./AddProgramManager";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

export default async function FutprepProgramsPage() {
  const role = await requireFutprepStaff(["admin", "coach", "ceo"], "/futprep/lil-kickers/staff/programs");
  const programs = await listFutprepPrograms();

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <span className="staff-workspace-label">Futprep · Programs</span>
        </div>
        <nav>
          {role === "admin" && <Link href="/futprep/lil-kickers/staff/admin">Registration desk</Link>}
          {role === "coach" && <Link href="/futprep/lil-kickers/staff/coach">Coach workspace</Link>}
          {role === "ceo" && <Link href="/futprep/lil-kickers/staff/ceo">CEO overview</Link>}
          <Link href="/futprep/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Programs & locations</span><h1>Add a new program.</h1></div>
          <p>Create a new class — a new age group, a new day, or a whole new location like Futprep Out East — and it shows up for parents on the registration page immediately, with sessions scheduled automatically for the term.</p>
        </div>
        <AddProgramManager initialPrograms={programs} />
      </section>
    </main>
  );
}
