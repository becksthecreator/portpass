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
import { ppDisplay, ppSans } from "@/app/fonts";

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

  const images = gallery.slice(0, 6).map((image) => ({ url: image.imageUrl, alt: image.caption }));

  return (
    <div className={`tpl-page ${ppDisplay.variable} ${ppSans.variable}`} data-world="portpass">
      <SiteHeader breadcrumb={[{ label: "Weddings", href: "/weddings" }, { label: "Bahamas Weddings By The Sea", href: "/weddings/bahamas-weddings-by-the-sea" }]} />
      <IdentityBlock
        name="Bahamas Weddings By The Sea"
        category="Weddings"
        location="Nassau, New Providence"
        isOpen
        heroImageUrl="/weddings/bahamas-by-the-sea/hero.jpg"
      />
      <ProofBlock
        yearsInBusiness={settings.yearsExperience}
        rating={5.0}
        reviewCount={settings.reviewCount}
        awards={settings.awardYears.length ? [`${settings.awardYears.length} WeddingWire Couples' Choice Awards`] : []}
      />
      <GalleryBlock images={images} />
      <OfferingsBlock offerings={offerings} />
      <ActionBlock label="Visit the full wedding site" href="/weddings/bahamas-by-the-sea" />
      <SiteFooter orgLine="Bahamas Weddings By The Sea · Booking and payments powered by PortPass" />
    </div>
  );
}
