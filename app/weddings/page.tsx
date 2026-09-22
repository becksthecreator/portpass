import { getWeddingSiteSettings } from "@/db/weddingSite";
import { getPublicWeddingPackages } from "@/db/weddingPackages";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { FeatureCard } from "@/app/_components/blocks/FeatureCard";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ppDisplay, ppSans } from "@/app/fonts";

// force-dynamic: reads live wedding-site data at request time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Weddings in The Bahamas | PortPass Bahamas",
  description: "Island ceremonies and vow renewals in The Bahamas, planned end to end: officiant, venue, photography, paperwork.",
};

const CATEGORY_HERO_IMAGE = "/weddings/bahamas-by-the-sea/hero.jpg";

// BWS's detail page is built from the wedding-specific tables, not the
// offerings table, so its directory row (see db/organizations.ts) only
// supplies identity fields here -- price comes from the real packages.
export default async function WeddingsPage() {
  const [listing, settings, packages] = await Promise.all([
    getOrganizationListingBySlug("bahamas-weddings"),
    getWeddingSiteSettings(),
    getPublicWeddingPackages(),
  ]);
  const org = listing?.organization;
  const cheapest = packages
    .filter((pkg) => pkg.priceFromCents !== null)
    .sort((a, b) => (a.priceFromCents as number) - (b.priceFromCents as number))[0];
  const { brand, brandText } = computeBrandTokens(org?.brandColor ?? null);

  return (
    <main className={`tpl-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Weddings", href: "/weddings" }]} />
      <section className="category-hero" style={{ backgroundImage: `url(${CATEGORY_HERO_IMAGE})` }}>
        <div className="category-hero-inner">
          <span className="category-hero-eyebrow">Weddings</span>
          <h1>Weddings in The Bahamas.</h1>
          <p>Island ceremonies and vow renewals, planned end to end: officiant, venue, photography, and paperwork.</p>
        </div>
      </section>

      <div className="feature-card-grid feature-card-grid-solo">
        {org && (
          <FeatureCard
            photoUrl={org.heroImageUrl ?? CATEGORY_HERO_IMAGE}
            photoAlt={org.name}
            label="Open now"
            name={org.name}
            logoUrl={org.logoUrl}
            brand={brand}
            brandText={brandText}
            description={org.oneLiner ?? `${settings.yearsExperience} years officiating, ${settings.reviewCount} five-star reviews.`}
            priceLabel={cheapest ? `From ${formatPriceCents(cheapest.priceFromCents as number)}` : null}
            actionHref="/weddings/bahamas-weddings-by-the-sea"
            actionLabel={`Explore ${org.name} →`}
            wide
          />
        )}
      </div>
      {!org && <p className="category-empty">More wedding businesses join PortPass as they come on board.</p>}

      <SiteFooter />
    </main>
  );
}
