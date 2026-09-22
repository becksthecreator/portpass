// Every organization currently in the directory predates a clean
// slug-matches-route convention (Futprep's route is
// /sports-fitness/futprep-athletics, not /sports-fitness/futprep; BWS's
// summary page isn't at /weddings/bahamas-weddings either) -- this maps
// the known exceptions and falls back to the convention a future business
// can actually follow.
const ROUTE_OVERRIDES: Record<string, string> = {
  futprep: "/sports-fitness/futprep-athletics",
  "bahamas-weddings": "/weddings/bahamas-weddings-by-the-sea",
};

export function directoryHref(slug: string, category: string | null): string {
  return ROUTE_OVERRIDES[slug] ?? (category ? `/${category}/${slug}` : `/${slug}`);
}
