import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { StaffLogoutButton } from "@/app/futprep/staff/StaffLogoutButton";
import type { PaymentsAccess } from "@/lib/paymentRequests/access";
import "./payments.css";

export type PaymentsTab = "requests" | "chase" | "settings" | "new" | "detail";

// The frame around every Payments screen: the business area's header for
// owners and staff signed in to PortPass, the staff desk's for Futprep's
// PIN logins. Same screens inside either.
export function PaymentsShell({ access, tab, title, lede, chaseCount, children }: { access: PaymentsAccess; tab: PaymentsTab; title: string; lede?: string; chaseCount?: number; children: ReactNode }) {
  const base = access.basePath;
  const nav = (
    <nav className="pay-nav" aria-label="Payments">
      <Link href={base} aria-current={tab === "requests" ? "page" : undefined}>Requests</Link>
      <Link href={`${base}/chase`} aria-current={tab === "chase" ? "page" : undefined}>
        Chase{chaseCount ? <span className="pay-count" aria-label={`${chaseCount} overdue`}>{chaseCount}</span> : null}
      </Link>
      <Link href={`${base}/settings`} aria-current={tab === "settings" ? "page" : undefined}>Settings</Link>
      <Link className="pay-nav-new" href={`${base}/new`} aria-current={tab === "new" ? "page" : undefined}>New request</Link>
    </nav>
  );
  const body = (
    <div className="pay-wrap">
      <header className="pay-head">
        <span className="pay-kicker">Payments · {access.orgName}</span>
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
      </header>
      {nav}
      {children}
    </div>
  );

  if (access.door === "futprep_staff") {
    return (
      <main className="staff-workspace theme-night">
        <header className="staff-workspace-header">
          <div>
            <Link className="brand" href="/"><BrandLogo /></Link>
            <span className="staff-workspace-label">Futprep · Payments</span>
          </div>
          <nav>
            <Link href="/futprep/staff/admin">Registration desk</Link>
            <Link href="/futprep/staff/private-sessions">Private sessions</Link>
            <StaffLogoutButton />
          </nav>
        </header>
        <section className="staff-workspace-content">{body}</section>
      </main>
    );
  }

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${access.orgSlug}` }, { label: "Payments", href: base }]} />
      {body}
      <SiteFooter />
    </main>
  );
}
