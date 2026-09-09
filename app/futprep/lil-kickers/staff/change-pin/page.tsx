import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import { ChangePinForm } from "./ChangePinForm";
import { StaffLogoutButton } from "../StaffLogoutButton";

export default async function FutprepChangePinPage() {
  await requireFutprepStaff(["admin", "coach", "ceo", "helper"], "/futprep/lil-kickers/staff/change-pin");

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <span className="staff-workspace-label">Futprep · Change PIN</span>
        </div>
        <nav>
          <Link href="/futprep/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content change-pin-page">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Account security</span><h1>Change your PIN.</h1></div>
          <p>Replace the shared demo PIN with one only you know. You'll need your current PIN to confirm it's really you.</p>
        </div>
        <ChangePinForm />
      </section>
    </main>
  );
}
