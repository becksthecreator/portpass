import Link from "next/link";
import type { Category, Section } from "@/db/categories";
import { leadPerk, livePerksBySlug } from "@/db/memberPerks";
import { getOrganizationListingBySlug, listPublishedOrganizations, listSectionBusinesses, liveCountsByCategory, type OrganizationListing, type SectionBusiness } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { isInterestCategory, type InterestCategory } from "@/lib/interestCategories";
import { memberPriceCents, perkChip } from "@/lib/memberPerks";
import { getNavSections } from "@/lib/navSections";
import { computeBrandTokens, DEFAULT_BRAND } from "./blocks/brand";
import { ComingSoonCard } from "./blocks/ComingSoonCard";
import { directoryHref } from "./blocks/directoryHref";
import { FeatureCard } from "./blocks/FeatureCard";
import { formatPrice, formatPriceCents } from "./blocks/format";
import { InterestForm } from "./InterestForm";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { SubsectionChips } from "./SubsectionChips";
import { SectionIcon } from "./SectionGrid";
import { PageTransition, SharedElement } from "./motion/PageTransition";
import { getSiteContent } from "@/db/siteContent";
import "./perks/perks.css";
import { JsonLd } from "./seo/JsonLd";
import { sectionJsonLd } from "@/lib/seo/jsonLd";
import { sectionDescription } from "@/lib/seo/titles";
import { ppDisplay, ppSans } from "@/app/fonts";
import "@/app/phase1.css";

// The data-driven section / subcategory page: whatever the categories
// table says exists, rendered from the same cards the hand-built category
// pages use. Below the coming-soon threshold it says so (and the route
// marks itself noindex); a "get notified" form is always at the bottom,
// because demand for a section that isn't open yet is the most useful
// thing it can capture.
export async function countLiveBusinesses(section: string, subcategory?: string | null): Promise<number> {
  return (await liveBusinessNames(section, subcategory)).length;
}

