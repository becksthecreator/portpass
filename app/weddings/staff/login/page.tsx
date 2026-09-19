import Link from "next/link";
import { hasAnyWeddingStaffAccount } from "../../staff-auth";
import { StaffLoginForm } from "./StaffLoginForm";
import { BootstrapAdminForm } from "./BootstrapAdminForm";

export default async function WeddingStaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const safeReturnTo =
    returnTo?.startsWith("/weddings/admin") && !returnTo.startsWith("//")
      ? returnTo
      : "/weddings/admin";

  const hasAccount = await hasAnyWeddingStaffAccount();

  return (
    <main className="staff-login-page">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="registration-header-right">
          <Link className="header-link" href="/weddings/bahamas-by-the-sea">Wedding site</Link>
        </div>
      </header>
      <section className="staff-login-shell">
        {hasAccount ? (
          <>
            <div className="eyebrow"><span className="eyebrow-dot" />Wedding Desk staff</div>
            <h1>Your staff area.</h1>
            <p>Enter your account name and PIN to open the wedding admin.</p>
            <StaffLoginForm returnTo={safeReturnTo} />
          </>
        ) : (
          <>
            <div className="eyebrow"><span className="eyebrow-dot" />Wedding Desk · first-time setup</div>
            <h1>Create the first account.</h1>
            <p>No staff account exists yet. Set up the first account below — once signed in, you can create accounts for everyone else on the Wedding Desk.</p>
            <BootstrapAdminForm />
          </>
        )}
      </section>
    </main>
  );
}
