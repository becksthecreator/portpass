import { listAddons, listPlans } from "@/db/pricing";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../../_components/AdminShell";
import { PricesManager } from "./PricesManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Prices | PortPass admin",
  robots: { index: false, follow: false },
};

// The price list of record (pricing brief, 28 Sept): what /pricing,
// /business, /apply and, in part 2, invoices all read. Saving a row
// audit-logs it and revalidates the site; nothing here is deleted.
export default async function AdminPricesPage() {
  const session = await requireAdmin("/admin/settings/prices");
  const [plans, addons] = await Promise.all([listPlans({ fresh: true, includeInactive: true }), listAddons({ fresh: true })]);
  return (
    <AdminShell session={session} current="/admin/settings/prices" title="Prices" lede="Every price on the site reads from here. Changes are live on the next request and logged in the audit log.">
      <PricesManager plans={plans} addons={addons} />
    </AdminShell>
  );
}
