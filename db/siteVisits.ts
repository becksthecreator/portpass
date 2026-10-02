import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Visits to businesses' public pages (brief 11, 8), from PortPass's own
// first-party counts (page_events: no names, no internet addresses). For
// the Admin Overview: how many page views this week, and which pages.
// Counted in the database (site_visit_counts), so it is one query however
// busy the week was.

export type SiteVisits = { views: number; topPages: Array<{ path: string; views: number }> };

export async function getSiteVisits(sinceIso: string): Promise<SiteVisits> {
  const { data, error } = await getSupabaseAdmin().rpc("site_visit_counts", { since: sinceIso, top_n: 5 });
  throwIfSupabaseError(error, "Could not count page views");
  const result = (data ?? {}) as { views?: number; topPages?: Array<{ path: string; views: number }> };
  return {
    views: Number(result.views ?? 0),
    topPages: (result.topPages ?? []).map((page) => ({ path: String(page.path), views: Number(page.views) })),
  };
}
