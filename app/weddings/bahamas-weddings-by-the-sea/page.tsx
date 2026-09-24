import { getOrganizationExtrasBySlug, type Offering } from "@/db/organizations";
import { getPublicWeddingGallery, getWeddingSiteSettings } from "@/db/weddingSite";
import { getPublicWeddingPackages } from "@/db/weddingPackages";
import { IdentityBlock } from "@/app/_components/blocks/IdentityBlock";
import { ProofBlock } from "@/app/_components/blocks/ProofBlock";
import { GalleryBlock } from "@/app/_components/blocks/GalleryBlock";
import { OfferingsBlock } from "@/app/_components/blocks/OfferingsBlock";
import { PeopleBlock } from "@/app/_components/blocks/PeopleBlock";
import { ServicesBlock } from "@/app/_components/blocks/ServicesBlock";
import { QuestionsBlock } from "@/app/_components/blocks/QuestionsBlock";
import { ActionBlock } from "@/app/_components/blocks/ActionBlock";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ppDisplay, ppSans } from "@/app/fonts";

// Antonio's own service list, from his business documentation. Cruise
// Passenger Weddings specifically wasn't mentioned anywhere on the site
// before -- Nassau's cruise-passenger volume makes it a real, distinct
// market from a destination wedding booked in advance.
const SERVICE_LIST = [
  "Marriage Licence Assistance",
  "Registrar Appointments",
  "Beach Weddings",
  "Hotel & Resort Weddings",
  "Private Villa Weddings",
  "Cruise Passenger Weddings",
  "Vow Renewals",
  "Elopements",
  "Customised Ceremonies",
  "Photography & Videography",
  "Transportation",
  "Premarital Counselling",
];

// Same listing as the "Read reviews" link on the bespoke site
// (app/weddings/bahamas-by-the-sea/page.tsx) -- duplicated locally rather
// than exported/shared since these two pages don't otherwise share code.
const WEDDINGWIRE_URL = "https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html";

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
  const [settings, gallery, packages, extras] = await Promise.all([
    getWeddingSiteSettings(),
    getPublicWeddingGallery(),
    getPublicWeddingPackages(),
    getOrganizationExtrasBySlug("bahamas-weddings"),
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

  // Package cards on this page no longer carry their own imageUrl (see
  // migration 202609241016), so there's nothing left to exclude here to
  // avoid a photo appearing twice on the page.
  const images = gallery.slice(0, 4).map((image) => ({ url: image.imageUrl, alt: image.caption }));

  return (
    <div className={`${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Weddings", href: "/weddings" }, { label: "Bahamas Weddings By The Sea", href: "/weddings/bahamas-weddings-by-the-sea" }]} />
      {/* bws-listing-theme: this listing's own tropical palette (22
          September brief), scoped here only -- most roles (badge, gallery
          background, offering price) keep their own distinct named tokens,
          not a single accent. --brand is the one exception: the 24 Sept
          brief is explicit that Antonio wants exactly four elements in his
          own rose (#B0455F, contrast-checked in both directions against
          this palette's paper) -- package CTAs, the build-your-own button,
          the featured-tier border, and CTA hover -- which is exactly what
          the generic --brand/--brand-text mechanism already threads through
          OfferingsBlock/ActionBlock, so it's used here rather than adding a
          fifth named token that would only ever hold this same value. */}
      <main className="tpl-page bws-listing-theme" style={{ "--brand": "#B0455F", "--brand-text": "#9E3A55" } as React.CSSProperties}>
        <IdentityBlock
          name="Bahamas Weddings By The Sea"
          category="Weddings"
          location="Nassau, New Providence"
          isOpen
          heroImageUrl="/weddings/bahamas-by-the-sea/bws-10.webp"
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
        <ServicesBlock services={SERVICE_LIST} />
        <PeopleBlock
          name={extras.ownerName}
          bio={extras.ownerBio}
          imageUrl={extras.ownerImageUrl}
          credentials={extras.ownerName ? "D.Min, MSc. · Licensed Marriage Officer · Justice of the Peace" : null}
        />
        <QuestionsBlock faqs={extras.faqs} />
        <ActionBlock label="See prices & get started" href="#offerings" />
      </main>
      <SiteFooter orgLine="Bahamas Weddings By The Sea · Booking and payments powered by PortPass" />
    </div>
  );
}
