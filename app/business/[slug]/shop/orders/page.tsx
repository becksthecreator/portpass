import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { listSellerOrders } from "@/db/marketOrders";
import { getShop } from "@/db/shop";
import { requireOrgRole } from "@/lib/auth/guards";
import { handlesPayments } from "@/lib/paymentRequests/access";
import { OrdersBoard } from "./OrdersBoard";
import "@/app/shop/shop.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders | Shop | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// The seller's PortPass Market orders (brief 25, C4): one card per order,
// built for a phone at a pickup table, with Paid and the next step, a
// WhatsApp link to the buyer prefilled with the order code (the seller
// sends it; nothing is sent for them), filters, the two spreadsheets and
// the numbers. Staff of the business; Paid, Cancel and releasing unpaid
// orders are for whoever handles its payments. Nothing here moves.
export default async function ShopOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/shop/orders`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const shop = await getShop(business.id);
  if (!shop) notFound();
  const [orders, canHandlePayments, h] = await Promise.all([listSellerOrders(business.id), handlesPayments(access), headers()]);
  // This deployment's own address (production or a preview), for the
  // payment page link the seller can send.
  const host = h.get("host");
  const siteOrigin = host ? `${host.startsWith("localhost") ? "http" : "https"}://${host}` : "https://portpassbahamas.com";

  return (
    <main className="form-page auth-page theme-night seller-page">
      <SiteHeader breadcrumb={[{ label: "Shop", href: `/business/${slug}/shop` }, { label: "Orders", href: `/business/${slug}/shop/orders` }]} />
      <div className="seller-wrap">
        <div className="eyebrow"><span className="eyebrow-dot" />Shop · Orders</div>
        <h1 className="seller-title">Orders</h1>
        <p className="auth-lead">Orders from PortPass Market. Each buyer has their order code and a payment request from you; they pay you directly. Mark an order paid when the money reaches you.</p>
        {!canHandlePayments && <p className="seller-note">Marking paid and cancelling are for whoever handles this business&rsquo;s payments. You can move orders along.</p>}
        <OrdersBoard orgId={business.id} orgName={business.name} holdHours={shop.holdHours} canHandlePayments={canHandlePayments} siteOrigin={siteOrigin} initial={orders} />
        <p className="seller-note"><Link href={`/business/${slug}/shop`}>← Back to the shop</Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}
