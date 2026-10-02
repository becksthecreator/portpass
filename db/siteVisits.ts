import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Visits to businesses' public pages (brief 11, 8), from PortPass's own
// first-party counts (page_events: no names, no internet addresses). For
// the Admin Overview: how many page views this week, and which pages.

export type SiteVisits = { views: number; topPages: Array<{ path: string; views: number }> };

export async function getSiteVisits(sinceIso: string): Promise<SiteVisits> {
  const counts = new Map<string, number>();
  let views = 0;
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await getSupabaseAdmin().from("page_events").select("path").eq("event", "view").gte("created_at", sinceIso).order("id", { ascending: true }).range(from, from + 999);
    throwIfSupabaseError(error, "Could not count page views");
    for (const row of data ?? []) {
      views += 1;
      const path = String(row.path);
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    if ((data ?? []).length < 1000) break;
  }
  const topPages = [...counts.entries()].map(([path, count]) => ({ path, views: count })).sort((a, b) => b.views - a.views || a.path.localeCompare(b.path)).slice(0, 5);
  return { views, topPages };
}
