import Link from "next/link";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { requireAdmin } from "@/lib/auth/admin";
import { nassauToday } from "@/lib/futprepTerms";
import { AdminShell } from "../../../_components/AdminShell";
import { NewInvoiceForm } from "./NewInvoiceForm";
import "../../billing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New invoice | PortPass admin",
  robots: { index: false, follow: false },
};

// Admin -> Billing -> New invoice (brief 09, 2.4 and part 3).
export default async function AdminNewInvoicePage() {
  const session = await requireAdmin("/admin/billing/invoices/new");
  const businesses = await listAdminBusinesses();
  return (
    <AdminShell session={session} current="/admin/billing" title="New invoice" lede="An invoice you write yourself. Plan invoices and monthly fees are drafted for you by the daily job." actions={<Link className="admin-bar-link" href="/admin/billing">All billing</Link>}>
      <NewInvoiceForm businesses={businesses.map((business) => ({ id: business.id, name: business.name }))} today={nassauToday()} />
    </AdminShell>
  );
}
