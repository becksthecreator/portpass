import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
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
  // No login yet: the setup form is for a signed-in PortPass platform owner
  // only; anyone else is sent to sign in or gets a 404, never the form
  // (audit finding 9).
  if (!hasAccount) {
    const session = await requireAdmin("/weddings/staff/login");
    if (!hasPlatformRole(session, "platform_owner")) notFound();
  }

  return (
    <main className="theme-night staff-login-page">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <div className="registration-header-right">
          <Link className="header-link" href="/weddings/bahamas-weddings-by-the-sea">Wedding site</Link>
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