// The names of the businesses live in a section, in the order the page
// lists them: for the page's description (brief 11: real counts, real names).
export async function liveBusinessNames(section: string, subcategory?: string | null): Promise<string[]> {
  try {
    const businesses = await withOneRetry(() => listSectionBusinesses(section, subcategory));
    return businesses.filter((b) => b.isPublished).map((b) => b.name);
  } catch {
    return [];
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
  "photo-booths": "a photo-booth business",
  weddings: "a wedding business",
  "wedding-venues": "a wedding venue",
  "photo-video": "a photo or video business",
  "sports-fitness": "a sports program",
  services: "a service business",
  photography: "a photo or video business",
  "phone-tech-repair": "a repair shop",
  shop: "a Bahamian brand",
  "apparel-merch": "an apparel or merch brand",
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
  const [listings, counts, perksBySlug] = await Promise.all([
    Promise.all(published.map((b) => safeListing(b.slug))).then((all) => all.filter((l): l is OrganizationListing => l !== null)),
    safeCounts(),
    // Member perks (brief 10): a labelled chip on the card. It never
    // changes the order of the cards.
    livePerksBySlug(),
  ]);
  const liveCount = listings.length;
  // Brief 22 (M4): a listing is featured when the founders put it in the
  // homepage order (Admin -> Content); its vector logo mark may idle here.
  const { spotlight } = await getSiteContent();
  const belowThreshold = liveCount < current.comingSoonThreshold;
  const cardCount = listings.length + comingSoon.length;
  const bookable = belowThreshold ? await bookableNow(section.slug) : [];
  const ownerNoun = OWNER_NOUN[current.slug] ?? `a ${current.name.toLowerCase()} business`;

  const breadcrumb = [{ label: section.name, href: `/${section.slug}` }];
  if (subcategory) breadcrumb.push({ label: subcategory.name, href: `/${section.slug}/${subcategory.slug}` });
  // Optional (Antonio to confirm): the Entertainment hero in Night, since
  // it suits nightlife. One env var switches it on.
  const nightHero = section.slug === "entertainment" && process.env.ENTERTAINMENT_NIGHT_HERO === "1";

  const pagePath = subcategory ? `/${section.slug}/${subcategory.slug}` : `/${section.slug}`;
  const structured = sectionJsonLd({
    name: subcategory ? `${subcategory.name} · ${section.name}` : section.name,
    path: pagePath,
    description: sectionDescription(current.name, listings.map(({ organization }) => organization.name)),
    businesses: listings.map(({ organization }) => ({ name: organization.name, path: directoryHref(organization.slug, organization.primaryCategory) })),
  });

  return (
    <PageTransition>
    <main className={`tpl-page category-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <JsonLd data={structured} />
      <SiteHeader breadcrumb={breadcrumb} tide />
      <section className={`category-hero category-hero-plain${nightHero ? " category-hero-night" : ""}`}>
        <div className="category-hero-inner">
          {/* "Coming soon" only when there is nothing to book; below the
              threshold but with a live business, the page is open (the
              threshold still drives the reassurance block further down). */}
          {/* Brief 22 (M4): a homepage section card's icon and title morph into
              this icon and heading (the same names on both); a subsection
              page has no card of its own and only cross-fades. */}
          <span className="category-hero-eyebrow">
            {!subcategory && <SharedElement name={`section-icon-${section.slug}`}><span className="category-hero-icon" aria-hidden="true"><SectionIcon slug={section.slug} /></span></SharedElement>}
            {subcategory ? section.name : "PortPass"}{liveCount === 0 ? " · Coming soon" : ""}
          </span>
          {subcategory ? <h1>{current.name} in The Bahamas.</h1> : <SharedElement name={`section-title-${section.slug}`}><h1>{current.name} in The Bahamas.</h1></SharedElement>}
          <p>
            {liveCount > 0
              ? `${liveCount} ${liveCount === 1 ? "business" : "businesses"} you can book right now.`
              : `${current.name} is on its way to PortPass.`}
          </p>
        </div>
      </section>

      {liveCount > 0 && <SubsectionChips section={section} current={subcategory?.slug ?? null} counts={counts} />}

      {/* With nothing to book yet (brief 18, A4) the page is one panel:
          what's coming, the "I'm looking for…" form and the way in for a
          business. No grid of empty cards. */}
      {liveCount === 0 && (
        <section className="soon-panel" id="notify" aria-label={`${current.name} is coming to PortPass`}>
          <div className="soon-panel-coming">
            <h2>What&rsquo;s coming</h2>
            {!subcategory && section.subcategories.length > 0 ? (
              <ul className="soon-panel-list">
                {section.subcategories.map((sub) => <li key={sub.slug}><Link href={`/${section.slug}/${sub.slug}`}>{sub.name}</Link></li>)}
              </ul>
            ) : (
              <p>{current.name}, bookable online with real prices{subcategory ? <>. See everything coming to <Link href={`/${section.slug}`}>{section.name}</Link></> : null}.</p>
            )}
            {comingSoon.length > 0 && <p className="soon-panel-names">Joining soon: {comingSoon.map((b) => b.name).join(", ")}.</p>}
          </div>
          <div className="soon-panel-form">
            <h2>I&rsquo;m looking for…</h2>
            <p>Tell us what you&rsquo;d book in {current.name.toLowerCase()} and we&rsquo;ll let you know when it opens. We&rsquo;ll only contact you about this.</p>
            <InterestForm category={interestCategoryFor(section, subcategory)} placeholder="What are you looking for? (optional)" defaultNote={subcategory ? `Interested in ${subcategory.name}.` : ""} />
          </div>
          <div className="soon-panel-foot">
            <p className="soon-panel-owner">Run a business like this? <Link href={`/apply?section=${encodeURIComponent(section.slug)}`}>Get listed &rarr;</Link></p>
            {bookable.length > 0 && (
              <p className="category-notify-bookable">
                <span>Bookable now:</span>
                {bookable.map((s) => <Link key={s.href} href={s.href}>{s.label}</Link>)}
              </p>
            )}
          </div>
        </section>
      )}

      {liveCount > 0 && cardCount > 0 && (
        <div className={`feature-card-grid${cardCount === 1 ? " feature-card-grid-solo" : ""}`}>
          {listings.map(({ organization: org, offerings }, cardIndex) => {
            const cheapest = offerings
              .filter((offering) => offering.priceCents !== null)
              .sort((a, b) => (a.priceCents as number) - (b.priceCents as number))[0];
            const { brand, brandText } = computeBrandTokens(org.brandColor);
            const perk = leadPerk(perksBySlug.get(org.slug) ?? []);
            // Both prices, both real: the business's own price and what a
            // member pays with its perk.
            const memberCents = cheapest && perk && (perk.offeringId === null || perk.offeringId === cheapest.id) ? memberPriceCents(cheapest.priceCents as number, perk, cheapest.priceUnit) : null;
            const fromLabel = cheapest ? `From ${formatPrice(cheapest.priceCents as number, cheapest.priceUnit)}` : null;
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
                priceLabel={fromLabel && memberCents !== null && memberCents !== cheapest?.priceCents ? `${fromLabel} · Members ${formatPriceCents(memberCents, { currency: false })}` : fromLabel}
                perkLabel={perk ? perkChip(perk) : null}
                actionHref={directoryHref(org.slug, org.primaryCategory)}
                actionLabel={`Explore ${org.name} →`}
                wide={cardCount === 1}
                priority={cardIndex === 0}
                featured={spotlight.includes(org.slug)}
              />
            );
          })}
          {comingSoon.map((b) => (
            <ComingSoonCard key={b.slug} name={b.name} logoUrl={b.logoUrl} brand={b.brandColor ?? DEFAULT_BRAND} notifyHref="#notify" />
          ))}
        </div>
      )}

      {liveCount > 0 && (
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
      )}

      <SiteFooter tide />
    </main>
    </PageTransition>
  );
}
