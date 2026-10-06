import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "@/lib/auth/session";
import { AdminSignOut } from "./AdminSignOut";
import { AdminTabsScroll } from "./AdminTabsScroll";

export const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/perks", label: "Perks" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/guides", label: "Guides" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/shop", label: "Shop" },
  { href: "/admin/market", label: "Market" },
  { href: "/admin/tools", label: "Our tools" },
  { href: "/admin/phase1", label: "Phase 1" },
] as const;

// The Admin Control Center's chrome (28 Sept brief): Night theme, a tool
// not a document -- summary first, big tap targets, one row of tabs that
// scrolls sideways on a phone. Every page inside calls requireAdmin()
// itself; this is layout only.
export function AdminShell({ session, current, title, lede, children, actions }: { session: Session; current: (typeof ADMIN_NAV)[number]["href"]; title: string; lede?: string; children: ReactNode; actions?: ReactNode }) {
  const name = session.profile?.fullName ?? session.email ?? "";
  return (
    <main className="admin-shell theme-night">
      <header className="admin-bar">
        <Link className="brand admin-brand" href="/admin"><BrandLogo /><span className="admin-brand-label">ADMIN</span></Link>
        <AdminTabsScroll />
        <nav className="admin-tabs" aria-label="Admin">
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined}>{item.label}</Link>
          ))}
        </nav>
        <div className="admin-bar-actions">
          <span className="admin-who" title={session.email ?? ""}>{name}</span>
          <Link className="admin-bar-link" href="/">Site</Link>
          <AdminSignOut />
        </div>
      </header>
      <section className="admin-content">
        <div className="admin-page-head">
          <div>
            <h1>{title}</h1>
            {lede && <p>{lede}</p>}
          </div>
          {actions && <div className="admin-page-actions">{actions}</div>}
        </div>
        {children}
      </section>
    </main>
  );
}
