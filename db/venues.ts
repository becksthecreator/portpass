import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Defined once, deliberately, so no caller can accidentally select the
// staff-only columns (partner_contact, availability_notes, commission_*)
// for a public surface.
const PUBLIC_VENUE_COLUMNS =
  "id, slug, name, area, short_description, hero_image_url, capacity_min, capacity_max, features, wedding_eligible";

export type PublicVenueSummary = {
  id: number;
  slug: string;
  name: string;
  area: string | null;
  shortDescription: string | null;
  heroImageUrl: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  features: string[];
  weddingEligible: boolean;
};

type PublicVenueRow = {
  id: number;
  slug: string;
  name: string;
  area: string | null;
  short_description: string | null;
  hero_image_url: string | null;
  capacity_min: number | null;
  capacity_max: number | null;
  features: unknown;
  wedding_eligible: boolean;
};

function toPublicVenueSummary(row: PublicVenueRow): PublicVenueSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    area: row.area,
    shortDescription: row.short_description,
    heroImageUrl: row.hero_image_url,
    capacityMin: row.capacity_min,
    capacityMax: row.capacity_max,
    features: Array.isArray(row.features) ? row.features.filter((v): v is string => typeof v === "string") : [],
    weddingEligible: row.wedding_eligible,
  };
}

export async function getPublicWeddingVenues(): Promise<PublicVenueSummary[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("venues")
    .select(PUBLIC_VENUE_COLUMNS)
    .eq("visibility", "live")
    .eq("wedding_eligible", true)
    .eq("active", true)
    .order("name", { ascending: true });
  throwIfSupabaseError(error, "Could not load wedding venues");
  return ((data ?? []) as PublicVenueRow[]).map(toPublicVenueSummary);
}
