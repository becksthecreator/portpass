import { isMarketCategory, type MarketCategorySlug } from "@/lib/market/categories";
import { MARKET_HOME_COUNT, MARKET_PAGE_SIZE, pageRange } from "@/lib/market/browse";
import type { LicenceKind } from "@/lib/shop/rules";
import { getBusinessBySlug, type Business } from "./business";
import { getProduct, getShop, listDrops, type Drop, type Product, type Shop } from "./shop";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// PortPass Market, the public side (brief 25, part B). Everything listed
// comes through two views (202610200002_market_search.sql), which hold the
// one rule for what the Market may show: market_products (published
// products of verified sellers with an open shop, never the demo) and
// market_things_to_do (published offerings of published businesses, never
// the demo). Search is ilike over trigram indexes, with what the visitor
// typed already cleaned by lib/market/browse.ts (cleanQuery).

const db = () => getSupabaseAdmin();

export type MarketProduct = {
  id: number;
  organizationId: number;
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  photos: string[];
  marketCategory: MarketCategorySlug | null;
  usesMarks: boolean;
  licenceKind: LicenceKind | null;
  createdAt: string;
  sellerSlug: string;
  sellerName: string;
  sellerLogoUrl: string | null;
  sellerBrandColor: string | null;
};

const PRODUCT_COLUMNS = "id,organization_id,slug,title,description,price_cents,photos,market_category,uses_marks,licence_kind,created_at,seller_slug,seller_name,seller_logo_url,seller_brand_color";

function toMarketProduct(row: Record<string, unknown>): MarketProduct {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    slug: row.slug as string,
    title: row.title as string,
    description: (row.description as string | null) ?? "",
    priceCents: Number(row.price_cents),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    marketCategory: isMarketCategory(row.market_category) ? row.market_category : null,
    usesMarks: Boolean(row.uses_marks),
    licenceKind: (row.licence_kind as LicenceKind | null) ?? null,
    createdAt: row.created_at as string,
    sellerSlug: row.seller_slug as string,
    sellerName: row.seller_name as string,
    sellerLogoUrl: (row.seller_logo_url as string | null) ?? null,
    sellerBrandColor: (row.seller_brand_color as string | null) ?? null,
  };
}

export type Paged<T> = { items: T[]; total: number };

// Things to buy, newest first. q is already clean (cleanQuery): it matches
// the product's name or the seller's.
export async function listMarketProducts(options: { q?: string | null; category?: MarketCategorySlug | null; page?: number; pageSize?: number } = {}): Promise<Paged<MarketProduct>> {
  const [from, to] = pageRange(options.page ?? 1, options.pageSize ?? MARKET_PAGE_SIZE);
  let query = db().from("market_products").select(PRODUCT_COLUMNS, { count: "exact" });
  if (options.category) query = query.eq("market_category", options.category);
  if (options.q) query = query.or(`title.ilike.*${options.q}*,seller_name.ilike.*${options.q}*`);
  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  throwIfSupabaseError(error, "Could not load the Market");
  return { items: (data ?? []).map(toMarketProduct), total: count ?? 0 };
}

// The homepage's "From the Market" strip.
export async function listNewestMarketProducts(limit: number = MARKET_HOME_COUNT): Promise<MarketProduct[]> {
  return (await listMarketProducts({ page: 1, pageSize: limit })).items;
}

export type MarketProductPage = {
  product: Product;
  listed: MarketProduct;
  org: Business;
  shop: Shop;
  drops: Drop[];
};

