import Link from "next/link";
import { StaffLoginForm } from "./StaffLoginForm";

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

  return (
    <main className="staff-login-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <Link className="header-link" href="/futprep/lil-kickers">Parent view</Link>
      </header>
      <section className="staff-login-shell">
        <div className="eyebrow"><span className="eyebrow-dot" />Futprep staff</div>
        <h1>Your staff area.</h1>
        <p>Kiki, Coach Bex, and Coach Alex each have their own access and see only the tools their role needs.</p>
        <StaffLoginForm returnTo={safeReturnTo} />
      </section>
    </main>
  );
}
