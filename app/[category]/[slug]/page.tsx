import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPage, liveBusinessNames } from "@/app/_components/CategoryPage";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import { RelatedInSection } from "@/app/_components/seo/RelatedInSection";
import "@/app/_components/seo/seo.css";
import { fromPriceCents, listingJsonLd } from "@/lib/seo/fromListing";
import { absoluteUrl } from "@/lib/seo/jsonLd";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { businessDescription, businessTitle, sectionDescription, sectionTitle } from "@/lib/seo/titles";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { bizDisplay, ppSans } from "@/app/fonts";
import { listSections } from "@/db/categories";
import { getOrganizationListingBySlug } from "@/db/organizations";

// /{section}/{slug} is a subcategory first, then a live business in that
// section -- the convention directoryHref() has pointed at all along.
// Slugs are kept from colliding at write time (lib/reservedSlugs.ts plus a
// check against the categories table), so the order here is a tie-break
// that should never actually matter.
// ISR (speed brief, 29 Sept): five-minute cache, rebuilt on demand; no
// build-time prerender (the params list is empty), so CI's credential-less
// build never has to reach the database.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ category: string; slug: string }>;

async function resolve(category: string, slug: string) {
  let section = null;
  try {
    section = (await listSections()).find((s) => s.slug === category) ?? null;
  } catch {
    section = null;
  }
  if (!section) return null;
  const subcategory = section.subcategories.find((c) => c.slug === slug) ?? null;
  if (subcategory) return { section, subcategory, listing: null };
  const listing = await getOrganizationListingBySlug(slug).catch(() => null);
  if (!listing || listing.organization.primaryCategory !== category) return null;
  if (listing.organization.status !== "live" && listing.organization.status !== "approved") return null;
  return { section, subcategory: null, listing };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category, slug } = await params;
  const resolved = await resolve(category, slug);
  if (!resolved) return {};
  if (resolved.subcategory) {
    const names = await liveBusinessNames(category, slug);
    const title = sectionTitle(resolved.section.name, resolved.subcategory.name);
    const description = sectionDescription(resolved.subcategory.name, names);
    return {
      title,
      description,
      alternates: { canonical: `https://portpassbahamas.com/${category}/${slug}` },
      openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: `https://portpassbahamas.com/${category}/${slug}` },
      robots: names.length === 0 ? { index: false, follow: true } : undefined,
    };
  }
  const listing = resolved.listing!;
  const org = listing.organization;
  const what = resolved.section.subcategories.find((sub) => sub.slug === org.subcategory)?.name ?? resolved.section.name;
  const title = businessTitle(org.name, what, org.area, org.island);
  const description = businessDescription(org.name, org.oneLiner ?? org.description, fromPriceCents(listing));
  return {
    title,
    description,
    // One address per business: where directoryHref sends people (Futprep
    // and Bahamas Weddings By The Sea have their own pages).
    alternates: { canonical: absoluteUrl(directoryHref(org.slug, org.primaryCategory)) },
    openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: absoluteUrl(directoryHref(org.slug, org.primaryCategory)) },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SectionSlugPage({ params }: { params: Params }) {
  const { category, slug } = await params;
  const resolved = await resolve(category, slug);
  if (!resolved) notFound();
  if (resolved.subcategory) return <CategoryPage section={resolved.section} subcategory={resolved.subcategory} />;

  const listing = resolved.listing!;
  return (
    <div className={`${bizDisplay.variable} ${ppSans.variable}`}>
      <JsonLd data={listingJsonLd(listing, directoryHref(listing.organization.slug, listing.organization.primaryCategory))} />
      <SiteHeader breadcrumb={[{ label: resolved.section.name, href: `/${category}` }, { label: listing.organization.name, href: `/${category}/${slug}` }]} />
      <OrganizationTemplate listing={listing} />
      <RelatedInSection section={category} sectionName={resolved.section.name} exceptSlug={slug} />
      <SiteFooter orgLine={`${listing.organization.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
