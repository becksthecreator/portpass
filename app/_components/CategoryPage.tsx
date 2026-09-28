import Link from "next/link";
import type { Category, Section } from "@/db/categories";
import { getOrganizationListingBySlug, listPublishedOrganizations, listSectionBusinesses, liveCountsByCategory, type OrganizationListing, type SectionBusiness } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { isInterestCategory, type InterestCategory } from "@/lib/interestCategories";
import { getNavSections } from "@/lib/navSections";
import { computeBrandTokens } from "./blocks/brand";
import { ComingSoonCard } from "./blocks/ComingSoonCard";
import { directoryHref } from "./blocks/directoryHref";
import { FeatureCard } from "./blocks/FeatureCard";
import { formatPrice } from "./blocks/format";
import { InterestForm } from "./InterestForm";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { SubsectionChips } from "./SubsectionChips";
import { ppDisplay, ppSans } from "@/app/fonts";

// The data-driven section / subcategory page: whatever the categories
// table says exists, rendered from the same cards the hand-built category
// pages use. Below the coming-soon threshold it says so (and the route
// marks itself noindex); a "get notified" form is always at the bottom,
// because demand for a section that isn't open yet is the most useful
// thing it can capture.
export async function countLiveBusinesses(section: string, subcategory?: string | null): Promise<number> {
  try {
    const businesses = await withOneRetry(() => listSectionBusinesses(section, subcategory));
    return businesses.filter((b) => b.isPublished).length;
  } catch {
    return 0;
  }
}

async function safeListing(slug: string): Promise<OrganizationListing | null> {
  try {
    return await withOneRetry(() => getOrganizationListingBySlug(slug));
  } catch (error) {
    console.error(`category page: listing fetch failed for "${slug}"`, error);
    return null;
  }
}

async function safeCounts(): Promise<Map<string, number>> {
  try {
    return await withOneRetry(() => liveCountsByCategory());
  } catch (error) {
    console.error("category page: live counts failed, chips show no counts", error);
    return new Map();
  }
}

function interestCategoryFor(section: Section, subcategory: Category | null): InterestCategory {
  if (subcategory && isInterestCategory(subcategory.slug)) return subcategory.slug;
  if (isInterestCategory(section.slug)) return section.slug;
  return "entertainment";
}

// "Run a venue?" reads better than "Run a venues business?".
const OWNER_NOUN: Record<string, string> = {
  venues: "a venue",
  "event-venues": "an event venue",
  "gardens-outdoor": "a garden or outdoor venue",
  "meeting-rooms": "meeting rooms",
  tours: "a tour company",
  boats: "a boat or charter",
  "fishing-charters": "a fishing charter",
  "food-tours": "a food or culture tour",
  "land-tours": "land tours",
  entertainment: "an entertainment business",
  events: "events",
  djs: "a DJ business",
  "sound-equipment": "a sound-equipment business",
  "party-rentals": "a party-rental business",
  weddings: "a wedding business",
  "wedding-venues": "a wedding venue",
  "photo-video": "a photo or video business",
  "sports-fitness": "a sports program",
  services: "a service business",
  photography: "a photo or video business",
  "phone-tech-repair": "a repair shop",
};

// The sections a visitor can book in today, for the "Bookable now" row on
// a coming-soon page. Derived from the directory, so a new live section
// shows up here without a deploy; empty on a DB hiccup rather than wrong.
async function bookableNow(exceptSlug: string): Promise<{ label: string; href: string }[]> {
  try {
    const [directory, sections] = await Promise.all([withOneRetry(() => listPublishedOrganizations()), getNavSections()]);
    const live = new Set(directory.map((b) => b.primaryCategory).filter(Boolean));
    return sections.filter((s) => live.has(s.href.slice(1)) && s.href !== `/${exceptSlug}`);
  } catch {
    return [];
  }
}

