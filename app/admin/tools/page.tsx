import { notFound } from "next/navigation";
import { listAdminLinks } from "@/db/adminLinks";
import { requireAdmin } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { AdminShell } from "../_components/AdminShell";
import { ToolsManager } from "./ToolsManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Our tools | PortPass admin",
  robots: { index: false, follow: false },
};

// The founders' working links (29 Sept brief, part 3). Platform owners
// only: an admin without the owner role gets the same 404 as anyone
// outside the admin area.
export default async function AdminToolsPage() {
  const session = await requireAdmin("/admin/tools");
  if (!hasPlatformRole(session, "platform_owner")) notFound();
  const links = await listAdminLinks();
  return (
    <AdminShell session={session} current="/admin/tools" title="Our tools" lede="The documents and boards the two of you work from. Owners only; every change is logged.">
      <ToolsManager links={links} />
    </AdminShell>
  );
}
