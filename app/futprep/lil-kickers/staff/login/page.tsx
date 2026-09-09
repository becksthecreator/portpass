import Link from "next/link";
import { hasAnyStaffAccount } from "../../staff-auth";
import { StaffLoginForm } from "./StaffLoginForm";
import { BootstrapAdminForm } from "./BootstrapAdminForm";

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const safeReturnTo =
    returnTo?.startsWith("/futprep/lil-kickers/staff/") && !returnTo.startsWith("//")
      ? returnTo
      : "/futprep/lil-kickers/staff/admin";

  const hasAccount = await hasAnyStaffAccount();

  return (
    <main className="staff-login-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="registration-header-right">
          <Link className="header-link" href="/futprep">Futprep home</Link>
          <Link className="header-link" href="/futprep/lil-kickers">Parent view</Link>
        </div>
      </header>
      <section className="staff-login-shell">
        {hasAccount ? (
          <>
            <div className="eyebrow"><span className="eyebrow-dot" />Futprep staff</div>
            <h1>Your staff area.</h1>
            <p>Enter your account name and PIN, and PortPass will open the workspace assigned to your role.</p>
            <StaffLoginForm returnTo={safeReturnTo} />
          </>
        ) : (
          <>
            <div className="eyebrow"><span className="eyebrow-dot" />Futprep staff · first-time setup</div>
            <h1>Create the admin account.</h1>
            <p>No staff account exists yet. Set up the first admin account below — once signed in, you can create accounts for coaches and everyone else.</p>
            <BootstrapAdminForm />
          </>
        )}
      </section>
    </main>
  );
}
