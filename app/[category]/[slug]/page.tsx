import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPage, countLiveBusinesses } from "@/app/_components/CategoryPage";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { listSections } from "@/db/categories";
import { getOrganizationListingBySlug } from "@/db/organizations";

// /{section}/{slug} is a subcategory first, then a live business in that
// section -- the convention directoryHref() has pointed at all along.
// Slugs are kept from colliding at write time (lib/reservedSlugs.ts plus a
// check against the categories table), so the order here is a tie-break
// that should never actually matter.
export const dynamic = "force-dynamic";

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
    const live = await countLiveBusinesses(category, slug);
    return {
      title: `${resolved.subcategory.name} · ${resolved.section.name} | PortPass Bahamas`,
      description: live > 0 ? `${resolved.subcategory.name} you can book on PortPass in The Bahamas.` : `${resolved.subcategory.name} in The Bahamas — coming soon to PortPass.`,
      robots: live === 0 ? { index: false, follow: true } : undefined,
    };
  }
  const org = resolved.listing!.organization;
  const title = `${org.name} | PortPass Bahamas`;
  const description = org.oneLiner ?? org.description ?? undefined;
  return {
    title,
    description,
    openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: `https://portpassbahamas.com/${category}/${slug}` },
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
    <div className={`${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: resolved.section.name, href: `/${category}` }, { label: listing.organization.name, href: `/${category}/${slug}` }]} />
      <OrganizationTemplate listing={listing} />
      <SiteFooter orgLine={`${listing.organization.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
