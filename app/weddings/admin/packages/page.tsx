import { requireWeddingStaff } from "../../staff-auth";
import { listAllWeddingPackages } from "@/db/weddingPackages";
import { AdminNav } from "../AdminNav";
import { PackagesManager } from "./PackagesManager";

export const dynamic = "force-dynamic";

export default async function WeddingPackagesAdminPage() {
  const role = await requireWeddingStaff(["wedding_desk", "antonio"], "/weddings/admin/packages");
  const packages = await listAllWeddingPackages();

  return (
    <main className="staff-workspace">
      <AdminNav role={role} active="/weddings/admin/packages" />
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Packages</span><h1>Levels of service.</h1></div>
          <p>Name, description, what&rsquo;s included, and price for each tier. Changes appear on the public page immediately. Leave price blank rather than guess.</p>
        </div>
        <PackagesManager initialPackages={packages} />
      </section>
    </main>
  );
}
