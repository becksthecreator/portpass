import { bumpListings } from "@/lib/revalidate";
import { isWeddingWireMemberId, NO_WEDDINGWIRE } from "@/lib/weddingWire";
import { siteContentChanges, type SiteContent } from "@/lib/weddingSiteContent";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The trust numbers and the WeddingWire widgets. The widgets are a member
// ID and which ones to show, never HTML: lib/weddingWire.ts builds each one
// (supabase/migrations/202610190002).
export type WeddingSiteSettings = SiteContent;

// Exported so a caller that can't afford to have this fetch throw (e.g. a
// category page, where these numbers are decoration, not content) has a
// real, already-approved fallback to reach for instead of inventing one.
export const DEFAULT_SETTINGS: WeddingSiteSettings = {
  reviewCount: 100,
  reviewRecommendPct: 100,
  yearsExperience: 26,
  awardYears: [2026, 2023, 2022, 2021, 2020, 2019],
  weddingWire: NO_WEDDINGWIRE,
};

export async function getWeddingSiteSettings(): Promise<WeddingSiteSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_site_settings")
    .select("review_count,review_recommend_pct,years_experience,award_years,weddingwire_member_id,show_rating_badge,show_award_badge,show_reviews_widget")
    .eq("id", 1)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load wedding site settings");
  if (!data) return DEFAULT_SETTINGS;
  return {
    reviewCount: Number(data.review_count),
    reviewRecommendPct: Number(data.review_recommend_pct),
    yearsExperience: Number(data.years_experience),
    awardYears: Array.isArray(data.award_years) ? data.award_years.filter((v): v is number => typeof v === "number") : [],
    weddingWire: {
      memberId: isWeddingWireMemberId(data.weddingwire_member_id) ? data.weddingwire_member_id : null,
      ratingBadge: data.show_rating_badge === true,
      awardBadge: data.show_award_badge === true,
      reviews: data.show_reviews_widget === true,
    },
  };
}

export type WeddingSiteSettingsInput = WeddingSiteSettings;

async function weddingOrganizationId(): Promise<number | null> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id").eq("slug", "bahamas-weddings").maybeSingle();
  throwIfSupabaseError(error, "Could not find Bahamas Weddings By The Sea");
  return data ? Number(data.id) : null;
}

// Saves the content and records what changed, and which Desk account
// changed it (`actor`), in the audit log. The entry is written after the
// update, as for the other audited actions: if it can't be written the save
// is answered as failed, though the change itself stands. The member ID is
// checked here as well as in the route, and the database holds the same
// rule.
export async function updateWeddingSiteSettings(input: WeddingSiteSettingsInput, actor: string): Promise<void> {
  const { memberId, ratingBadge, awardBadge, reviews } = input.weddingWire;
  if (memberId !== null && !isWeddingWireMemberId(memberId)) throw new Error("INVALID_MEMBER_ID");
  if (memberId === null && (ratingBadge || awardBadge || reviews)) throw new Error("MEMBER_ID_REQUIRED");

  const before = await getWeddingSiteSettings();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("wedding_site_settings")
    .update({
      review_count: input.reviewCount,
      review_recommend_pct: input.reviewRecommendPct,
      years_experience: input.yearsExperience,
      award_years: input.awardYears,
      weddingwire_member_id: memberId,
      show_rating_badge: ratingBadge,
      show_award_badge: awardBadge,
      show_reviews_widget: reviews,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  throwIfSupabaseError(error, "Could not update wedding site settings");
  bumpListings();

  const changes = siteContentChanges(before, input);
  await logAudit({
    organizationId: await weddingOrganizationId(),
    action: "wedding_site.updated",
    targetTable: "wedding_site_settings",
    targetId: 1,
    before: changes.before,
    after: { ...changes.after, by: actor },
  });
}

export type WeddingGalleryImage = {
  id: number;
  imageUrl: string;
  caption: string | null;
  photographerName: string | null;
  photographerUrl: string | null;
  isHero: boolean;
};

export async function getPublicWeddingGallery(): Promise<WeddingGalleryImage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_gallery_images")
    .select("id,image_url,caption,photographer_name,photographer_url,is_hero")
    .eq("visibility", "live")
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load wedding gallery");
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    imageUrl: row.image_url as string,
    caption: row.caption as string | null,
    photographerName: row.photographer_name as string | null,
    photographerUrl: row.photographer_url as string | null,
    isHero: Boolean(row.is_hero),
  }));
}

export type AdminWeddingGalleryImage = WeddingGalleryImage & { visibility: "draft" | "live"; sortOrder: number };

export async function listAllWeddingGalleryImages(): Promise<AdminWeddingGalleryImage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_gallery_images")
    .select("id,image_url,caption,photographer_name,photographer_url,is_hero,visibility,sort_order")
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load the gallery");
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    imageUrl: row.image_url as string,
    caption: row.caption as string | null,
    photographerName: row.photographer_name as string | null,
    photographerUrl: row.photographer_url as string | null,
    isHero: Boolean(row.is_hero),
    visibility: row.visibility as "draft" | "live",
    sortOrder: Number(row.sort_order),
  }));
}

export type WeddingGalleryImageInput = {
  imageUrl: string;
  caption: string | null;
  photographerName: string | null;
  photographerUrl: string | null;
  isHero: boolean;
  visibility: "draft" | "live";
  sortOrder: number;
};

export async function upsertWeddingGalleryImage(id: number | null, input: WeddingGalleryImageInput): Promise<void> {
  const imageUrl = input.imageUrl.trim();
  if (!imageUrl) throw new Error("IMAGE_URL_REQUIRED");

  const supabase = getSupabaseAdmin();
  const record = {
    image_url: imageUrl,
    caption: input.caption?.trim() || null,
    photographer_name: input.photographerName?.trim() || null,
    photographer_url: input.photographerUrl?.trim() || null,
    is_hero: input.isHero,
    visibility: input.visibility,
    sort_order: input.sortOrder,
  };

  if (id === null) {
    const { error } = await supabase.from("wedding_gallery_images").insert(record);
    throwIfSupabaseError(error, "Could not add the photo");
    bumpListings();
    return;
  }
  const { error } = await supabase.from("wedding_gallery_images").update(record).eq("id", id);
  throwIfSupabaseError(error, "Could not update the photo");
  bumpListings();
}

export async function deleteWeddingGalleryImage(id: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wedding_gallery_images").delete().eq("id", id);
  throwIfSupabaseError(error, "Could not remove the photo");
  bumpListings();
}
