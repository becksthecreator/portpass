import { headers } from "next/headers";
import type { MetadataRoute } from "next";

const PLATFORM_HOST = "portpassbahamas.com";

// A business's own domain gets its own robots.txt pointing at its own
// sitemap -- see app/sitemap.ts, which reads the same Host header.
// The wedding staff desk lives only on Bahamas Weddings By The Sea's own
// domain now (every /weddings path on portpassbahamas.com redirects there,
// next.config.ts), so its private paths are kept out on that domain, and
// portpassbahamas.com's robots.txt no longer names weddings.
const WEDDINGS_HOST = "bahamasweddingsbythesea.com";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host")?.replace(/^www\./, "").toLowerCase();

  if (host && host !== PLATFORM_HOST && !host.endsWith(".vercel.app")) {
    // PortPass's own admin and API answer on every business's domain too
    // (/admin redirects to sign-in there), so they're kept out everywhere.
    const disallow = ["/admin", "/api", ...(host === WEDDINGS_HOST ? ["/weddings/admin", "/weddings/staff"] : [])];
    return { rules: { userAgent: "*", allow: "/", disallow }, sitemap: `https://${host}/sitemap.xml` };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/demo/", "/organizations", "/api", "/claim", "/futprep/my", "/futprep/staff"] },
    sitemap: `https://${PLATFORM_HOST}/sitemap.xml`,
  };
}
