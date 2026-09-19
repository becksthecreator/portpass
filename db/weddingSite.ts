import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type WeddingSiteSettings = {
  reviewCount: number;
  reviewRecommendPct: number;
  yearsExperience: number;
  awardYears: number[];
  reviewsWidgetHtml: string | null;
};

const DEFAULT_SETTINGS: WeddingSiteSettings = {
  reviewCount: 100,
  reviewRecommendPct: 100,
  yearsExperience: 26,
  awardYears: [2026, 2023, 2022, 2021, 2020, 2019],
  reviewsWidgetHtml: null,
};

export async function getWeddingSiteSettings(): Promise<WeddingSiteSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_site_settings")
    .select("review_count,review_recommend_pct,years_experience,award_years,reviews_widget_html")
    .eq("id", 1)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load wedding site settings");
  if (!data) return DEFAULT_SETTINGS;
  return {
    reviewCount: Number(data.review_count),
    reviewRecommendPct: Number(data.review_recommend_pct),
    yearsExperience: Number(data.years_experience),
    awardYears: Array.isArray(data.award_years) ? data.award_years.filter((v): v is number => typeof v === "number") : [],
    reviewsWidgetHtml: data.reviews_widget_html,
  };
}

export type WeddingSiteSettingsInput = {
  reviewCount: number;
  reviewRecommendPct: number;
  yearsExperience: number;
  awardYears: number[];
  reviewsWidgetHtml: string | null;
};

export async function updateWeddingSiteSettings(input: WeddingSiteSettingsInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("wedding_site_settings")
    .update({
      review_count: input.reviewCount,
      review_recommend_pct: input.reviewRecommendPct,
      years_experience: input.yearsExperience,
      award_years: input.awardYears,
      reviews_widget_html: input.reviewsWidgetHtml?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  throwIfSupabaseError(error, "Could not update wedding site settings");
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
    return;
  }
  const { error } = await supabase.from("wedding_gallery_images").update(record).eq("id", id);
  throwIfSupabaseError(error, "Could not update the photo");
}

export async function deleteWeddingGalleryImage(id: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wedding_gallery_images").delete().eq("id", id);
  throwIfSupabaseError(error, "Could not remove the photo");
}
