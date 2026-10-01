import { listApplications } from "@/db/applications";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../_components/AdminShell";
import { AdminApplications } from "../AdminApplications";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Applications | PortPass admin",
  robots: { index: false, follow: false },
};

// The /apply inbox (brief 08, 1.3): message the business on WhatsApp,
// create a draft business from the request, or mark it not a fit. All
// through /api/applications/[id], behind the admin guard.
export default async function AdminApplicationsPage() {
  const session = await requireAdmin("/admin/applications");
  const applications = await listApplications();
  return (
    <AdminShell session={session} current="/admin/applications" title="Applications" lede="Everyone who filled in /apply, with section, WhatsApp, Instagram and where they came from.">
      <AdminApplications initialApplications={applications} />
    </AdminShell>
  );
}
