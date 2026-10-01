import { cleanUrl, normalizeInstagramHandle } from "./leads";

// Instagram Graph API "Business Discovery" (brief 14 §1): given a handle
// that A FOUNDER TYPED OR PASTED, fetch that professional account's public
// bio, website, follower count and last 12 captions. One handle, one call.
// There is no crawling from one account to the next, no browsing, and no
// unofficial API: Meta's terms forbid automated collection, and accounts
// that do it get limited or banned.
//
// It needs PortPass's own Instagram professional account linked to a
// Facebook Page, and a Meta app. Env var names (values are Antonio's to
// set): INSTAGRAM_BUSINESS_ACCOUNT_ID, INSTAGRAM_GRAPH_ACCESS_TOKEN.

const GRAPH_VERSION = "v23.0";

export type InstagramProfile = {
  handle: string;
  name: string | null;
  biography: string | null;
  websiteUrl: string | null;
  followers: number | null;
  mediaCount: number | null;
  captions: Array<{ caption: string; postedAt: string | null; permalink: string | null }>;
  profileUrl: string;
};

export function instagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID && process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN);
}

// The request for one handle. The handle is validated first, so nothing a
// founder pastes can change the shape of the query.
export function businessDiscoveryUrl(accountId: string, handle: string): string {
  const fields = `business_discovery.username(${handle}){username,name,biography,website,followers_count,media_count,media.limit(12){caption,timestamp,permalink}}`;
  return `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(accountId)}?fields=${encodeURIComponent(fields)}`;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export function mapBusinessDiscovery(raw: unknown, handle: string): InstagramProfile | null {
  const discovery = (raw as { business_discovery?: Record<string, unknown> } | null)?.business_discovery;
  if (!discovery || typeof discovery !== "object") return null;
  const media = (discovery.media as { data?: unknown[] } | undefined)?.data ?? [];
  const captions = media
    .map((item) => {
      const post = item as Record<string, unknown>;
      const caption = text(post.caption, 600);
      return caption ? { caption, postedAt: text(post.timestamp, 40), permalink: cleanUrl(text(post.permalink, 300)) } : null;
    })
    .filter((c): c is { caption: string; postedAt: string | null; permalink: string | null } => c !== null)
    .slice(0, 12);
  return {
    handle,
    name: text(discovery.name, 160),
    biography: text(discovery.biography, 600),
    websiteUrl: cleanUrl(text(discovery.website, 300)),
    followers: typeof discovery.followers_count === "number" ? discovery.followers_count : null,
    mediaCount: typeof discovery.media_count === "number" ? discovery.media_count : null,
    captions,
    profileUrl: `https://www.instagram.com/${handle}/`,
  };
}

export type InstagramLookup = { ok: true; profile: InstagramProfile } | { ok: false; reason: "not_configured" | "bad_handle" | "not_found" | "provider_error"; status?: number };

export async function lookupInstagram(typedHandle: string, fetcher: typeof fetch = fetch): Promise<InstagramLookup> {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN;
  if (!accountId || !token) return { ok: false, reason: "not_configured" };
  const handle = normalizeInstagramHandle(typedHandle);
  if (!handle) return { ok: false, reason: "bad_handle" };
  try {
    // The token travels in a header, never in the address, so it can't end
    // up in a log of requested URLs.
    const response = await fetcher(businessDiscoveryUrl(accountId, handle), { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 400 || response.status === 404) return { ok: false, reason: "not_found", status: response.status };
    if (!response.ok) {
      console.error("scout instagram lookup failed", response.status);
      return { ok: false, reason: "provider_error", status: response.status };
    }
    const profile = mapBusinessDiscovery(await response.json(), handle);
    return profile ? { ok: true, profile } : { ok: false, reason: "not_found" };
  } catch (error) {
    console.error("scout instagram lookup threw", error instanceof Error ? error.message : "");
    return { ok: false, reason: "provider_error" };
  }
}
