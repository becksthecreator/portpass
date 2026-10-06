import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { getSellerRecords } from "@/db/marketSellers";
import { getShop, listDrops, listProducts } from "@/db/shop";
import { requireOrgRole } from "@/lib/auth/guards";
import { canEditShop } from "@/lib/shop/access";
import { dropPhase, formatNassau, licenceLabel, money, paymentMethodLabel, SHOP_PAYMENT_METHODS } from "@/lib/shop/rules";
import { SellerSettings } from "./SellerSettings";
import { ShopSettingsForm } from "./ShopSettingsForm";
import "@/app/shop/shop.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

const PHASE_LABEL = { draft: "Draft", upcoming: "Coming up", followers: "Followers first", open: "Open", closed: "Closed" } as const;

// The seller's shop home (brief 15, §3): settings, products and drops.
// Staff see the drops (to work the reservation list); owners and admins
// also edit, and keep the PortPass Market settings (brief 25, part A).
export default async function BusinessShopPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ applied?: string }> }) {
  const { slug } = await params;
  const { applied } = await searchParams;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/shop`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const [shop, products, drops] = await Promise.all([getShop(business.id), listProducts(business.id), listDrops(business.id)]);
  const canEdit = canEditShop(access);
  // The records PortPass checks are shown to owners and admins only.
  const records = canEdit && shop ? await getSellerRecords(business.id) : null;
  const storefrontPublic = Boolean(shop?.isPublished && shop.sellerStatus === "verified" && (business.status === "approved" || business.status === "live"));
  const methods = SHOP_PAYMENT_METHODS.filter((m) => business.paymentMethods.includes(m));
  const now = new Date();
  const suggestedPrefix = business.name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 4).padEnd(2, "X");

  return (
    <main className="form-page auth-page theme-night seller-page">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Shop", href: `/business/${slug}/shop` }]} />
      <div className="seller-wrap">
        <div className="eyebrow"><span className="eyebrow-dot" />Shop</div>
        <h1 className="seller-title">{business.name}</h1>
        <p className="auth-lead">Your products, drops and orders. Buyers order or reserve here and pay you directly; you mark paid and collected.</p>
        {applied === "1" && (
          <p className="seller-applied" role="status">Thanks: you&rsquo;ve applied to sell on PortPass Market. PortPass checks your licence number and contact person, then messages you. Meanwhile, set your returns policy below and add your products.</p>
        )}

        {methods.length === 0 ? (
          <p className="form-error">Customers can&rsquo;t reserve until you choose how they pay you. {canEdit && <Link href={`/business/${slug}/settings?step=5`}>Set payment methods →</Link>}</p>
        ) : (
          <p className="seller-note">Buyers pay you by {methods.map((m) => paymentMethodLabel(m).toLowerCase()).join(" or ")}. {canEdit && <Link href={`/business/${slug}/settings?step=5`}>Change</Link>}</p>
        )}

        <section className="seller-block" aria-labelledby="seller-drops">
          <div className="seller-block-head">
            <h2 id="seller-drops">Drops</h2>
            {canEdit && shop && <Link className="admin-mini is-primary seller-head-action" href={`/business/${slug}/shop/drops/new`}>New drop</Link>}
          </div>
          {drops.length === 0 ? (
            <p className="seller-empty">{shop ? "No drops yet." : "Set up the shop below, then add products and a drop."}</p>
          ) : (
            <ul className="seller-list">
              {drops.map((drop) => (
                <li key={drop.id}>
                  <Link className="seller-row" href={`/business/${slug}/shop/drops/${drop.id}`}>
                    <strong>{drop.title}</strong>
                    <span>{PHASE_LABEL[dropPhase(drop, now)]} · opens {formatNassau(drop.opensAt)}</span>
                    <b>Reservations →</b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {shop && (
          <section className="seller-block" aria-labelledby="seller-products">
            <div className="seller-block-head">
              <h2 id="seller-products">Products</h2>
              {canEdit && <Link className="admin-mini is-primary seller-head-action" href={`/business/${slug}/shop/products/new`}>Add product</Link>}
            </div>
            {products.length === 0 ? (
              <p className="seller-empty">No products yet.</p>
            ) : (
              <ul className="seller-list">
                {products.map((product) => {
                  const waiting = product.usesMarks && !product.licenceApprovedAt;
                  const status = product.isPublished ? "Published" : waiting ? "Waiting for PortPass licence approval" : "Draft";
                  const stock = product.variants.map((v) => `${v.label} ${v.stock === null ? "∞" : v.stock}`).join(" · ");
                  const body = (
                    <>
                      <strong>{product.title}</strong>
                      <span>{money(product.priceCents)} · {status}{product.usesMarks && licenceLabel(product.licenceKind) ? ` · ${licenceLabel(product.licenceKind)}` : ""}</span>
                      <span>{stock || "No sizes yet"}</span>
                    </>
                  );
                  return (
                    <li key={product.id}>
                      {canEdit ? <Link className="seller-row" href={`/business/${slug}/shop/products/${product.id}`}>{body}<b>Edit →</b></Link> : <div className="seller-row">{body}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {canEdit && shop && records && (
          <section className="seller-block" aria-labelledby="seller-market">
            <h2 id="seller-market">PortPass Market</h2>
            <SellerSettings
              orgId={business.id}
              slug={slug}
              value={{
                status: shop.sellerStatus,
                statusReason: shop.sellerStatusReason,
                marketCategory: shop.marketCategory,
                whatTheySell: shop.whatTheySell,
                contactPerson: records.contactPerson,
                licenceNumber: records.licenceNumber,
                pickupNote: shop.sellerPickupNote,
                deliveryZones: shop.sellerDeliveryZones,
                acceptsCashOnPickup: shop.acceptsCashOnPickup,
              }}
            />
          </section>
        )}

        {canEdit && (
          <section className="seller-block" aria-labelledby="seller-settings">
            <h2 id="seller-settings">{shop ? "Shop settings" : "Set up your shop"}</h2>
            <ShopSettingsForm orgId={business.id} slug={slug} shop={shop} suggestedPrefix={suggestedPrefix} />
          </section>
        )}
        {storefrontPublic && (
          <p className="seller-note"><a href={`/shop/${slug}`}>Open your shop page →</a></p>
        )}
        {shop && !storefrontPublic && (
          <p className="seller-note">
            {shop.sellerStatus === "verified"
              ? shop.isPublished
                ? "Your shop page goes public once PortPass approves the business."
                : "Open the shop in the settings above and your shop page goes public."
              : "Your shop page goes public once PortPass verifies you as a seller (PortPass Market, above) and the shop is open."}
          </p>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
