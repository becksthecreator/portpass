import { getOrganizationListingBySlug } from "@/db/organizations";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { FeatureCard } from "@/app/_components/blocks/FeatureCard";
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

// A category page lists businesses, not programs -- Futprep's own programs
// (Lil Kickers, Kickers) live on its own page, which is where a visitor
// who already picked Futprep wants to see them.
export default async function SportsFitnessPage() {
  const futprep = await getOrganizationListingBySlug("futprep");
  const businesses = futprep ? [futprep] : [];

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

      <div className={`feature-card-grid${businesses.length === 1 ? " feature-card-grid-solo" : ""}`}>
        {businesses.map(({ organization: org, offerings }) => {
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
              wide={businesses.length === 1}
            />
          );
        })}
      </div>
      {businesses.length === 0 && (
        <p className="category-empty">More sports and fitness organizations join PortPass as they come on board.</p>
      )}

      <SiteFooter />
    </main>
  );
}
