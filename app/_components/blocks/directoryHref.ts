import { FUTPREP_SITE } from "@/lib/futprepOffSite";

// Every organization currently in the directory predates a clean
// slug-matches-route convention (BWS's summary page isn't at
// /weddings/bahamas-weddings) -- this maps the known exceptions and falls
// back to the convention a future business can actually follow.
//
// Futprep is off PortPass's public pages (19 Nov 2026, lib/futprepOffSite.ts):
// its card links straight to Futprep's own site. An outside address is a
// plain link, so the browser never prefetches /sports-fitness/futprep-athletics
// (which redirects there) and logs a blocked cross-site fetch on every page
// that shows the card.
const ROUTE_OVERRIDES: Record<string, string> = {
  futprep: FUTPREP_SITE,
  "bahamas-weddings": "/weddings/bahamas-weddings-by-the-sea",
};

export function directoryHref(slug: string, category: string | null): string {
  return ROUTE_OVERRIDES[slug] ?? (category ? `/${category}/${slug}` : `/${slug}`);
}