// One product page: listed on the Market (the view says so), with its
// sizes and stock, the seller's shop (pickup, delivery, cash) and drops.
export async function getMarketProduct(sellerSlug: string, productSlug: string): Promise<MarketProductPage | null> {
  const { data, error } = await db().from("market_products").select(PRODUCT_COLUMNS).eq("seller_slug", sellerSlug).eq("slug", productSlug).maybeSingle();
  throwIfSupabaseError(error, "Could not load the product");
  if (!data) return null;
  const listed = toMarketProduct(data);
  const [product, org, shop, drops] = await Promise.all([getProduct(listed.organizationId, listed.id), getBusinessBySlug(sellerSlug), getShop(listed.organizationId), listDrops(listed.organizationId, { visibleOnly: true })]);
  if (!product || !product.isPublished || !org || !shop) return null;
  return { product, listed, org, shop, drops };
}

// Every product page, for the sitemap (in pages of 1,000: PostgREST's cap).
export async function listMarketProductPaths(): Promise<{ sellerSlug: string; slug: string; createdAt: string; marketCategory: MarketCategorySlug | null }[]> {
  const out: { sellerSlug: string; slug: string; createdAt: string; marketCategory: MarketCategorySlug | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("market_products").select("id,seller_slug,slug,created_at,market_category").order("id", { ascending: true }).range(from, from + 999);
    throwIfSupabaseError(error, "Could not list Market products");
    for (const row of data ?? []) out.push({ sellerSlug: row.seller_slug as string, slug: row.slug as string, createdAt: row.created_at as string, marketCategory: isMarketCategory(row.market_category) ? row.market_category : null });
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

// ---- Things to do --------------------------------------------------------------

export type MarketThing = {
  id: number;
  organizationId: number;
  slug: string;
  type: string;
  name: string;
  summary: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  scheduleText: string | null;
  ageMin: number | null;
  ageMax: number | null;
  ageLabel: string | null;
  actionUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
  orgSlug: string;
  orgName: string;
  orgCategory: string | null;
  orgLogoUrl: string | null;
  orgBrandColor: string | null;
  madeInBahamas: boolean;
};

const THING_COLUMNS = "id,organization_id,slug,type,name,summary,price_cents,price_unit,schedule_text,age_min,age_max,age_label,action_url,image_url,created_at,org_slug,org_name,org_category,org_logo_url,org_brand_color,made_in_bahamas";

const numberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function toThing(row: Record<string, unknown>): MarketThing {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    slug: row.slug as string,
    type: row.type as string,
    name: row.name as string,
    summary: (row.summary as string | null) ?? null,
    priceCents: numberOrNull(row.price_cents),
    priceUnit: (row.price_unit as string | null) ?? null,
    scheduleText: (row.schedule_text as string | null) ?? null,
    ageMin: numberOrNull(row.age_min),
    ageMax: numberOrNull(row.age_max),
    ageLabel: (row.age_label as string | null) ?? null,
    actionUrl: (row.action_url as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    createdAt: row.created_at as string,
    orgSlug: row.org_slug as string,
    orgName: row.org_name as string,
    orgCategory: (row.org_category as string | null) ?? null,
    orgLogoUrl: (row.org_logo_url as string | null) ?? null,
    orgBrandColor: (row.org_brand_color as string | null) ?? null,
    madeInBahamas: Boolean(row.made_in_bahamas),
  };
}

// Things to do: what businesses already publish, newest first. q matches
// the offering's name or the business's; section is a top-level section
// slug (the business's own); madeOnly keeps verified sellers' businesses.
export async function listMarketThingsToDo(options: { q?: string | null; section?: string | null; madeOnly?: boolean; page?: number; pageSize?: number } = {}): Promise<Paged<MarketThing>> {
  const [from, to] = pageRange(options.page ?? 1, options.pageSize ?? MARKET_PAGE_SIZE);
  let query = db().from("market_things_to_do").select(THING_COLUMNS, { count: "exact" });
  if (options.section) query = query.eq("org_category", options.section);
  if (options.madeOnly) query = query.eq("made_in_bahamas", true);
  if (options.q) query = query.or(`name.ilike.*${options.q}*,org_name.ilike.*${options.q}*`);
  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  throwIfSupabaseError(error, "Could not load things to do");
  return { items: (data ?? []).map(toThing), total: count ?? 0 };
}
