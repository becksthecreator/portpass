import Link from "next/link";
import { listSponsors } from "@/db/sponsors";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../../_components/AdminShell";
import { SponsorsManager } from "./SponsorsManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sponsors | PortPass admin",
  robots: { index: false, follow: false },
};

// Admin -> Leads -> Sponsors (brief 08, 1.8).
export default async function AdminSponsorsPage() {
  const session = await requireAdmin("/admin/leads/sponsors");
  const sponsors = await listSponsors();
  return (
    <AdminShell session={session} current="/admin/leads" title="Sponsors" lede="Businesses that give PortPass something, what it is worth, and what we give back." actions={<Link className="admin-bar-link" href="/admin/leads">Back to leads</Link>}>
      <SponsorsManager sponsors={sponsors} />
    </AdminShell>
  );
}
