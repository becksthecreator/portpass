import { headers } from "next/headers";
import type { MetadataRoute } from "next";

const PLATFORM_HOST = "portpassbahamas.com";

// A business's own domain gets its own robots.txt pointing at its own
// sitemap -- see app/sitemap.ts, which reads the same Host header.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host")?.replace(/^www\./, "").toLowerCase();

  if (host && host !== PLATFORM_HOST && !host.endsWith(".vercel.app")) {
    return { rules: { userAgent: "*", allow: "/" }, sitemap: `https://${host}/sitemap.xml` };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/organizations", "/api"] },
    sitemap: `https://${PLATFORM_HOST}/sitemap.xml`,
  };
}
