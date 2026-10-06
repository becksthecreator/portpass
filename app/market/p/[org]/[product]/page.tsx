import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { MadeBadge } from "@/app/_components/market/MadeBadge";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { getMarketProduct, type MarketProductPage } from "@/db/market";
import { marketCategoryName } from "@/lib/market/categories";
import { MARKET_TAGLINE } from "@/lib/market/copy";
import { zoneLine } from "@/lib/market/sellers";
import { productJsonLd } from "@/lib/seo/jsonLd";
import { dropPhase, licenceLabel, paymentMethodLabel, SHOP_PAYMENT_METHODS, whatsappHref } from "@/lib/shop/rules";
import "../../../market.css";

// A product on PortPass Market (brief 25, B2): photos, sizes and stock,
// price, the seller's badge, how to get it, and the button. Only a product
// the market_products view lists reaches this page (a verified seller, an
// open shop, never the demo). Rendered per request: stock changes.
// The order button holds still (money: brief 22's Never list).
export const dynamic = "force-dynamic";

type Params = Promise<{ org: string; product: string }>;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function load(org: string, product: string): Promise<MarketProductPage | null> {
  if (!SLUG.test(org) || !SLUG.test(product)) return null;
  return getMarketProduct(org, product).catch((error) => {
    console.error("market product page", error instanceof Error ? error.message : "");
    return null;
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org, product } = await params;
  const page = await load(org, product);
  if (!page) return {};
  const url = `https://portpassbahamas.com/market/p/${org}/${product}`;
  const title = `${page.product.title} by ${page.org.name} | PortPass Market`;
  const description = (page.product.description || `${page.product.title} from ${page.org.name}, made in The Bahamas.`).slice(0, 200);
  // The share image is the first photo (a real web address; never the
  // drawn placeholders a fixture uses).
  const photo = page.product.photos.find((p) => /^https?:\/\//.test(p));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url, images: photo ? [{ url: photo, alt: page.product.title }] : undefined },
    twitter: photo ? { card: "summary_large_image", title, description, images: [photo] } : undefined,
  };
}

export default async function MarketProductPage({ params }: { params: Params }) {
  const { org: orgSlug, product: productSlug } = await params;
  const page = await load(orgSlug, productSlug);
  if (!page) notFound();
  const { product, org, shop, drops } = page;
  const now = new Date();
  const { brand, brandText } = computeBrandTokens(org.brandColor);
  const inStock = product.variants.some((v) => v.stock === null || v.stock > 0);
  const openDrop = drops.find((d) => dropPhase(d, now) === "open" && d.productIds.includes(product.id)) ?? null;
  const edition = product.usesMarks ? licenceLabel(product.licenceKind) : null;
  const methods = SHOP_PAYMENT_METHODS.filter((m) => org.paymentMethods.includes(m));
  const payLine = methods.map((m) => paymentMethodLabel(m).toLowerCase()).join(" or ");
  const ask = inStock && org.whatsappE164 ? whatsappHref(org.whatsappE164, `Hi ${org.name}, I'd like to order ${product.title} from your PortPass shop.`) : null;
  const category = marketCategoryName(product.marketCategory);
  const path = `/market/p/${orgSlug}/${productSlug}`;

  return (
    <main className={`market-page mkt-product-page ${ppDisplay.variable} ${ppSans.variable}`} style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
      <JsonLd data={productJsonLd({ name: product.title, description: product.description, path, photos: product.photos, priceCents: product.priceCents, inStock, category, sellerName: org.name, sellerPath: `/shop/${orgSlug}` })} />
      <SiteHeader breadcrumb={[{ label: "PortPass Market", href: "/market" }, ...(product.marketCategory && category ? [{ label: category, href: `/market/${product.marketCategory}` }] : []), { label: product.title, href: path }]} />

      <article className="mkt-product">
        <div className="mkt-product-photos">
          <div className="mkt-product-main">
            {product.photos[0] ? <img src={product.photos[0]} alt={product.title} /> : <span aria-hidden="true">{product.title.slice(0, 1)}</span>}
            {edition && <span className="mkt-edition">{edition}</span>}
          </div>
          {product.photos.length > 1 && (
            <div className="mkt-product-thumbs">
              {product.photos.slice(1).map((url) => <img key={url} src={url} alt="" loading="lazy" decoding="async" />)}
            </div>
          )}
        </div>

        <div className="mkt-product-info">
          <MadeBadge variant="inline" as="p" />
          <h1>{product.title}</h1>
          <p className="mkt-product-seller">by <Link href={`/shop/${orgSlug}`}>{org.name}</Link></p>
          <p className="mkt-product-price">{formatPriceCents(product.priceCents)}</p>
          {product.description && <p className="mkt-product-desc">{product.description}</p>}

          <div className="mkt-sizes" aria-label="Sizes and stock">
            <h2>{product.variants.length === 1 ? "Stock" : "Sizes"}</h2>
            <ul>
              {product.variants.map((v) => (
                <li key={v.id} className={v.stock === 0 ? "is-out" : undefined}>
                  <strong>{v.label}</strong>
                  <small>{v.stock === null ? "In stock" : v.stock === 0 ? "Sold out" : `${v.stock} left`}</small>
                </li>
              ))}
            </ul>
          </div>

          <div className="mkt-product-action">
            {openDrop ? (
              <Link className="primary-button" data-still href={`/shop/${orgSlug}/drop/${openDrop.slug}#product-${product.id}`}>Reserve in {openDrop.title}</Link>
            ) : ask ? (
              <a className="primary-button" data-still href={ask} target="_blank" rel="noopener noreferrer">Order on WhatsApp</a>
            ) : (
              <p className="mkt-muted">{inStock ? `Message ${org.name} to order.` : "Sold out for now."}</p>
            )}
            <p className="mkt-pay-direct">You pay {org.name} directly{payLine ? `, by ${payLine}` : ""}. PortPass never takes the money.</p>
          </div>

          {(shop.sellerPickupNote || shop.sellerDeliveryZones.length > 0) && (
            <dl className="mkt-getting">
              {shop.sellerPickupNote && <div><dt>Pickup</dt><dd>{shop.sellerPickupNote}{shop.acceptsCashOnPickup ? " · Cash on pickup welcome." : ""}</dd></div>}
              {shop.sellerDeliveryZones.length > 0 && <div><dt>Delivery by {org.name}</dt><dd><ul>{shop.sellerDeliveryZones.map((z) => <li key={z.zone}>{zoneLine(z)}</li>)}</ul></dd></div>}
            </dl>
          )}
          {shop.returnsPolicy && (
            <details className="mkt-returns">
              <summary>Returns policy</summary>
              <p>{shop.returnsPolicy}</p>
            </details>
          )}
          <p className="mkt-more"><Link href={`/shop/${orgSlug}`}>More from {org.name} →</Link></p>
        </div>
      </article>
      <p className="mkt-tagline">{MARKET_TAGLINE}</p>
      <SiteFooter orgLine={`${org.name} · Orders through PortPass. You pay ${org.name} directly.`} />
    </main>
  );
}
