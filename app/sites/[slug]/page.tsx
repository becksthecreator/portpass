import { notFound } from "next/navigation";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { BusinessHeader, BusinessFooter } from "@/app/_components/BusinessShell";
import { BusinessArrivalPlate } from "@/app/_components/BusinessArrivalPlate";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { bizDisplay, ppSans } from "@/app/fonts";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { listingJsonLd } from "@/lib/seo/fromListing";

// The paid-tier shell: a business's own domain, its own header/footer (no
// PortPass chrome, no breadcrumb), its own accent -- and the exact same
// Identity/Proof/Gallery/Offerings/... blocks every PortPass page uses.
// Reached two ways: middleware rewrites a business's custom_domain here,
// and it's also a normal route on portpassbahamas.com/sites/[slug] --
// which is deliberate, so a business's own site can be reviewed here
// before its domain exists or is pointed at Vercel.
// ISR (speed brief, 29 Sept): five-minute cache, rebuilt on demand; no
// build-time prerender (the params list is empty), so CI's credential-less
// build never has to reach the database.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getOrganizationListingBySlug(slug).catch(() => null);
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
  const listing = await getOrganizationListingBySlug(slug).catch(() => null);
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

  // The same structured data as the business's PortPass page, at its own
  // address. No rating: PortPass doesn't collect reviews, and Google
  // doesn't accept ratings copied from another site.
  const schema = listingJsonLd(listing, url ?? directoryHref(org.slug, org.primaryCategory));

  return (
    <div
      className={`site-shell-business ${bizDisplay.variable} ${ppSans.variable}`}
      style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}
    >
      {slug === "bahamas-weddings" && <BusinessArrivalPlate mark="🌴" word="Bahamas" sub="Weddings by the sea" />}
      <JsonLd data={schema} />
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
