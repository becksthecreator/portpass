import { headers } from "next/headers";
import type { MetadataRoute } from "next";

const PLATFORM_HOST = "portpassbahamas.com";

// A business's own domain gets its own minimal sitemap (just its home
// page today -- there's nothing else on that domain yet to list). The
// platform's own sitemap covers the pages that exist on portpassbahamas.com.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host")?.replace(/^www\./, "").toLowerCase();
  const now = new Date();

  if (host && host !== PLATFORM_HOST && !host.endsWith(".vercel.app")) {
    return [{ url: `https://${host}/`, lastModified: now }];
  }

  return [
    { url: `https://${PLATFORM_HOST}/`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/sports-fitness`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/sports-fitness/futprep-athletics`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/weddings`, lastModified: now },
    { url: `https://${PLATFORM_HOST}/weddings/bahamas-weddings-by-the-sea`, lastModified: now },
  ];
}
