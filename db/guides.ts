import { unstable_cache } from "next/cache";
import { publishProblem, type GuideInput, type GuideStatus } from "@/lib/guides";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Guides (brief 11, 3). The public pages see published guides only, and in
// each only the linked businesses that are live today. Admin -> Guides
// (platform staff) writes and publishes them; every change is logged.

export const GUIDES_TAG = "guides";

export type Guide = { id: number; slug: string; title: string; description: string; body: string; status: GuideStatus; publishedAt: string | null; updatedAt: string };
export type GuideListing = { organizationId: number; note: string | null; sortOrder: number };
export type GuideBusiness = { slug: string; name: string; primaryCategory: string | null; oneLiner: string | null; logoUrl: string | null; brandColor: string | null; note: string | null };

type Row = Record<string, unknown>;
const COLUMNS = "id,slug,title,description,body,status,published_at,updated_at";

const toGuide = (row: Row): Guide => ({
  id: Number(row.id), slug: String(row.slug), title: String(row.title), description: String(row.description ?? ""), body: String(row.body ?? ""),
  status: row.status as GuideStatus, publishedAt: (row.published_at as string | null) ?? null, updatedAt: String(row.updated_at),
});

// ---- Public ---------------------------------------------------------------------------

async function fetchPublished(): Promise<Guide[]> {
  const { data, error } = await getSupabaseAdmin().from("guides").select(COLUMNS).eq("status", "published").order("published_at", { ascending: false }).limit(200);
  throwIfSupabaseError(error, "Could not load guides");
  return (data ?? []).map((row) => toGuide(row as Row));
}

const cachedPublished = unstable_cache(fetchPublished, ["guides-published"], { tags: [GUIDES_TAG], revalidate: 300 });

// Decoration where it appears (a business page's "In our guides", the
// sitemap): a failed read shows none, never an error page.
export async function listPublishedGuides(options: { fresh?: boolean } = {}): Promise<Guide[]> {
  try {
    return options.fresh ? await fetchPublished() : await cachedPublished();
  } catch (error) {
    if (options.fresh) throw error;
    console.error("guides read failed, showing none", error instanceof Error ? error.message : "");
    return [];
  }
}

export async function getPublishedGuide(slug: string): Promise<Guide | null> {
  return (await listPublishedGuides()).find((guide) => guide.slug === slug) ?? null;
}

// The businesses a guide links to that are live today, in its order.
export async function guideBusinesses(guideId: number): Promise<GuideBusiness[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("guide_listings")
    .select("note,sort_order,organizations!inner(slug,name,primary_category,one_liner,logo_url,brand_color,status,is_published)")
    .eq("guide_id", guideId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load the guide's businesses");
  const out: GuideBusiness[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { slug: string | null; name: string; primary_category: string | null; one_liner: string | null; logo_url: string | null; brand_color: string | null; status: string; is_published: boolean } | null;
    if (!org?.slug || !org.is_published || org.status === "suspended") continue;
    out.push({ slug: org.slug, name: org.name, primaryCategory: org.primary_category, oneLiner: org.one_liner, logoUrl: org.logo_url, brandColor: org.brand_color, note: (row.note as string | null) ?? null });
  }
  return out;
}

// The published guides that link to a business: its page links back.
export async function guidesMentioning(organizationSlug: string, options: { fresh?: boolean } = {}): Promise<Array<{ slug: string; title: string }>> {
  try {
    const published = await listPublishedGuides(options);
    if (!published.length) return [];
    const { data, error } = await getSupabaseAdmin().from("guide_listings").select("guide_id,organizations!inner(slug)").eq("organizations.slug", organizationSlug).in("guide_id", published.map((guide) => guide.id));
    throwIfSupabaseError(error, "Could not load guides for the business");
    const ids = new Set((data ?? []).map((row) => Number(row.guide_id)));
    return published.filter((guide) => ids.has(guide.id)).map((guide) => ({ slug: guide.slug, title: guide.title }));
  } catch (error) {
    console.error("guides for a business failed, showing none", error instanceof Error ? error.message : "");
    return [];
  }
}

// ---- Admin -> Guides ------------------------------------------------------------------

export async function listAllGuides(): Promise<Guide[]> {
  const { data, error } = await getSupabaseAdmin().from("guides").select(COLUMNS).order("status", { ascending: true }).order("updated_at", { ascending: false }).limit(500);
  throwIfSupabaseError(error, "Could not load guides");
  return (data ?? []).map((row) => toGuide(row as Row));
}

export async function getGuide(id: number): Promise<(Guide & { listings: GuideListing[] }) | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("guides").select(COLUMNS).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the guide");
  if (!data) return null;
  const { data: listings, error: listingError } = await db.from("guide_listings").select("organization_id,note,sort_order").eq("guide_id", id).order("sort_order", { ascending: true });
  throwIfSupabaseError(listingError, "Could not load the guide's businesses");
  return { ...toGuide(data as Row), listings: (listings ?? []).map((row) => ({ organizationId: Number(row.organization_id), note: (row.note as string | null) ?? null, sortOrder: Number(row.sort_order) })) };
}

