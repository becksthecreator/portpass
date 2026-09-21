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
  isFeatured: boolean;
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
    isFeatured: Boolean(row.is_featured),
  };
}

export async function getPublicWeddingPackages(): Promise<PublicWeddingPackage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_packages")
    .select("id,slug,name,tagline,description,includes,price_from_cents,price_note,currency,is_featured")
    .eq("visibility", "live")
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load wedding packages");
  return (data ?? []).map(toPublicPackage);
}

export async function getWeddingPackageBySlug(slug: string): Promise<PublicWeddingPackage | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_packages")
    .select("id,slug,name,tagline,description,includes,price_from_cents,price_note,currency,is_featured")
    .eq("slug", slug)
    .eq("visibility", "live")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load wedding package");
  return data ? toPublicPackage(data) : null;
}

export type AdminWeddingPackage = PublicWeddingPackage & { visibility: "draft" | "unlisted" | "live"; sortOrder: number };

function toAdminPackage(row: Record<string, unknown>): AdminWeddingPackage {
  return { ...toPublicPackage(row), visibility: row.visibility as AdminWeddingPackage["visibility"], sortOrder: Number(row.sort_order) };
}

export async function listAllWeddingPackages(): Promise<AdminWeddingPackage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_packages")
    .select("id,slug,name,tagline,description,includes,price_from_cents,price_note,currency,visibility,is_featured,sort_order")
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load wedding packages");
  return (data ?? []).map(toAdminPackage);
}

export type WeddingPackageInput = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  includes: string[];
  priceFromCents: number | null;
  priceNote: string | null;
  visibility: "draft" | "unlisted" | "live";
  isFeatured: boolean;
  sortOrder: number;
};

const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;

export async function upsertWeddingPackage(id: number | null, input: WeddingPackageInput, currency = "BSD"): Promise<void> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  if (!SLUG_PATTERN.test(slug)) throw new Error("INVALID_SLUG");
  if (!name) throw new Error("NAME_REQUIRED");
  if (input.priceFromCents !== null && (!Number.isInteger(input.priceFromCents) || input.priceFromCents < 0)) throw new Error("INVALID_PRICE");

  const supabase = getSupabaseAdmin();
  const record = {
    slug,
    name,
    tagline: input.tagline?.trim() || null,
    description: input.description?.trim() || null,
    includes: input.includes.map((i) => i.trim()).filter(Boolean),
    price_from_cents: input.priceFromCents,
    price_note: input.priceNote?.trim() || null,
    currency,
    visibility: input.visibility,
    is_featured: input.isFeatured,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };

  // Only one package can be "Most chosen" at a time -- a partial unique
  // index on is_featured enforces this at the DB level, so the previous
  // holder has to be cleared first or this insert/update would 23505.
  if (input.isFeatured) {
    const { error: clearError } = await supabase.from("wedding_packages").update({ is_featured: false }).eq("is_featured", true);
    throwIfSupabaseError(clearError, "Could not update the featured package");
  }

  if (id === null) {
    const { error } = await supabase.from("wedding_packages").insert(record);
    throwIfSupabaseError(error, "Could not create the package");
    return;
  }
  const { error } = await supabase.from("wedding_packages").update(record).eq("id", id);
  throwIfSupabaseError(error, "Could not update the package");
}
