import { notFound } from "next/navigation";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { BusinessHeader, BusinessFooter } from "@/app/_components/BusinessShell";
import { BusinessArrivalPlate } from "@/app/_components/BusinessArrivalPlate";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { ppDisplay, ppSans } from "@/app/fonts";

// The paid-tier shell: a business's own domain, its own header/footer (no
// PortPass chrome, no breadcrumb), its own accent -- and the exact same
// Identity/Proof/Gallery/Offerings/... blocks every PortPass page uses.
// Reached two ways: middleware rewrites a business's custom_domain here,
// and it's also a normal route on portpassbahamas.com/sites/[slug] --
// which is deliberate, so a business's own site can be reviewed here
// before its domain exists or is pointed at Vercel.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getOrganizationListingBySlug(slug);
  if (!listing) return {};
  const { organization: org } = listing;
  // Every other page on the site carries a descriptive suffix; a bare
  // org.name here left <title> as just "Bahamas Weddings By The Sea" with
  // nothing to distinguish it in a search result or a browser tab. This is
  // the business's own site (no PortPass branding in its chrome), so the
  // suffix is the business's own tagline, not "| PortPass Bahamas" the way
  // portpassbahamas.com's own pages do it.
  const title = slug === "bahamas-weddings" ? `${org.name} | Nassau Wedding Officiant & Planner` : org.name;
  const description = org.oneLiner ?? org.description ?? undefined;
  const url = org.customDomain ? `https://${org.customDomain}` : undefined;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: org.name,
      title,
      description,
      url,
      images: org.heroImageUrl ? [{ url: org.heroImageUrl }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BusinessSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getOrganizationListingBySlug(slug);
  if (!listing) notFound();

  const { organization: org } = listing;
  const url = org.customDomain ? `https://${org.customDomain}` : undefined;
  // Computed once here (not just inside OrganizationTemplate) because
  // BusinessHeader/BusinessFooter are siblings of that component's own
  // <main>, not descendants of it -- they need --brand/--brand-text on a
  // shared ancestor to read it at all. The PortPass shell (SiteHeader/
  // SiteFooter) deliberately never gets this; the business's own shell is
  // the one place besides the four permitted spots where --brand is
  // allowed to show up, because on this shell it IS the platform's chrome.
  const { brand, brandText } = computeBrandTokens(org.brandColor);

  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: org.name,
    description: org.oneLiner ?? org.description ?? undefined,
    image: org.heroImageUrl ?? undefined,
    url,
    address: org.island ? { "@type": "PostalAddress", addressRegion: org.island, addressCountry: "BS" } : undefined,
    aggregateRating:
      org.rating !== null && org.reviewCount
        ? { "@type": "AggregateRating", ratingValue: org.rating, reviewCount: org.reviewCount }
        : undefined,
  };

  return (
    <div
      className={`site-shell-business ${ppDisplay.variable} ${ppSans.variable}`}
      style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}
    >
      {slug === "bahamas-weddings" && <BusinessArrivalPlate mark="🌴" word="Bahamas" sub="Weddings by the sea" />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <BusinessHeader
        name={org.name}
        logoUrl={org.logoUrl}
        brand={brand}
        wordmarkMark={slug === "bahamas-weddings" ? "🌴" : undefined}
      />
      <OrganizationTemplate listing={listing} />
      <BusinessFooter name={org.name} />
    </div>
  );
}
