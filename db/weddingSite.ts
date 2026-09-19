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
