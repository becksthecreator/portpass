import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { futprepOwnerStaffState } from "@/db/futprepOwner";
import { canSetMedicalSwitch } from "@/lib/futprepRoles";
import { requireFutprepStaff, currentFutprepStaffAccount, listStaffAccounts, listStaffWithoutLogin } from "../../staff-auth";
import { AccountsManager } from "./AccountsManager";
import { StaffLogoutButton } from "../StaffLogoutButton";
import "../coaches.css";

export const dynamic = "force-dynamic";

export default async function FutprepStaffAccountsPage() {
  const role = await requireFutprepStaff(["admin", "ceo"], "/futprep/staff/accounts");
  const [accounts, withoutLogin, currentAccountKey, owner] = await Promise.all([
    listStaffAccounts(),
    listStaffWithoutLogin(),
    currentFutprepStaffAccount(),
    futprepOwnerStaffState().catch((error) => {
      console.error("Futprep owner mark could not be read", error instanceof Error ? error.message : "");
      return null;
    }),
  ]);

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><BrandLogo /></Link>
          <span className="staff-workspace-label">Futprep · Staff accounts</span>
        </div>
        <nav>
          <Link href="/futprep/staff/team">Team profiles</Link>
          {role === "ceo" && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          <Link href="/sports-fitness/futprep-athletics/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Access control</span><h1>Staff accounts.</h1></div>
          <p>One login per person, with the role from Futprep&rsquo;s roles list: CEO (everything), admin (registrations, payments, team, schedules), coach (their own sessions, inbox, days and pay) and helper (the roster, read-only). Deactivating a login blocks sign-in at once and keeps its history.</p>
        </div>
        <AccountsManager initialAccounts={accounts} initialWithoutLogin={withoutLogin} currentAccountKey={currentAccountKey ?? ""} canManageCeo={role === "ceo"} canSetMedical={canSetMedicalSwitch(role)} initialOwnerStates={owner ? { [owner.staffId]: owner.state } : {}} />
      </section>
    </main>
  );
}