export async function CategoryPage({ section, subcategory = null }: { section: Section; subcategory?: Category | null }) {
  const current = subcategory ?? section;
  let businesses: SectionBusiness[] = [];
  try {
    businesses = await withOneRetry(() => listSectionBusinesses(section.slug, subcategory?.slug ?? null));
  } catch (error) {
    console.error(`category page: business list failed for ${section.slug}/${subcategory?.slug ?? ""}`, error);
  }
  const published = businesses.filter((b) => b.isPublished);
  const comingSoon = businesses.filter((b) => !b.isPublished);
  const [listings, counts] = await Promise.all([
    Promise.all(published.map((b) => safeListing(b.slug))).then((all) => all.filter((l): l is OrganizationListing => l !== null)),
    safeCounts(),
  ]);
  const liveCount = listings.length;
  const belowThreshold = liveCount < current.comingSoonThreshold;
  const cardCount = listings.length + comingSoon.length;
  const bookable = belowThreshold ? await bookableNow(section.slug) : [];
  const ownerNoun = OWNER_NOUN[current.slug] ?? `a ${current.name.toLowerCase()} business`;

  const breadcrumb = [{ label: section.name, href: `/${section.slug}` }];
  if (subcategory) breadcrumb.push({ label: subcategory.name, href: `/${section.slug}/${subcategory.slug}` });

  return (
    <main className={`tpl-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={breadcrumb} />
      <section className="category-hero category-hero-plain">
        <div className="category-hero-inner">
          {/* "Coming soon" only when there is nothing to book; below the
              threshold but with a live business, the page is open (the
              threshold still drives the reassurance block further down). */}
          <span className="category-hero-eyebrow">{subcategory ? section.name : "PortPass"}{liveCount === 0 ? " · Coming soon" : ""}</span>
          <h1>{current.name} in The Bahamas.</h1>
          <p>
            {liveCount > 0
              ? `${liveCount} ${liveCount === 1 ? "business" : "businesses"} you can book right now.`
              : `${current.name} is on its way to PortPass. Tell us what you're looking for and we'll reach out when it opens.`}
          </p>
        </div>
      </section>

      <SubsectionChips section={section} current={subcategory?.slug ?? null} counts={counts} />

      {/* With nothing live yet, the subsection cards are the page's body;
          once there are listings, the chips above do the picking and the
          listings are what people came for. */}
      {!subcategory && liveCount === 0 && section.subcategories.length > 0 && (
        <div className="subsection-grid">
          {section.subcategories.map((sub) => (
            <Link className="subsection-card" href={`/${section.slug}/${sub.slug}`} key={sub.slug}>
              <span className="coming-soon-label">{(counts.get(sub.slug) ?? 0) > 0 ? "Open now" : "Coming soon"}</span>
              <h2>{sub.name}</h2>
              <b>Browse &rarr;</b>
            </Link>
          ))}
        </div>
      )}

      {cardCount > 0 && (
        <div className={`feature-card-grid${cardCount === 1 ? " feature-card-grid-solo" : ""}`}>
          {listings.map(({ organization: org, offerings }) => {
            const cheapest = offerings
              .filter((offering) => offering.priceCents !== null)
              .sort((a, b) => (a.priceCents as number) - (b.priceCents as number))[0];
            const { brand, brandText } = computeBrandTokens(org.brandColor);
            return (
              <FeatureCard
                key={org.slug}
                photoUrl={org.heroImageUrl}
                photoAlt={org.name}
                label="Open now"
                name={org.name}
                logoUrl={org.logoUrl}
                brand={brand}
                brandText={brandText}
                description={org.oneLiner ?? ""}
                priceLabel={cheapest ? `From ${formatPrice(cheapest.priceCents as number, cheapest.priceUnit)}` : null}
                actionHref={directoryHref(org.slug, org.primaryCategory)}
                actionLabel={`Explore ${org.name} →`}
                wide={cardCount === 1}
              />
            );
          })}
          {comingSoon.map((b) => (
            <ComingSoonCard key={b.slug} name={b.name} logoUrl={b.logoUrl} brand={b.brandColor ?? "#e8794a"} notifyHref="#notify" />
          ))}
        </div>
      )}

      <section className="category-notify" id="notify">
        <div className="form-intro">
          <div className="eyebrow"><span className="eyebrow-dot" />{liveCount > 0 ? "Want more here?" : "Be first to know"}</div>
          <h2>{liveCount > 0 ? `Tell us what else you'd book in ${current.name.toLowerCase()}.` : `We'll tell you when ${current.name.toLowerCase()} opens.`}</h2>
        </div>
        <InterestForm category={interestCategoryFor(section, subcategory)} placeholder="What are you looking for? (optional)" defaultNote={subcategory ? `Interested in ${subcategory.name}.` : ""} />
        {belowThreshold && (
          <div className="category-notify-more">
            <p className="category-notify-reassure">We&rsquo;ll only contact you when this opens, or if we find a match for what you need.</p>
            {bookable.length > 0 && (
              <p className="category-notify-bookable">
                <span>Bookable now:</span>
                {bookable.map((s) => <Link key={s.href} href={s.href}>{s.label}</Link>)}
              </p>
            )}
            <p className="category-notify-owner">
              Run {ownerNoun}? <Link href={`/apply?section=${encodeURIComponent(section.slug)}`}>Get listed &rarr;</Link>
            </p>
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
