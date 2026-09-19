import { requireWeddingStaff, currentWeddingStaffAccount, listWeddingStaffAccounts } from "../../staff-auth";
import { AdminNav } from "../AdminNav";
import { AccountsManager } from "./AccountsManager";

export const dynamic = "force-dynamic";

export default async function WeddingStaffAccountsPage() {
  const role = await requireWeddingStaff(["antonio"], "/weddings/admin/accounts");
  const [accounts, currentAccountKey] = await Promise.all([listWeddingStaffAccounts(), currentWeddingStaffAccount()]);

  return (
    <main className="staff-workspace">
      <AdminNav role={role} active="/weddings/admin/accounts" />
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Access control</span><h1>Staff accounts.</h1></div>
          <p>Create a login for the Wedding Desk. Deactivating an account blocks sign-in immediately without deleting their history.</p>
        </div>
        <AccountsManager initialAccounts={accounts} currentAccountKey={currentAccountKey ?? ""} />
      </section>
    </main>
  );
}
