import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { getPublicDrop } from "@/db/shop";
import { canReserve, countdownTarget, dropPhase, formatNassau, formatReadyOn, licenceLabel, publicOpensAt, SHOP_PAYMENT_METHODS } from "@/lib/shop/rules";
import { MadeBadge } from "@/app/_components/market/MadeBadge";
import { Countdown } from "../../../Countdown";
import { DropReserve, type DropProductView } from "./DropReserve";
import "../../../shop.css";

// A drop page (brief 15, §2): hero, countdown, product cards with size
// pickers, the order summary and the buyer's details. Always fresh: stock
// and the open/closed state change by the minute. No card payment anywhere.
export const dynamic = "force-dynamic";

type Params = Promise<{ org: string; drop: string }>;
type Search = Promise<{ k?: string }>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function load(org: string, drop: string) {
  if (!SLUG.test(org) || !SLUG.test(drop)) return null;
  return getPublicDrop(org, drop).catch((error) => {
    console.error(`drop page: ${org}/${drop}`, error);
    return null;
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org, drop } = await params;
  const found = await load(org, drop);
  if (!found) return {};
  const title = `${found.drop.title} · ${found.org.name} | PortPass Bahamas`;
  const description = found.drop.description || `Reserve your size from ${found.org.name}'s drop and pay ${found.org.name} directly.`;
  const image = found.drop.heroImageUrl ?? found.products[0]?.photos[0] ?? found.org.heroImageUrl;
  return { title, description, openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: `https://portpassbahamas.com/shop/${org}/drop/${drop}`, images: image ? [image] : undefined } };
}

export default async function DropPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { org: orgSlug, drop: dropSlug } = await params;
  const { k } = await searchParams;
  const found = await load(orgSlug, dropSlug);
  if (!found) notFound();
  const { org, shop, drop, products } = found;

  const now = new Date();
  const phase = dropPhase(drop, now);
  const hasKey = typeof k === "string" && k.length > 0 && k === drop.followersToken;
  const reservable = canReserve(phase, hasKey);
  const target = countdownTarget(drop, phase, hasKey);
  const { brand, brandText } = computeBrandTokens(org.brandColor);
  const hero = drop.heroImageUrl ?? products[0]?.photos[0] ?? org.heroImageUrl;
  const methods = SHOP_PAYMENT_METHODS.filter((m) => org.paymentMethods.includes(m) && (m !== "bank_transfer" || Boolean(org.bankTransferDetails?.accountNumber)));

  const view: DropProductView[] = products.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    priceCents: p.priceCents,
    photos: p.photos,
    edition: p.usesMarks ? licenceLabel(p.licenceKind) : null,
    variants: p.variants.map((v) => ({ id: v.id, label: v.label, available: v.stock === null || v.stock > 0, left: v.stock !== null && v.stock > 0 && v.stock <= 3 ? v.stock : null })),
  }));

  const phaseLabel =
    phase === "open" ? "Open now" : phase === "followers" ? (hasKey ? "Followers first: you're in" : "Followers first") : phase === "upcoming" ? "Coming up" : "Closed";

  return (
    <main className={`tpl-page shop-page ${ppDisplay.variable} ${ppSans.variable}`} style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
      <SiteHeader breadcrumb={[{ label: org.name, href: `/shop/${orgSlug}` }, { label: drop.title, href: `/shop/${orgSlug}/drop/${dropSlug}` }]} />

      <section className={`shop-drop-hero${hero ? "" : " is-plain"}`}>
        {hero && <img className="shop-drop-hero-photo" src={hero} alt="" />}
        <div className="shop-drop-hero-inner">
          <span className={`shop-phase shop-phase-${phase}`}>{phaseLabel}</span>
          <p className="shop-eyebrow"><Link href={`/shop/${orgSlug}`}>{org.name}</Link> · Drop</p>
          <h1>{drop.title}</h1>
          <MadeBadge variant="hero" as="p" />
          {drop.description && <p className="shop-lede">{drop.description}</p>}
          {target && (
            <Countdown
              target={target}
              label={phase === "followers" ? "Opens to everyone in" : drop.followersFirstUntil && !hasKey ? "Followers get first access in" : "Opens in"}
              fallback={formatNassau(target)}
            />
          )}
          {phase === "open" && drop.closesAt && <p className="shop-hero-note">Closes {formatNassau(drop.closesAt)}</p>}
          {phase === "upcoming" && drop.followersFirstUntil && <p className="shop-hero-note">Opens to everyone {formatNassau(publicOpensAt(drop))}</p>}
          {phase === "closed" && <p className="shop-hero-note">This drop has closed. <Link href={`/shop/${orgSlug}`}>See the shop →</Link></p>}
        </div>
      </section>

      <dl className="shop-facts" aria-label="Before you reserve">
        <div>
          <dt>Ready</dt>
          <dd>{drop.readyOn ? `From ${formatReadyOn(drop.readyOn)}` : "Date to be confirmed"}</dd>
        </div>
        {drop.allowPickup && (
          <div>
            <dt>Pickup</dt>
            <dd>{drop.pickupNote || "Details on your receipt"}</dd>
          </div>
        )}
        {drop.allowDelivery && (
          <div>
            <dt>Delivery</dt>
            <dd>{drop.deliveryNote || `By ${org.name}`}{drop.deliveryZones.length ? ` · ${drop.deliveryZones.join(", ")}` : ""}</dd>
          </div>
        )}
        <div>
          <dt>Payment</dt>
          <dd>Pay {org.name} directly. Your reservation is held for {shop.holdHours} hours until paid.</dd>
        </div>
      </dl>

      <DropReserve
        orgSlug={orgSlug}
        orgName={org.name}
        dropSlug={dropSlug}
        followersKey={hasKey ? k! : null}
        reservable={reservable}
        waitlistOpen={phase !== "closed"}
        products={view}
        allowPickup={drop.allowPickup}
        allowDelivery={drop.allowDelivery}
        pickupNote={drop.pickupNote}
        deliveryNote={drop.deliveryNote}
        deliveryZones={drop.deliveryZones}
        readyOn={drop.readyOn ? formatReadyOn(drop.readyOn) : null}
        paymentMethods={methods}
        holdHours={shop.holdHours}
      />

      <section className="shop-section shop-returns" aria-labelledby="drop-returns">
        <h2 id="drop-returns">Returns policy</h2>
        <p className="shop-policy">{shop.returnsPolicy}</p>
      </section>

      <SiteFooter orgLine={`${org.name} · Reservations through PortPass. You pay ${org.name} directly.`} />
    </main>
  );
}
