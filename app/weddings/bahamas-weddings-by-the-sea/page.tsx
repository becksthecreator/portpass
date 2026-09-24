import { getOrganizationExtrasBySlug, type Offering } from "@/db/organizations";
import { getWeddingSiteSettings } from "@/db/weddingSite";
import { getPublicWeddingPackages } from "@/db/weddingPackages";
import { IdentityBlock } from "@/app/_components/blocks/IdentityBlock";
import { ProofBlock } from "@/app/_components/blocks/ProofBlock";
import { Carousel } from "@/app/_components/blocks/Carousel";
import { ReviewsPanel } from "@/app/_components/blocks/ReviewsPanel";
import { OfferingsBlock } from "@/app/_components/blocks/OfferingsBlock";
import { PeopleBlock } from "@/app/_components/blocks/PeopleBlock";
import { ServicesBlock } from "@/app/_components/blocks/ServicesBlock";
import { QuestionsBlock } from "@/app/_components/blocks/QuestionsBlock";
import { ActionBlock } from "@/app/_components/blocks/ActionBlock";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ppDisplay, ppSans } from "@/app/fonts";

const ASSET = "/weddings/bahamas-by-the-sea";

// All eight supplied photos, in this specific order -- it alternates wide
// scene-setting shots with closer human moments so the continuous drift
// never shows two similar frames side by side. bws-10 leads because it's
// the strongest image in the set. bws-10 and bws-9 also appear in the
// identity block and people block respectively -- an image appearing both
// in the hero and the gallery is normal and reads fine. Real width/height
// on every image so the carousel track doesn't reflow as photos arrive.
const GALLERY_PHOTOS = [
  { file: "bws-10.webp", alt: "A beach ceremony beneath a floral arch, turquoise water behind", width: 1280, height: 853 },
  { file: "bws-16.webp", alt: "A resort beach ceremony with guests seated among purple florals", width: 1138, height: 1706 },
  { file: "bws-11.webp", alt: "A couple with Antonio beneath a turquoise-draped arch", width: 1138, height: 1707 },
  { file: "bws-13.webp", alt: "A garden ceremony, Antonio officiating as the couple embrace", width: 1280, height: 1706 },
  { file: "bws-12.webp", alt: "A couple share a kiss on the beach under a wide blue sky", width: 1138, height: 1707 },
  { file: "bws-15.webp", alt: "A beach ceremony at golden hour, guests seated, tiki torch lit", width: 1280, height: 853 },
  { file: "bws-14.webp", alt: "A couple with Antonio beneath a white draped arch on the sand", width: 1138, height: 1707 },
  { file: "bws-9.webp", alt: "Antonio greeting a guest after the ceremony", width: 1280, height: 853 },
];

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
  const [settings, packages, extras] = await Promise.all([
    getWeddingSiteSettings(),
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
    actionUrl: `/weddings/bahamas-weddings-by-the-sea/plan?tier=${encodeURIComponent(pkg.slug)}`,
    isFeatured: pkg.isFeatured,
  }));

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
        <section className="tpl-gallery-carousel-section">
          <div className="tpl-section-heading">
            <p className="tpl-eyebrow">Real island weddings</p>
            <h2>A little colour from the water&rsquo;s edge.</h2>
          </div>
          <Carousel variant="gallery" speed={28} prevLabel="Previous photographs" nextLabel="Next photographs">
            {GALLERY_PHOTOS.map((photo, i) => (
              <figure className="tpl-carousel-item" key={photo.file}>
                <img
                  src={`${ASSET}/${photo.file}`}
                  alt={photo.alt}
                  width={photo.width}
                  height={photo.height}
                  loading={i < 3 ? "eager" : "lazy"}
                />
              </figure>
            ))}
          </Carousel>
        </section>
        <OfferingsBlock offerings={offerings} />
        <ServicesBlock services={SERVICE_LIST} />
        <PeopleBlock
          name={extras.ownerName}
          bio={extras.ownerBio}
          imageUrl={extras.ownerImageUrl}
          credentials={extras.ownerName ? "D.Min, MSc. · Licensed Marriage Officer · Justice of the Peace" : null}
          contactPhone={extras.ownerName ? "+1 (242) 424-1262" : null}
          contactEmail={extras.ownerName ? "aobeckford2021@gmail.com" : null}
        />
        <QuestionsBlock faqs={extras.faqs} />
        {/*
          Reviews render only through the official WeddingWire widget (the
          PR #26 rule: never read, copy or store the review text itself).
          Deliberately a static, vertically-scrolling panel rather than a
          carousel like the gallery -- reviews are read, and moving text
          works against reading. See ReviewsPanel.tsx: it removes the whole
          section itself if the widget never populates, rather than leave
          a hole above the action block.
        */}
        {settings.reviewsWidgetHtml && (
          <section className="tpl-reviews">
            <div className="tpl-section-heading">
              <p className="tpl-eyebrow">In their words</p>
              <h2>One hundred five-star reviews.</h2>
            </div>
            <ReviewsPanel html={settings.reviewsWidgetHtml} />
            <a
              className="tpl-text-link"
              target="_blank"
              rel="nofollow noopener noreferrer"
              href="https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html"
            >
              Read all reviews on WeddingWire ↗
            </a>
          </section>
        )}
        <ActionBlock label="See prices & get started" href="#offerings" />
      </main>
      <SiteFooter orgLine="Bahamas Weddings By The Sea · Booking and payments powered by PortPass" />
    </div>
  );
}
