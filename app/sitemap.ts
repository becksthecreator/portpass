import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { listSections } from "@/db/categories";
import { listSectionBusinesses, liveCountsByCategory } from "@/db/organizations";
import { directoryHref } from "@/app/_components/blocks/directoryHref";

const PLATFORM_HOST = "portpassbahamas.com";

// A business's own domain gets its own minimal sitemap (just its home
// page today -- there's nothing else on that domain yet to list). The
// platform's sitemap lists the fixed pages, every section and subcategory
// with something to book, and every live business page -- all from the
// categories table and organization_categories, the same source the nav
// and the section pages read.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host")?.replace(/^www\./, "").toLowerCase();
  const now = new Date();

  if (host && host !== PLATFORM_HOST && !host.endsWith(".vercel.app")) {
    return [{ url: `https://${host}/`, lastModified: now }];
  }

  const entries: MetadataRoute.Sitemap = [
    { url: `https://${PLATFORM_HOST}/`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/business`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/apply`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/about`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/contact`, lastModified: now },
  ];

  try {
    const [sections, live] = await Promise.all([listSections(), liveCountsByCategory()]);
    // Indexable means "has something to book": a section or subcategory
    // with no live business is a coming-soon page (noindex, see
    // app/[category]) and stays out of the sitemap. The coming-soon
    // *threshold* only drives the on-page label, not indexing.
    const seen = new Set<string>();
    for (const section of sections) {
      if ((live.get(section.slug) ?? 0) > 0) entries.push({ url: `https://${PLATFORM_HOST}/${section.slug}`, lastModified: now });
      for (const sub of section.subcategories) {
        if ((live.get(sub.slug) ?? 0) > 0) entries.push({ url: `https://${PLATFORM_HOST}/${section.slug}/${sub.slug}`, lastModified: now });
      }
      // A business listed under two sections has one page (its primary
      // section's), so it is listed once.
      const businesses = await listSectionBusinesses(section.slug).catch(() => []);
      for (const business of businesses) {
        if (!business.isPublished || seen.has(business.slug)) continue;
        seen.add(business.slug);
        entries.push({ url: `https://${PLATFORM_HOST}${directoryHref(business.slug, business.primaryCategory)}`, lastModified: now });
      }
    }
  } catch {
    // No database (or a hiccup): the fixed pages plus the two known live
    // businesses are still better than an empty sitemap.
    entries.push(
      { url: `https://${PLATFORM_HOST}/sports-fitness`, lastModified: now },
      { url: `https://${PLATFORM_HOST}/sports-fitness/futprep-athletics`, lastModified: now },
      { url: `https://${PLATFORM_HOST}/weddings`, lastModified: now },
      { url: `https://${PLATFORM_HOST}/weddings/bahamas-weddings-by-the-sea`, lastModified: now },
    );
  }

  return entries;
}
