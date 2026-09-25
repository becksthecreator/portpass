import { getOrganizationListingBySlug, listCategoryOrganizations, type CategoryOrganizationEntry, type OrganizationListing } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { FeatureCard } from "@/app/_components/blocks/FeatureCard";
import { ComingSoonCard } from "@/app/_components/blocks/ComingSoonCard";
import { formatPrice } from "@/app/_components/blocks/format";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ppDisplay, ppSans } from "@/app/fonts";

// force-dynamic: reads live organization/offering data at request time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sports & Fitness in Nassau, The Bahamas | PortPass Bahamas",
  description: "Real Saturday sessions, ages and prices for sports and fitness programs on PortPass.",
};

const CATEGORY_HERO_IMAGE = "/futprep/lil-kickers/lil-kickers-training.jpg";

// Same resilience as the /weddings category page (25 Sept brief, Part
// 1a): a transient Supabase clock-skew rejection (PGRST303) or network
// blip on one query must not take the whole category page down. Retries
// once, then falls back to an empty list and logs -- a business that
// briefly doesn't appear is a much smaller problem than a 500 for every
// visitor to the whole category.
async function safeCategoryOrgs(category: string): Promise<CategoryOrganizationEntry[]> {
  try {
    return await withOneRetry(() => listCategoryOrganizations(category));
  } catch (error) {
    console.error("sports-fitness page: category listing fetch failed, showing no businesses", error);
    return [];
  }
}

// Each business's own listing is fetched independently (not one
// Promise.all) so one business's DB hiccup doesn't hide every business on
// the page -- the others still render normally.
async function safeOrgListing(slug: string): Promise<OrganizationListing | null> {
  try {
    return await withOneRetry(() => getOrganizationListingBySlug(slug));
  } catch (error) {
    console.error(`sports-fitness page: listing fetch failed for "${slug}", omitting its card`, error);
    return null;
  }
}

// A category page lists businesses, not programs -- Futprep's own programs
// (Lil Kickers, Kickers) live on its own page, which is where a visitor
// who already picked Futprep wants to see them. A business mid-onboarding
// (a real row, not yet published -- see block F1 of the 22 September
// brief) still shows up here, as a Coming Soon card instead of a
// FeatureCard, rather than being invisible until it's fully live.
export default async function SportsFitnessPage() {
  const categoryOrgs = await safeCategoryOrgs("sports-fitness");
  const published = categoryOrgs.filter((org) => org.isPublished);
  const comingSoon = categoryOrgs.filter((org) => !org.isPublished);
  const listings = (
    await Promise.all(published.map((org) => safeOrgListing(org.slug)))
  ).filter((listing): listing is NonNullable<typeof listing> => listing !== null);
  const cardCount = listings.length + comingSoon.length;

  return (
    <main className={`tpl-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Sports & Fitness", href: "/sports-fitness" }]} />
      <section className="category-hero" style={{ backgroundImage: `url(${CATEGORY_HERO_IMAGE})` }}>
        <div className="category-hero-inner">
          <span className="category-hero-eyebrow">Sports &amp; Fitness</span>
          <h1>Sports &amp; Fitness in Nassau, The Bahamas.</h1>
          <p>Real Saturday sessions, ages and prices for sports and fitness programs on PortPass.</p>
        </div>
      </section>

      <div className={`feature-card-grid${cardCount === 1 ? " feature-card-grid-solo" : ""}`}>
        {listings.map(({ organization: org, offerings }) => {
          const cheapest = offerings
            .filter((offering) => offering.priceCents !== null)
            .sort((a, b) => (a.priceCents as number) - (b.priceCents as number))[0];
          const { brand, brandText } = computeBrandTokens(org.brandColor);
          return (
            <FeatureCard
              key={org.slug}
              photoUrl={org.heroImageUrl ?? CATEGORY_HERO_IMAGE}
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
        {comingSoon.map((org) => (
          <ComingSoonCard key={org.slug} name={org.name} logoUrl={org.logoUrl} brand={org.brandColor ?? "#e8794a"} />
        ))}
      </div>
      {cardCount === 0 && (
        <p className="category-empty">More sports and fitness organizations join PortPass as they come on board.</p>
      )}

      <SiteFooter />
    </main>
  );
}
