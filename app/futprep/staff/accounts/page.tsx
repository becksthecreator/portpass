import Link from "next/link";
import { requireFutprepStaff, currentFutprepStaffAccount, listStaffAccounts } from "../../staff-auth";
import { AccountsManager } from "./AccountsManager";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

export default async function FutprepStaffAccountsPage() {
  const role = await requireFutprepStaff(["admin", "ceo"], "/futprep/staff/accounts");
  const [accounts, currentAccountKey] = await Promise.all([listStaffAccounts(), currentFutprepStaffAccount()]);

  return (
    <main className="staff-workspace">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <span className="staff-workspace-label">Futprep · Staff accounts</span>
        </div>
        <nav>
          <Link href="/futprep/staff/team">Team profiles</Link>
          {role === "ceo" && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          <Link href="/futprep/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Access control</span><h1>Staff accounts.</h1></div>
          <p>Create a login for each new coach or teammate and assign a role. Deactivating an account blocks sign-in immediately without deleting their history.</p>
        </div>
        <AccountsManager initialAccounts={accounts} currentAccountKey={currentAccountKey ?? ""} />
      </section>
    </main>
  );
}
