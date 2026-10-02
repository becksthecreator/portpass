import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { listSections } from "@/db/categories";
import { getOrganizationListingBySlug, listSectionBusinesses, liveCountsByCategory } from "@/db/organizations";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal";

const PLATFORM_HOST = "portpassbahamas.com";

// A business's own domain gets its own minimal sitemap (just its home
// page today -- there's nothing else on that domain yet to list). The
// platform's sitemap lists the fixed pages, every section and subcategory
// with something to book, and every live business page -- all from the
// categories table and organization_categories, the same source the nav
// and the section pages read.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host")?.replace(/^www\./, "").toLowerCase();

  if (host && host !== PLATFORM_HOST && !host.endsWith(".vercel.app")) {
    return [{ url: `https://${host}/` }];
  }

  // lastmod is given only where it is known (brief 11, 5): a business's
  // page from when its details last changed, a section from its newest
  // business, the legal pages from their version. A page whose date
  // isn't tracked carries none, rather than "now" on every request.
  const entries: MetadataRoute.Sitemap = [
    { url: `https://${PLATFORM_HOST}/` },
    { url: `https://${PLATFORM_HOST}/business` },
    { url: `https://${PLATFORM_HOST}/pricing` },
    { url: `https://${PLATFORM_HOST}/apply` },
    { url: `https://${PLATFORM_HOST}/about` },
    { url: `https://${PLATFORM_HOST}/contact` },
    { url: `https://${PLATFORM_HOST}/app` },
    { url: `https://${PLATFORM_HOST}/perks` },
    { url: `https://${PLATFORM_HOST}/futprep/coaches` },
    { url: `https://${PLATFORM_HOST}/futprep/camps` },
    { url: `https://${PLATFORM_HOST}/weddings/bahamas-weddings-by-the-sea/plan` },
    { url: `https://${PLATFORM_HOST}/privacy`, lastModified: new Date(`${PRIVACY_POLICY.updated}T12:00:00Z`) },
    { url: `https://${PLATFORM_HOST}/terms`, lastModified: new Date(`${TERMS_OF_SERVICE.updated}T12:00:00Z`) },
  ];
  const newest = (dates: Array<string | null>): Date | undefined => {
    const times = dates.filter((d): d is string => Boolean(d)).map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t));
    return times.length ? new Date(Math.max(...times)) : undefined;
  };

  try {
    const [sections, live] = await Promise.all([listSections(), liveCountsByCategory()]);
    // Indexable means "has something to book": a section or subcategory
    // with no live business is a coming-soon page (noindex, see
    // app/[category]) and stays out of the sitemap. The coming-soon
    // *threshold* only drives the on-page label, not indexing.
    const seen = new Set<string>();
    for (const section of sections) {
      // A business listed under two sections has one page (its primary
      // section's), so it is listed once.
      const businesses = (await listSectionBusinesses(section.slug).catch(() => [])).filter((business) => business.isPublished);
      if ((live.get(section.slug) ?? 0) > 0) entries.push({ url: `https://${PLATFORM_HOST}/${section.slug}`, lastModified: newest(businesses.map((b) => b.updatedAt)) });
      for (const sub of section.subcategories) {
        if ((live.get(sub.slug) ?? 0) === 0) continue;
        // The same list the subsection's page shows (organization_categories
        // as well as a business's own subsection).
        const inSub = (await listSectionBusinesses(section.slug, sub.slug).catch(() => [])).filter((b) => b.isPublished);
        entries.push({ url: `https://${PLATFORM_HOST}/${section.slug}/${sub.slug}`, lastModified: newest(inSub.map((b) => b.updatedAt)) });
      }
      for (const business of businesses) {
        if (seen.has(business.slug)) continue;
        seen.add(business.slug);
        entries.push({ url: `https://${PLATFORM_HOST}${directoryHref(business.slug, business.primaryCategory)}`, lastModified: newest([business.updatedAt]) });
      }
    }
    // Futprep's programme pages (published offerings only).
    const futprep = await getOrganizationListingBySlug("futprep").catch(() => null);
    for (const offering of futprep?.offerings ?? []) {
      if (offering.slug) entries.push({ url: `https://${PLATFORM_HOST}/sports-fitness/futprep-athletics/${offering.slug}` });
    }
  } catch {
    // No database (or a hiccup): the fixed pages plus the two known live
    // businesses are still better than an empty sitemap.
    entries.push(
      { url: `https://${PLATFORM_HOST}/sports-fitness` },
      { url: `https://${PLATFORM_HOST}/sports-fitness/futprep-athletics` },
      { url: `https://${PLATFORM_HOST}/weddings` },
      { url: `https://${PLATFORM_HOST}/weddings/bahamas-weddings-by-the-sea` },
    );
  }

  return entries;
}
