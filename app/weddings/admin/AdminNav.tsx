import Link from "next/link";
import type { WeddingStaffRole } from "../staff-auth";
import { StaffLogoutButton } from "../staff/StaffLogoutButton";

export function AdminNav({ role, active }: { role: WeddingStaffRole; active: string }) {
  const links: { href: string; label: string }[] = [
    { href: "/weddings/admin", label: "Enquiries" },
    { href: "/weddings/admin/packages", label: "Packages" },
    { href: "/weddings/admin/gallery", label: "Gallery" },
    { href: "/weddings/admin/content", label: "Site content" },
  ];
  if (role === "antonio") {
    links.push({ href: "/weddings/admin/availability", label: "Availability" });
    links.push({ href: "/weddings/admin/accounts", label: "Staff accounts" });
  }

  return (
    <header className="staff-workspace-header">
      <div>
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <span className="staff-workspace-label">Bahamas Weddings · Admin</span>
      </div>
      <nav>
        {links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={active === link.href ? "page" : undefined}>{link.label}</Link>
        ))}
        <StaffLogoutButton />
      </nav>
    </header>
  );
}
