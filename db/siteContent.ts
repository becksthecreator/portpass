import { unstable_cache } from "next/cache";
import { cleanSpotlight, EMPTY_ANNOUNCEMENT, readAnnouncement, type Announcement } from "@/lib/siteContent";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError, withOneRetry } from "./supabase";

// Admin -> Content (brief 08, 1.9). Two rows in site_content: the
// announcement bar and the order of the homepage's "Open now" cards.
// Public pages read through the cache below; a save clears it (the route
// calls revalidateTag and bumps the public pages), so a change is live on
// the next request with no deploy.

export const SITE_CONTENT_TAG = "site-content";

export type SiteContent = { announcement: Announcement; spotlight: string[] };

const EMPTY: SiteContent = { announcement: EMPTY_ANNOUNCEMENT, spotlight: [] };

async function fetchSiteContent(): Promise<SiteContent> {
  const { data, error } = await getSupabaseAdmin().from("site_content").select("key,value").in("key", ["announcement", "home_spotlight"]);
  throwIfSupabaseError(error, "Could not load site content");
  const byKey = new Map((data ?? []).map((row) => [String(row.key), row.value as unknown]));
  const spotlight = byKey.get("home_spotlight") as { order?: unknown } | undefined;
  return { announcement: readAnnouncement(byKey.get("announcement")), spotlight: cleanSpotlight(spotlight?.order) };
}

// One retry, like the homepage's other reads: a clock-skew rejection must
// not be baked into a cached page as "no announcement".
const cachedSiteContent = unstable_cache(() => withOneRetry(fetchSiteContent), ["site-content"], { tags: [SITE_CONTENT_TAG] });

// The header and the homepage are decoration on top of this: a failed read
// shows no bar and the usual order, never an error page.
export async function getSiteContent(options: { fresh?: boolean } = {}): Promise<SiteContent> {
  try {
    return options.fresh ? await fetchSiteContent() : await cachedSiteContent();
  } catch (error) {
    if (options.fresh) throw error;
    console.error("site content read failed, using none", error instanceof Error ? error.message : "");
    return EMPTY;
  }
}

async function save(key: "announcement" | "home_spotlight", value: unknown, before: unknown, actorUserId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("site_content").upsert({ key, value, updated_by: actorUserId, updated_at: new Date().toISOString() }, { onConflict: "key" });
  throwIfSupabaseError(error, "Could not save site content");
  await logAudit({ actorUserId, action: `content.${key}.updated`, targetTable: "site_content", targetId: key, before, after: value });
}

export async function saveAnnouncement(announcement: Announcement, actorUserId: string): Promise<void> {
  const current = await fetchSiteContent();
  await save("announcement", announcement, current.announcement, actorUserId);
}

export async function saveSpotlight(order: string[], actorUserId: string): Promise<void> {
  const current = await fetchSiteContent();
  await save("home_spotlight", { order }, { order: current.spotlight }, actorUserId);
}
