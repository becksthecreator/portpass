import type { Offering } from "@/db/organizations";
import { getPublicWeddingGallery, getWeddingSiteSettings } from "@/db/weddingSite";
import { getPublicWeddingPackages } from "@/db/weddingPackages";
import { IdentityBlock } from "@/app/_components/blocks/IdentityBlock";
import { ProofBlock } from "@/app/_components/blocks/ProofBlock";
import { GalleryBlock } from "@/app/_components/blocks/GalleryBlock";
import { OfferingsBlock } from "@/app/_components/blocks/OfferingsBlock";
import { ActionBlock } from "@/app/_components/blocks/ActionBlock";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { ppDisplay, ppSans } from "@/app/fonts";

// The full bespoke site's own accent (its --bws-accent) -- reused here only
// as the one permitted --brand value, in the same four spots every
// template page allows, not as a wider re-skin of this PortPass-branded
// summary page.
const BWS_BRAND_COLOR = "#c08a5e";

// Same listing as the "Read reviews" link on the bespoke site
// (app/weddings/bahamas-by-the-sea/page.tsx) -- duplicated locally rather
// than exported/shared since these two pages don't otherwise share code.
const WEDDINGWIRE_URL = "https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html";

// The gallery table also feeds the bespoke site's full 18-photo catalogue
// cycle -- these two are excluded only from this page's 4-photo featured
// strip (one of them, catalogue-05, is also a package-tier photo below;
// keeping it out of the gallery here avoids showing it twice on the page).
const GALLERY_EXCLUDE = new Set(["catalogue-01.webp", "catalogue-05.webp"]);

// force-dynamic (not ISR/revalidate) because this repo's CI build has no
// Supabase credentials, so a statically-prerendered page would fail the
// build fetching live wedding data.
export const dynamic = "force-dynamic";

const TITLE = "Bahamas Weddings By The Sea | PortPass Bahamas";
const DESCRIPTION = "Antonio Beckford's island wedding ceremonies, summarized: prices, photos, and how to start planning.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/weddings/bahamas-weddings-by-the-sea" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// A genuine summary, not the bespoke site's copy pasted in -- this is the
// PortPass-branded listing a couple finds while browsing categories; the
// full bahamasweddingsbythesea.com experience (arrival plate, full gallery
// cycle, FAQ, planner) stays at its own address, linked from here.
export default async function BahamasWeddingsListingPage() {
  const [settings, gallery, packages] = await Promise.all([
    getWeddingSiteSettings(),
    getPublicWeddingGallery(),
    getPublicWeddingPackages(),
  ]);

  const offerings: Offering[] = packages.map((pkg) => ({
    id: pkg.id,
    organizationId: 0,
    type: "service",
    slug: pkg.slug,
    name: pkg.name,
    summary: pkg.tagline,
    priceCents: pkg.priceFromCents,
    priceUnit: pkg.priceNote === "from" ? "from" : null,
    inclusions: pkg.includes,
    scheduleText: null,
    ageMin: null,
    ageMax: null,
    termStart: null,
    termEnd: null,
    eventDate: null,
    doorsTime: null,
    ticketUrl: null,
    capacity: null,
    hourlyRateCents: null,
    dayRateCents: null,
    amenities: [],
    leadTimeText: null,
    imageUrl: pkg.imageUrl,
    actionUrl: `/weddings/bahamas-by-the-sea/plan?tier=${encodeURIComponent(pkg.slug)}`,
    isFeatured: pkg.isFeatured,
  }));

  const images = gallery
    .filter((image) => !GALLERY_EXCLUDE.has(image.imageUrl.split("/").pop() ?? ""))
    .slice(0, 4)
    .map((image) => ({ url: image.imageUrl, alt: image.caption }));
  const { brand, brandText } = computeBrandTokens(BWS_BRAND_COLOR);

  return (
    <div className={`${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Weddings", href: "/weddings" }, { label: "Bahamas Weddings By The Sea", href: "/weddings/bahamas-weddings-by-the-sea" }]} />
      <main className="tpl-page" style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
        <IdentityBlock
          name="Bahamas Weddings By The Sea"
          category="Weddings"
          location="Nassau, New Providence"
          isOpen
          heroImageUrl="/weddings/bahamas-by-the-sea/ceremony.jpg"
          layout="split"
        />
        <ProofBlock
          yearsInBusiness={settings.yearsExperience}
          rating={5.0}
          reviewCount={settings.reviewCount}
          reviewsUrl={WEDDINGWIRE_URL}
          reviewsPlatform="WeddingWire"
          awards={settings.awardYears.map(() => "Couples' Choice Award")}
        />
        <GalleryBlock images={images} />
        <OfferingsBlock offerings={offerings} />
        <ActionBlock label="Visit the full wedding site" href="/weddings/bahamas-by-the-sea" />
      </main>
      <SiteFooter orgLine="Bahamas Weddings By The Sea · Booking and payments powered by PortPass" />
    </div>
  );
}
