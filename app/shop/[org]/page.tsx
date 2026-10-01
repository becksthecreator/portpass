import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryPage } from "@/app/_components/CategoryPage";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { listSections } from "@/db/categories";
import { getPublicShop, type Drop, type PublicShop } from "@/db/shop";
import { dropPhase, formatNassau, licenceLabel, money, paymentMethodLabel, publicOpensAt, SHOP_PAYMENT_METHODS, whatsappHref } from "@/lib/shop/rules";
import { Countdown } from "../Countdown";
import "../shop.css";

// /shop/<x> is a Shop Bahamian subsection first (Apparel & Merch), then a
// business's shop page (brief 15, §2). Dynamic: whether "Reserve" shows
// depends on the clock and on drops opening.
export const dynamic = "force-dynamic";

type Params = Promise<{ org: string }>;

async function shopSection() {
  try {
    return (await listSections({ includeHidden: true })).find((s) => s.slug === "shop") ?? null;
  } catch {
    return null;
  }
}

async function loadShop(slug: string): Promise<PublicShop | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return getPublicShop(slug).catch((error) => {
    console.error(`shop page: ${slug}`, error);
    return null;
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org } = await params;
  const section = await shopSection();
  const subsection = section?.subcategories.find((c) => c.slug === org);
  if (section && subsection) return { title: `${subsection.name} · ${section.name} | PortPass Bahamas` };
  const shop = await loadShop(org);
  if (!shop) return {};
  const title = `${shop.org.name} shop | PortPass Bahamas`;
  const description = shop.org.oneLiner ?? `Reserve ${shop.org.name} drops on PortPass and pay ${shop.org.name} directly.`;
  return { title, description, openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: `https://portpassbahamas.com/shop/${org}` } };
}

function dropStatusLine(drop: Drop, now: Date): string {
  const phase = dropPhase(drop, now);
  if (phase === "open") return drop.closesAt ? `Open now · closes ${formatNassau(drop.closesAt)}` : "Open now";
  if (phase === "followers") return `Followers first · opens to everyone ${formatNassau(publicOpensAt(drop))}`;
  if (phase === "upcoming") return `Opens ${formatNassau(drop.opensAt)}`;
  return "Closed";
}

export default async function ShopPage({ params }: { params: Params }) {
  const { org: slug } = await params;
  const section = await shopSection();
  const subsection = section?.subcategories.find((c) => c.slug === slug);
  if (section && subsection) return <CategoryPage section={section} subcategory={subsection} />;

  const shop = await loadShop(slug);
  if (!shop) notFound();
  const { org, products, drops } = shop;
  const now = new Date();
  const { brand, brandText } = computeBrandTokens(org.brandColor);
  const current = drops.filter((d) => dropPhase(d, now) !== "closed");
  const openDropFor = (productId: number) => current.find((d) => dropPhase(d, now) === "open" && d.productIds.includes(productId)) ?? null;
  const nextDropFor = (productId: number) => current.find((d) => d.productIds.includes(productId)) ?? null;
  const methods = SHOP_PAYMENT_METHODS.filter((m) => org.paymentMethods.includes(m));
  const payLine = methods.map((m) => paymentMethodLabel(m).toLowerCase()).join(" or ");

  return (
    <main className={`tpl-page shop-page ${ppDisplay.variable} ${ppSans.variable}`} style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
      <SiteHeader breadcrumb={[{ label: section?.name ?? "Shop Bahamian", href: "/shop" }, { label: org.name, href: `/shop/${slug}` }]} />

      <section className="shop-hero">
        {org.heroImageUrl && <img className="shop-hero-photo" src={org.heroImageUrl} alt="" />}
        <div className="shop-hero-inner">
          {org.logoUrl && <img className="shop-hero-logo" src={org.logoUrl} alt="" width={64} height={64} />}
          <p className="shop-eyebrow">Shop · {org.name}</p>
          <h1>{org.name}</h1>
          {org.oneLiner && <p className="shop-lede">{org.oneLiner}</p>}
          <p className="shop-pay-direct">Reserve here, then pay {org.name} directly{payLine ? ` by ${payLine}` : ""}.</p>
        </div>
      </section>

      {current.length > 0 && (
        <section className="shop-section" aria-labelledby="shop-drops">
          <h2 id="shop-drops">Drops</h2>
          <div className="shop-drop-list">
            {current.map((drop) => {
              const phase = dropPhase(drop, now);
              return (
                <Link key={drop.id} className="shop-drop-card" href={`/shop/${slug}/drop/${drop.slug}`}>
                  <span className={`shop-phase shop-phase-${phase}`}>{phase === "open" ? "Open now" : phase === "followers" ? "Followers first" : "Coming up"}</span>
                  <strong>{drop.title}</strong>
                  <span>{dropStatusLine(drop, now)}</span>
                  {phase === "upcoming" && <Countdown target={drop.opensAt} label="Opens in" fallback={formatNassau(drop.opensAt)} />}
                  <b>{phase === "open" ? "Reserve →" : "See the drop →"}</b>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="shop-section" aria-labelledby="shop-products">
        <h2 id="shop-products">Products</h2>
        {products.length === 0 ? (
          <p className="shop-muted">Nothing listed yet. Check back for the next drop.</p>
        ) : (
          <div className="shop-grid">
            {products.map((product) => {
              const open = openDropFor(product.id);
              const next = open ? null : nextDropFor(product.id);
              const edition = product.usesMarks ? licenceLabel(product.licenceKind) : null;
              return (
                <article key={product.id} className="shop-card">
                  <div className="shop-card-photo">
                    {product.photos[0] ? <img src={product.photos[0]} alt={product.title} loading="lazy" /> : <span aria-hidden="true">{product.title.slice(0, 1)}</span>}
                    {edition && <span className="shop-edition">{edition}</span>}
                  </div>
                  <div className="shop-card-body">
                    <h3>{product.title}</h3>
                    <p className="shop-price">{money(product.priceCents)} <small>BSD (= USD)</small></p>
                    <p className="shop-card-desc">{product.description}</p>
                    <p className="shop-sizes">{product.variants.map((v) => v.label).join(" · ")}</p>
                    {open ? (
                      <Link className="primary-button shop-card-action" href={`/shop/${slug}/drop/${open.slug}#product-${product.id}`}>Reserve</Link>
                    ) : (
                      <p className="shop-muted">{next ? `In ${next.title}: ${dropStatusLine(next, now).toLowerCase()}` : "Not on sale right now."}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="shop-section shop-how" aria-labelledby="shop-how">
        <h2 id="shop-how">How it works</h2>
        <ol>
          <li>Reserve your size while a drop is open. You get a reference code and an itemised receipt.</li>
          <li>Pay {org.name} directly{payLine ? ` by ${payLine}` : ""}. PortPass never takes the money.</li>
          <li>Collect, or have {org.name} deliver, on the date the drop gives.</li>
        </ol>
      </section>

      <section className="shop-section shop-returns" id="returns" aria-labelledby="shop-returns-title">
        <h2 id="shop-returns-title">Returns policy</h2>
        <p className="shop-policy">{shop.shop.returnsPolicy}</p>
        {org.whatsappE164 && (
          <p><a className="secondary-button" href={whatsappHref(org.whatsappE164, `Hi ${org.name}, a question about your shop on PortPass:`)} target="_blank" rel="noopener noreferrer">Message {org.name} on WhatsApp</a></p>
        )}
      </section>

      <SiteFooter orgLine={`${org.name} · Reservations through PortPass. You pay ${org.name} directly.`} />
    </main>
  );
}