// Saves the guide and the businesses it links to. A published guide stays
// published, but only if it is still fit to publish.
export async function saveGuide(id: number | null, input: GuideInput, listings: GuideListing[], actorUserId: string): Promise<Guide> {
  const db = getSupabaseAdmin();
  const before = id ? await getGuide(id) : null;
  if (id && !before) throw new Error("NOT_FOUND");
  if (before?.status === "published") {
    const problem = publishProblem(input, listings.length);
    if (problem) throw Object.assign(new Error("NOT_PUBLISHABLE"), { detail: problem });
  }
  const row = { slug: input.slug, title: input.title, description: input.description, body: input.body, updated_at: new Date().toISOString(), updated_by: actorUserId };
  const { data, error } = id ? await db.from("guides").update(row).eq("id", id).select(COLUMNS).single() : await db.from("guides").insert(row).select(COLUMNS).single();
  if (error && (error as { code?: string }).code === "23505") throw new Error("SLUG_TAKEN");
  throwIfSupabaseError(error, "Could not save the guide");
  const guide = toGuide(data as Row);
  const { error: clearError } = await db.from("guide_listings").delete().eq("guide_id", guide.id);
  throwIfSupabaseError(clearError, "Could not save the guide's businesses");
  if (listings.length) {
    const { error: listingError } = await db.from("guide_listings").insert(listings.map((listing, index) => ({ guide_id: guide.id, organization_id: listing.organizationId, note: listing.note, sort_order: index })));
    if (listingError && (listingError as { code?: string }).code === "23503") throw new Error("BAD_BUSINESS");
    throwIfSupabaseError(listingError, "Could not save the guide's businesses");
  }
  await logAudit({ actorUserId, action: before ? "guide.updated" : "guide.created", targetTable: "guides", targetId: guide.id, before: before ? { slug: before.slug, title: before.title, listings: before.listings.length } : null, after: { slug: guide.slug, title: guide.title, listings: listings.length } });
  return guide;
}

export async function setGuideStatus(id: number, status: GuideStatus, actorUserId: string): Promise<Guide> {
  const guide = await getGuide(id);
  if (!guide) throw new Error("NOT_FOUND");
  if (status === "published") {
    // Only businesses that are live count: a guide must send readers somewhere they can book.
    const problem = publishProblem(guide, (await guideBusinesses(id)).length);
    if (problem) throw Object.assign(new Error("NOT_PUBLISHABLE"), { detail: problem });
  }
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin().from("guides").update({ status, published_at: status === "published" ? guide.publishedAt ?? now : guide.publishedAt, updated_at: now, updated_by: actorUserId }).eq("id", id).select(COLUMNS).single();
  throwIfSupabaseError(error, "Could not change the guide");
  await logAudit({ actorUserId, action: status === "published" ? "guide.published" : "guide.unpublished", targetTable: "guides", targetId: id, before: { status: guide.status }, after: { status } });
  return toGuide(data as Row);
}
