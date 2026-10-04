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
    <nav className="preq-nav" aria-label="Payments">
      <Link href={base} aria-current={tab === "requests" ? "page" : undefined}>Requests</Link>
      <Link href={`${base}/chase`} aria-current={tab === "chase" ? "page" : undefined}>
        Chase{chaseCount ? <span className="preq-count" aria-label={`${chaseCount} overdue`}>{chaseCount}</span> : null}
      </Link>
      <Link href={`${base}/settings`} aria-current={tab === "settings" ? "page" : undefined}>Settings</Link>
    </nav>
  );
  const body = (
    <div className="preq-wrap">
      <header className="preq-head">
        <span className="preq-kicker">Payments · {access.orgName}</span>
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
        {/* In the demo a request starts from a registration, with nothing typed. */}
        {access.door === "demo" ? <Link className="preq-btn is-primary preq-new" href="/demo/registrations">Request payment from a registration</Link> : tab !== "new" && <Link className="preq-btn is-primary preq-new" href={`${base}/new`}>New request</Link>}
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

  if (access.door === "demo") {
    return (
      <main className="form-page auth-page theme-night">
        <SiteHeader breadcrumb={[{ label: "Demo business", href: "/demo/home" }, { label: "Payments", href: base }]} />
        {body}
        <SiteFooter />
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
