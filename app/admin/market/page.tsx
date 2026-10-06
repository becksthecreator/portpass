import Link from "next/link";
import { listSellers, type AdminSeller } from "@/db/marketSellers";
import { listMessages } from "@/db/adminHealth";
import { SELLER_ALERT_TEMPLATE } from "@/db/marketAlerts";
import { requireAdmin } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { marketCategoryName } from "@/lib/market/categories";
import { isSellerStatus, SELLER_STATUS_LABEL, zoneLine, type SellerStatus } from "@/lib/market/sellers";
import { AdminShell } from "../_components/AdminShell";
import { SellerActions } from "./SellerActions";
import "./market.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market | PortPass admin",
  robots: { index: false, follow: false },
};

const SHORT_STATUS: Record<SellerStatus, string> = { none: "Not selling", pending: "Waiting", verified: "Verified", suspended: "Suspended" };

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-BS", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Nassau" }) : "—";
}

// Admin -> Market -> Sellers (brief 25, A5): everyone who has asked to sell
// on PortPass Market, the two records verification needs (business licence
// number, contact person: admin-only, never public), and the decisions.
// Only a platform owner verifies or suspends. The demo business is never
// listed (db/marketSellers.ts).
export default async function AdminMarketPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireAdmin("/admin/market");
  const { status: rawStatus } = await searchParams;
  const status: SellerStatus | null = isSellerStatus(rawStatus) && rawStatus !== "none" ? rawStatus : null;
  const [sellers, lastAlert] = await Promise.all([
    listSellers(),
    listMessages({ template: SELLER_ALERT_TEMPLATE }).then((rows) => rows[0]?.createdAt ?? null).catch(() => null),
  ]);
  const canDecide = hasPlatformRole(session, "platform_owner");
  const count = (s: SellerStatus) => sellers.filter((seller) => seller.sellerStatus === s).length;
  const shown: AdminSeller[] = status ? sellers.filter((seller) => seller.sellerStatus === status) : sellers;
  const liveProducts = sellers.filter((s) => s.sellerStatus === "verified").reduce((sum, s) => sum + s.productsPublished, 0);

  return (
    <AdminShell
      session={session}
      current="/admin/market"
      title="Market"
      lede="PortPass Market sellers. A seller's shop and products are public only once a platform owner has checked the business licence number and the contact person. PortPass never holds the money: buyers pay each seller directly."
    >
      <nav className="admin-filters" aria-label="Market">
        <Link href="/admin/market" aria-current="page">Sellers</Link>
      </nav>

      <div className="admin-tiles">
        <div className="admin-tile"><span>Waiting to be verified</span><strong>{count("pending")}</strong><small>{lastAlert ? `Last alert emailed ${when(lastAlert)}` : "Founders are emailed at most once an hour"}</small></div>
        <div className="admin-tile"><span>Verified</span><strong>{count("verified")}</strong><small>Made in The Bahamas</small></div>
        <div className="admin-tile"><span>Suspended</span><strong>{count("suspended")}</strong><small>Off the Market</small></div>
        <div className="admin-tile"><span>Products on the Market</span><strong>{liveProducts}</strong><small>Published, from verified sellers</small></div>
      </div>

      <div className="admin-filters" aria-label="Status">
        <Link href="/admin/market" aria-current={!status ? "true" : undefined}>All ({sellers.length})</Link>
        {(["pending", "verified", "suspended"] as const).map((s) => (
          <Link key={s} href={`/admin/market?status=${s}`} aria-current={status === s ? "true" : undefined}>{SHORT_STATUS[s]} ({count(s)})</Link>
        ))}
      </div>
      {!canDecide && <p className="admin-prices-note">Only a platform owner can verify or suspend a seller.</p>}

      {shown.length === 0 ? (
        <p className="admin-empty">{status ? "No sellers with that status." : "No one has applied to sell yet. The door is portpassbahamas.com/sell."}</p>
      ) : (
        <table className="admin-table mkt-admin-table">
          <thead><tr><th>Seller</th><th>Status</th><th>Records</th><th>Getting the order</th><th>Products</th><th>Applied</th><th>Decide</th></tr></thead>
          <tbody>
            {shown.map((seller) => (
              <tr key={seller.orgId}>
                <td data-label="Seller">
                  <strong>{seller.name}</strong>
                  <br /><small>{[marketCategoryName(seller.marketCategory), seller.whatTheySell.slice(0, 120)].filter(Boolean).join(" · ") || "—"}</small>
                  {seller.slug && <><br /><small><Link href={`/business/${seller.slug}/shop`}>Seller view</Link>{seller.sellerStatus === "verified" && seller.shopOpen ? <> · <Link href={`/shop/${seller.slug}`}>Shop page</Link></> : null}</small></>}
                </td>
                <td data-label="Status">
                  <span className={`admin-pill mkt-status-${seller.sellerStatus}`}>{SHORT_STATUS[seller.sellerStatus]}</span>
                  <br /><small>{seller.sellerStatus === "verified" ? `Since ${when(seller.verifiedAt)}` : seller.sellerStatus === "suspended" ? seller.statusReason ?? "" : SELLER_STATUS_LABEL[seller.sellerStatus]}</small>
                  {!seller.shopOpen && <><br /><small>Shop not open yet</small></>}
                </td>
                <td data-label="Records">
                  <small>Licence: {seller.licenceNumber ?? <em>not on file</em>}</small>
                  <br /><small>Contact: {seller.contactPerson ?? <em>not on file</em>}</small>
                  {seller.whatsappE164 && <><br /><small>WhatsApp: {seller.whatsappE164}</small></>}
                </td>
                <td data-label="Getting the order">
                  <small>{seller.pickupNote ? `Pickup: ${seller.pickupNote.slice(0, 90)}` : "No pickup"}{seller.acceptsCashOnPickup ? " · cash OK" : ""}</small>
                  {seller.deliveryZones.length > 0 && <><br /><small>{seller.deliveryZones.map(zoneLine).join("; ")}</small></>}
                </td>
                <td data-label="Products">{seller.productsPublished} published / {seller.productsTotal}</td>
                <td data-label="Applied">{when(seller.appliedAt)}</td>
                <td data-label="Decide">
                  {canDecide ? <SellerActions orgId={seller.orgId} name={seller.name} status={seller.sellerStatus} canVerify={Boolean(seller.licenceNumber && seller.contactPerson)} /> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
