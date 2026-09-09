import Link from "next/link";
import { adminAccessConfigured } from "@/lib/admin-auth";
import { AdminLoginForm } from "./AdminLoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const safeReturnTo =
    returnTo && (returnTo.startsWith("/admin") || returnTo.startsWith("/organizations")) && !returnTo.startsWith("//")
      ? returnTo
      : "/admin";

  const configured = adminAccessConfigured();

  return (
    <main className="staff-login-page">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
      </header>
      <section className="staff-login-shell">
        <div className="eyebrow"><span className="eyebrow-dot" />PortPass admin</div>
        <h1>Sign in.</h1>
        {configured ? (
          <>
            <p>Enter the PortPass admin PIN to review applications and organization dashboards.</p>
            <AdminLoginForm returnTo={safeReturnTo} />
          </>
        ) : (
          <p>Admin access is not configured. Set <code>PORTPASS_ADMIN_PIN</code> in the environment, then reload this page.</p>
        )}
      </section>
    </main>
  );
}
