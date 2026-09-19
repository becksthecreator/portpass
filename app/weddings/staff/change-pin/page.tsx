import Link from "next/link";
import { requireWeddingStaff } from "../../staff-auth";
import { ChangePinForm } from "./ChangePinForm";
import { StaffLogoutButton } from "../StaffLogoutButton";

export default async function WeddingChangePinPage() {
  await requireWeddingStaff(["wedding_desk", "antonio"], "/weddings/staff/change-pin");

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <span className="staff-workspace-label">Wedding Desk · Change PIN</span>
        </div>
        <nav>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content change-pin-page">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Account security</span><h1>Change your PIN.</h1></div>
          <p>You&rsquo;ll need your current PIN to confirm it&rsquo;s really you.</p>
        </div>
        <ChangePinForm />
      </section>
    </main>
  );
}
