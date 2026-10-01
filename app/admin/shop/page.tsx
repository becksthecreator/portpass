import Link from "next/link";
import { listLicenceProducts, listShopOverview } from "@/db/shop";
import { requireAdmin } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { money, reservationStats } from "@/lib/shop/rules";
import { AdminShell } from "../_components/AdminShell";
import { LicenceQueue } from "./LicenceQueue";
import "@/app/shop/shop.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop | PortPass admin",
  robots: { index: false, follow: false },
};

// Admin -> Shop (brief 15): products waiting for a licence decision (§5
// marks and crests) and every shop's numbers, including what PortPass
// brought -- the only paid orders commission applies to (Handbook §5).
export default async function AdminShopPage() {
  const session = await requireAdmin("/admin/shop");
  const [licences, shops] = await Promise.all([listLicenceProducts(), listShopOverview()]);
  const canDecide = hasPlatformRole(session, "platform_owner");
  const waiting = licences.filter((l) => !l.approvedAt);

  return (
    <AdminShell session={session} current="/admin/shop" title="Shop" lede="Drops and pre-orders. PortPass never holds the money: buyers pay each shop directly.">
      <section className="admin-shop-block">
        <h2>Licences {waiting.length > 0 && <span className="admin-pill">{waiting.length} waiting</span>}</h2>
        <p className="admin-shop-note">A product that uses another organisation&rsquo;s crest, logo or official kit design stays unpublished until a platform owner approves its licence note.{canDecide ? "" : " Only a platform owner can decide."}</p>
        <LicenceQueue items={licences} canDecide={canDecide} />
      </section>

      <section className="admin-shop-block">
        <h2>Shops</h2>
        {shops.length === 0 ? (
          <p className="admin-empty">No shops yet.</p>
        ) : (
          <div className="admin-shop-grid">
            {shops.map((shop) => {
              const stats = reservationStats(shop.reservations);
              return (
                <article key={shop.orgId} className="admin-section-card admin-shop-card">
                  <header>
                    <strong>{shop.orgName}</strong>
                    <span className="admin-pill">{shop.isPublished ? "Open" : "Not open"}</span>
                  </header>
                  <dl>
                    <div><dt>Drops</dt><dd>{shop.drops}</dd></div>
                    <div><dt>Reserved</dt><dd>{stats.reserved}</dd></div>
                    <div><dt>Paid</dt><dd>{stats.paid} · {money(stats.revenuePaidCents)}</dd></div>
                    <div><dt>Collected</dt><dd>{stats.collected}</dd></div>
                    <div><dt>Brought by PortPass, paid</dt><dd>{stats.commissionableOrders} · {money(stats.commissionableCents)}</dd></div>
                  </dl>
                  {shop.orgSlug && (
                    <p className="admin-shop-links">
                      <Link href={`/business/${shop.orgSlug}/shop`}>Seller view</Link>
                      {shop.isPublished && <Link href={`/shop/${shop.orgSlug}`}>Shop page</Link>}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
