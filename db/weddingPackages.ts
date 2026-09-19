import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type PublicWeddingPackage = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  includes: string[];
  priceFromCents: number | null;
  priceNote: string | null;
  currency: string;
};

function toPublicPackage(row: Record<string, unknown>): PublicWeddingPackage {
  return {
    id: Number(row.id),
    slug: row.slug as string,
    name: row.name as string,
    tagline: row.tagline as string | null,
    description: row.description as string | null,
    includes: Array.isArray(row.includes) ? row.includes.filter((v): v is string => typeof v === "string") : [],
    priceFromCents: row.price_from_cents === null || row.price_from_cents === undefined ? null : Number(row.price_from_cents),
    priceNote: row.price_note as string | null,
    currency: (row.currency as string) ?? "BSD",
  };
}

export async function getPublicWeddingPackages(): Promise<PublicWeddingPackage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_packages")
    .select("id,slug,name,tagline,description,includes,price_from_cents,price_note,currency")
    .eq("visibility", "live")
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load wedding packages");
  return (data ?? []).map(toPublicPackage);
}

export async function getWeddingPackageBySlug(slug: string): Promise<PublicWeddingPackage | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_packages")
    .select("id,slug,name,tagline,description,includes,price_from_cents,price_note,currency")
    .eq("slug", slug)
    .eq("visibility", "live")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load wedding package");
  return data ? toPublicPackage(data) : null;
}
