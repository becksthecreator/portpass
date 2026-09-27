import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { listSections } from "@/db/categories";
import { listSectionBusinesses } from "@/db/organizations";
import { directoryHref } from "@/app/_components/blocks/directoryHref";

const PLATFORM_HOST = "portpassbahamas.com";

// A business's own domain gets its own minimal sitemap (just its home
// page today -- there's nothing else on that domain yet to list). The
// platform's sitemap lists the fixed pages, every visible section, any
// subcategory that has reached its coming-soon threshold (below it the
// page is noindex anyway), and every live business page.
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
  ];

  try {
    const sections = await listSections();
    for (const section of sections) {
      entries.push({ url: `https://${PLATFORM_HOST}/${section.slug}`, lastModified: now });
      const businesses = await listSectionBusinesses(section.slug).catch(() => []);
      for (const sub of section.subcategories) {
        const live = businesses.filter((b) => b.isPublished && b.subcategory === sub.slug).length;
        if (live >= sub.comingSoonThreshold) entries.push({ url: `https://${PLATFORM_HOST}/${section.slug}/${sub.slug}`, lastModified: now });
      }
      for (const business of businesses) {
        if (business.isPublished) entries.push({ url: `https://${PLATFORM_HOST}${directoryHref(business.slug, business.primaryCategory)}`, lastModified: now });
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
