import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../../_components/AdminShell";
import { TrackerImporter } from "./TrackerImporter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import leads | PortPass admin",
  robots: { index: false, follow: false },
};

// The one-off import of PortPass_Prospect_Tracker.xlsx (brief 14 §1.4):
// save the "Prospects" sheet as CSV, preview it here, then import.
export default async function AdminLeadsImportPage() {
  const session = await requireAdmin("/admin/leads/import");
  return (
    <AdminShell
      session={session}
      current="/admin/leads"
      title="Import the Prospect Tracker"
      lede="In Excel, open the Prospects sheet and save it as CSV. Preview it here first; nothing is saved until you press Import."
      actions={<Link className="admin-bar-link" href="/admin/leads">All leads</Link>}
    >
      <TrackerImporter />
    </AdminShell>
  );
}
