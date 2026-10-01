import { randomBytes } from "node:crypto";
import { bumpListings } from "@/lib/revalidate";
import {
  DEFAULT_HOLD_HOURS,
  holdUntil,
  isPastHold,
  makeReferenceCode,
  type DropStatus,
  type Fulfilment,
  type LicenceKind,
  type ListedReservation,
  type PaymentStatus,
  type ReservationItem,
  type ReservationStatus,
  type ShopPaymentMethod,
  type ShopSource,
  type StatsInput,
} from "@/lib/shop/rules";
import { slugify } from "@/lib/slug";
import { logAudit } from "./audit";
import { getBusiness, getBusinessBySlug, type Business } from "./business";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Drops (brief 15): shops, products, drops, reservations and the waitlist.
// Access control lives in the route handlers and pages (lib/auth/guards.ts);
// this module trusts its callers and enforces the data rules. Stock moves
// only inside the two database functions (shop_create_reservation,
// shop_release_reservation), so a size can never be sold twice.

// ---- shops -----------------------------------------------------------------

export type Shop = { organizationId: number; referencePrefix: string; returnsPolicy: string; holdHours: number; isPublished: boolean };

const SHOP_COLUMNS = "organization_id,reference_prefix,returns_policy,hold_hours,is_published";

function toShop(row: Record<string, unknown>): Shop {
  return {
    organizationId: Number(row.organization_id),
    referencePrefix: row.reference_prefix as string,
    returnsPolicy: (row.returns_policy as string) ?? "",
    holdHours: Number(row.hold_hours ?? DEFAULT_HOLD_HOURS),
    isPublished: Boolean(row.is_published),
  };
}

export async function getShop(orgId: number): Promise<Shop | null> {
  const { data, error } = await getSupabaseAdmin().from("shops").select(SHOP_COLUMNS).eq("organization_id", orgId).maybeSingle();
  throwIfSupabaseError(error, "Could not load shop");
  return data ? toShop(data) : null;
}

export type ShopInput = { referencePrefix: string; returnsPolicy: string; holdHours: number; isPublished: boolean };

// Throws PREFIX_TAKEN or NEEDS_RETURNS_POLICY for the form to explain.
export async function saveShop(orgId: number, input: ShopInput, actorUserId: string): Promise<Shop> {
  if (input.isPublished && !input.returnsPolicy.trim()) throw new Error("NEEDS_RETURNS_POLICY");
  const { data, error } = await getSupabaseAdmin()
    .from("shops")
    .upsert(
      {
        organization_id: orgId,
        reference_prefix: input.referencePrefix,
        returns_policy: input.returnsPolicy,
        hold_hours: input.holdHours,
        is_published: input.isPublished,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    )
    .select(SHOP_COLUMNS)
    .single();
  if (error?.code === "23505") throw new Error("PREFIX_TAKEN");
  throwIfSupabaseError(error, "Could not save shop");
  await logAudit({ actorUserId, organizationId: orgId, action: "shop.saved", targetTable: "shops", targetId: orgId, after: { reference_prefix: input.referencePrefix, hold_hours: input.holdHours, is_published: input.isPublished } });
  bumpListings();
  return toShop(data!);
}

// ---- products --------------------------------------------------------------

export type ProductVariant = { id: number; productId: number; label: string; stock: number | null; sortOrder: number };

export type Product = {
  id: number;
  organizationId: number;
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  photos: string[];
  isPublished: boolean;
  usesMarks: boolean;
  licenceKind: LicenceKind | null;
  licenceNote: string | null;
  licenceApprovedAt: string | null;
  sortOrder: number;
  variants: ProductVariant[];
};

const PRODUCT_COLUMNS =
  "id,organization_id,slug,title,description,price_cents,photos,is_published,uses_marks,licence_kind,licence_note,licence_approved_at,sort_order,product_variants(id,product_id,label,stock,sort_order)";

function toVariant(row: Record<string, unknown>): ProductVariant {
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    label: row.label as string,
    stock: row.stock === null || row.stock === undefined ? null : Number(row.stock),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function toProduct(row: Record<string, unknown>): Product {
  const variants = (Array.isArray(row.product_variants) ? (row.product_variants as Record<string, unknown>[]) : []).map(toVariant);
  variants.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    slug: row.slug as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    priceCents: Number(row.price_cents),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    isPublished: Boolean(row.is_published),
    usesMarks: Boolean(row.uses_marks),
    licenceKind: (row.licence_kind as LicenceKind | null) ?? null,
    licenceNote: (row.licence_note as string | null) ?? null,
    licenceApprovedAt: (row.licence_approved_at as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    variants,
  };
}

export async function listProducts(orgId: number, options: { publishedOnly?: boolean } = {}): Promise<Product[]> {
  let query = getSupabaseAdmin().from("products").select(PRODUCT_COLUMNS).eq("organization_id", orgId);
  if (options.publishedOnly) query = query.eq("is_published", true);
  const { data, error } = await query.order("sort_order", { ascending: true }).order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load products");
  return (data ?? []).map(toProduct);
}

export async function getProduct(orgId: number, productId: number): Promise<Product | null> {
  const { data, error } = await getSupabaseAdmin().from("products").select(PRODUCT_COLUMNS).eq("organization_id", orgId).eq("id", productId).maybeSingle();
  throwIfSupabaseError(error, "Could not load product");
  return data ? toProduct(data) : null;
}

export type VariantInput = { id: number | null; label: string; stock: number | null };
export type ProductInput = {
  title: string;
  description: string;
  priceCents: number;
  photos: string[];
  isPublished: boolean;
  usesMarks: boolean;
  licenceKind: LicenceKind | null;
  licenceNote: string | null;
  variants: VariantInput[];
};

// Why a product the owner asked to publish was saved unpublished.
export type PublishBlock = "licence" | "description" | "variants" | null;

async function activeReservationsWith(field: "productId" | "variantId", id: number): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    // A JSON string, not an array: supabase-js would send an array as a
    // Postgres array literal, and items is jsonb.
    .filter("items", "cs", JSON.stringify([{ [field]: id }]));
  throwIfSupabaseError(error, "Could not check reservations");
  return count ?? 0;
}

// Saves everything but publishing first; then publishes if asked and the
// rules allow. A product that uses another organisation's marks stays
// unpublished until a platform owner approves its licence (the database
// refuses it too, and withdraws an approval when the licence text changes).
export async function saveProduct(orgId: number, productId: number | null, input: ProductInput, actorUserId: string): Promise<{ product: Product; blocked: PublishBlock }> {
  const supabase = getSupabaseAdmin();
  const record: Record<string, unknown> = {
    organization_id: orgId,
    title: input.title.trim(),
    description: input.description.trim(),
    price_cents: input.priceCents,
    photos: input.photos,
    uses_marks: input.usesMarks,
    licence_kind: input.usesMarks ? input.licenceKind : null,
    licence_note: input.usesMarks ? input.licenceNote?.trim() || null : null,
    updated_at: new Date().toISOString(),
  };
  let id = productId;
  if (id === null) {
    const existing = await listProducts(orgId);
    const base = slugify(input.title) === "program" ? "item" : slugify(input.title);
    let slug = base;
    let n = 2;
    while (existing.some((p) => p.slug === slug)) slug = `${base}-${n++}`;
    const { data, error } = await supabase.from("products").insert({ ...record, slug, sort_order: existing.length, is_published: false }).select("id").single();
    throwIfSupabaseError(error, "Could not create product");
    id = Number(data!.id);
  } else {
    const { data, error } = await supabase.from("products").update(record).eq("id", id).eq("organization_id", orgId).select("id").maybeSingle();
    throwIfSupabaseError(error, "Could not save product");
    if (!data) throw new Error("NOT_FOUND");
  }

  await saveVariants(id, input.variants);

  let blocked: PublishBlock = null;
  const current = await getProduct(orgId, id);
  if (!current) throw new Error("NOT_FOUND");
  if (input.isPublished !== current.isPublished) {
    if (input.isPublished) {
      if (!current.description) blocked = "description";
      else if (!current.variants.length) blocked = "variants";
      else if (current.usesMarks && !current.licenceApprovedAt) blocked = "licence";
    }
    if (!blocked) {
      const { error } = await supabase.from("products").update({ is_published: input.isPublished }).eq("id", id).eq("organization_id", orgId);
      if (error?.code === "23514") blocked = "licence";
      else throwIfSupabaseError(error, "Could not publish product");
    }
  }
  if (input.isPublished && !blocked) await takeBusinessLiveOnFirstProduct(orgId, actorUserId);

  const product = (await getProduct(orgId, id))!;
  await logAudit({
    actorUserId,
    organizationId: orgId,
    action: productId === null ? "product.created" : "product.updated",
    targetTable: "products",
    targetId: id,
    after: { title: product.title, price_cents: product.priceCents, is_published: product.isPublished, uses_marks: product.usesMarks, licence_kind: product.licenceKind, variants: product.variants.map((v) => ({ label: v.label, stock: v.stock })) },
  });
  bumpListings();
  return { product, blocked };
}

// Replaces the product's variants with the list: rows with an id are
// updated, new ones inserted, missing ones deleted -- unless an active
// reservation still holds that size (VARIANT_IN_USE:<label>).
async function saveVariants(productId: number, variants: VariantInput[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase.from("product_variants").select("id,label").eq("product_id", productId);
  throwIfSupabaseError(error, "Could not load sizes");
  const keep = new Set(variants.filter((v) => v.id !== null).map((v) => v.id as number));
  for (const row of rows ?? []) {
    const id = Number(row.id);
    if (keep.has(id)) continue;
    if ((await activeReservationsWith("variantId", id)) > 0) throw new Error(`VARIANT_IN_USE:${row.label}`);
    const { error: deleteError } = await supabase.from("product_variants").delete().eq("id", id).eq("product_id", productId);
    throwIfSupabaseError(deleteError, "Could not remove a size");
  }
  // Labels are unique per product: park renamed rows first so a swap
  // (S <-> M) can't trip the constraint halfway.
  const existingIds = new Set((rows ?? []).map((row) => Number(row.id)));
  const updates = variants.filter((v) => v.id !== null && existingIds.has(v.id));
  for (const v of updates) {
    const { error: parkError } = await supabase.from("product_variants").update({ label: `~${v.id}` }).eq("id", v.id!).eq("product_id", productId);
    throwIfSupabaseError(parkError, "Could not save sizes");
  }
  for (const [index, v] of variants.entries()) {
    if (v.id !== null && existingIds.has(v.id)) {
      const { error: updateError } = await supabase.from("product_variants").update({ label: v.label, stock: v.stock, sort_order: index }).eq("id", v.id).eq("product_id", productId);
      throwIfSupabaseError(updateError, "Could not save sizes");
    } else {
      const { error: insertError } = await supabase.from("product_variants").insert({ product_id: productId, label: v.label, stock: v.stock, sort_order: index });
      if (insertError?.code === "23505") throw new Error(`DUPLICATE_LABEL:${v.label}`);
      throwIfSupabaseError(insertError, "Could not save sizes");
    }
  }
}

// The same rule as a first priced offering (db/business.ts): an approved
// business that has something to sell goes live.
async function takeBusinessLiveOnFirstProduct(orgId: number, actorUserId: string): Promise<void> {
  const business = await getBusiness(orgId);
  if (!business || business.status !== "approved" || business.isPublished) return;
  const { error } = await getSupabaseAdmin().from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", orgId);
  if (!error) await logAudit({ actorUserId, organizationId: orgId, action: "business.went_live", targetTable: "organizations", targetId: orgId });
}

export async function deleteProduct(orgId: number, productId: number, actorUserId: string): Promise<void> {
  if ((await activeReservationsWith("productId", productId)) > 0) throw new Error("PRODUCT_IN_USE");
  const { error } = await getSupabaseAdmin().from("products").delete().eq("id", productId).eq("organization_id", orgId);
  throwIfSupabaseError(error, "Could not remove product");
  await logAudit({ actorUserId, organizationId: orgId, action: "product.deleted", targetTable: "products", targetId: productId });
  bumpListings();
}

// ---- drops -----------------------------------------------------------------

export type Drop = {
  id: number;
  organizationId: number;
  slug: string;
  title: string;
  description: string;
  heroImageUrl: string | null;
  opensAt: string;
  closesAt: string | null;
  followersFirstUntil: string | null;
  followersToken: string;
  readyOn: string | null;
  pickupNote: string;
  deliveryNote: string;
  allowPickup: boolean;
  allowDelivery: boolean;
  deliveryZones: string[];
  status: DropStatus;
  productIds: number[];
};

const DROP_COLUMNS =
  "id,organization_id,slug,title,description,hero_image_url,opens_at,closes_at,followers_first_until,followers_token,ready_on,pickup_note,delivery_note,allow_pickup,allow_delivery,delivery_zones,status,drop_items(product_id,sort_order)";

function toDrop(row: Record<string, unknown>): Drop {
  const items = (Array.isArray(row.drop_items) ? (row.drop_items as Record<string, unknown>[]) : [])
    .map((i) => ({ productId: Number(i.product_id), sortOrder: Number(i.sort_order ?? 0) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.productId - b.productId);
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    slug: row.slug as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    heroImageUrl: (row.hero_image_url as string | null) ?? null,
    opensAt: row.opens_at as string,
    closesAt: (row.closes_at as string | null) ?? null,
    followersFirstUntil: (row.followers_first_until as string | null) ?? null,
    followersToken: row.followers_token as string,
    readyOn: (row.ready_on as string | null) ?? null,
    pickupNote: (row.pickup_note as string) ?? "",
    deliveryNote: (row.delivery_note as string) ?? "",
    allowPickup: Boolean(row.allow_pickup),
    allowDelivery: Boolean(row.allow_delivery),
    deliveryZones: Array.isArray(row.delivery_zones) ? (row.delivery_zones as string[]) : [],
    status: row.status as DropStatus,
    productIds: items.map((i) => i.productId),
  };
}

export async function listDrops(orgId: number, options: { visibleOnly?: boolean } = {}): Promise<Drop[]> {
  let query = getSupabaseAdmin().from("drops").select(DROP_COLUMNS).eq("organization_id", orgId);
  if (options.visibleOnly) query = query.neq("status", "draft");
  const { data, error } = await query.order("opens_at", { ascending: false });
  throwIfSupabaseError(error, "Could not load drops");
  return (data ?? []).map(toDrop);
}

export async function getDrop(orgId: number, dropId: number): Promise<Drop | null> {
  const { data, error } = await getSupabaseAdmin().from("drops").select(DROP_COLUMNS).eq("organization_id", orgId).eq("id", dropId).maybeSingle();
  throwIfSupabaseError(error, "Could not load drop");
  return data ? toDrop(data) : null;
}

export type DropInput = {
  title: string;
  description: string;
  heroImageUrl: string | null;
  opensAt: string;
  closesAt: string | null;
  followersFirstUntil: string | null;
  readyOn: string | null;
  pickupNote: string;
  deliveryNote: string;
  allowPickup: boolean;
  allowDelivery: boolean;
  deliveryZones: string[];
  status: DropStatus;
  productIds: number[];
};

// Throws NO_SHOP, UNKNOWN_PRODUCT, NEEDS_READY_DATE, NEEDS_PRODUCTS,
// NEEDS_ZONES or BAD_WINDOW for the form to explain.
export async function saveDrop(orgId: number, dropId: number | null, input: DropInput, actorUserId: string): Promise<Drop> {
  if (!(await getShop(orgId))) throw new Error("NO_SHOP");
  const products = await listProducts(orgId);
  const ids = Array.from(new Set(input.productIds));
  if (ids.some((id) => !products.some((p) => p.id === id))) throw new Error("UNKNOWN_PRODUCT");
  if (input.status !== "draft") {
    if (!input.readyOn) throw new Error("NEEDS_READY_DATE");
    if (!ids.some((id) => products.find((p) => p.id === id)?.isPublished)) throw new Error("NEEDS_PRODUCTS");
  }
  if (input.allowDelivery && input.deliveryZones.length === 0) throw new Error("NEEDS_ZONES");
  if (!input.allowPickup && !input.allowDelivery) throw new Error("NEEDS_FULFILMENT");
  const opens = Date.parse(input.opensAt);
  if (Number.isNaN(opens) || (input.closesAt && Date.parse(input.closesAt) <= opens) || (input.followersFirstUntil && Date.parse(input.followersFirstUntil) <= opens)) {
    throw new Error("BAD_WINDOW");
  }

  const supabase = getSupabaseAdmin();
  const record: Record<string, unknown> = {
    organization_id: orgId,
    title: input.title.trim(),
    description: input.description.trim(),
    hero_image_url: input.heroImageUrl,
    opens_at: input.opensAt,
    closes_at: input.closesAt,
    followers_first_until: input.followersFirstUntil,
    ready_on: input.readyOn,
    pickup_note: input.pickupNote.trim(),
    delivery_note: input.deliveryNote.trim(),
    allow_pickup: input.allowPickup,
    allow_delivery: input.allowDelivery,
    delivery_zones: input.deliveryZones,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  let id = dropId;
  if (id === null) {
    const existing = await listDrops(orgId);
    const base = slugify(input.title) === "program" ? "drop" : slugify(input.title);
    let slug = base;
    let n = 2;
    while (existing.some((d) => d.slug === slug)) slug = `${base}-${n++}`;
    const { data, error } = await supabase.from("drops").insert({ ...record, slug }).select("id").single();
    throwIfSupabaseError(error, "Could not create drop");
    id = Number(data!.id);
  } else {
    const { data, error } = await supabase.from("drops").update(record).eq("id", id).eq("organization_id", orgId).select("id").maybeSingle();
    throwIfSupabaseError(error, "Could not save drop");
    if (!data) throw new Error("NOT_FOUND");
  }

  const { error: clearError } = await supabase.from("drop_items").delete().eq("drop_id", id);
  throwIfSupabaseError(clearError, "Could not save the drop's products");
  if (ids.length) {
    const { error: itemsError } = await supabase.from("drop_items").insert(ids.map((productId, index) => ({ drop_id: id, product_id: productId, sort_order: index })));
    throwIfSupabaseError(itemsError, "Could not save the drop's products");
  }
  const drop = (await getDrop(orgId, id))!;
  await logAudit({ actorUserId, organizationId: orgId, action: dropId === null ? "drop.created" : "drop.updated", targetTable: "drops", targetId: id, after: { title: drop.title, status: drop.status, opens_at: drop.opensAt, closes_at: drop.closesAt, followers_first_until: drop.followersFirstUntil, products: drop.productIds } });
  bumpListings();
  return drop;
}

// ---- public reads ------------------------------------------------------------

export type PublicShop = { org: Business; shop: Shop; products: Product[]; drops: Drop[] };

// A shop page exists for an approved or live business with a published
// shop. Drafts and suspended businesses have none.
export async function getPublicShop(orgSlug: string): Promise<PublicShop | null> {
  const org = await getBusinessBySlug(orgSlug);
  if (!org || (org.status !== "approved" && org.status !== "live")) return null;
  const shop = await getShop(org.id);
  if (!shop?.isPublished) return null;
  const [products, drops] = await Promise.all([listProducts(org.id, { publishedOnly: true }), listDrops(org.id, { visibleOnly: true })]);
  return { org, shop, products, drops };
}

export type PublicDrop = { org: Business; shop: Shop; drop: Drop; products: Product[] };

export async function getPublicDrop(orgSlug: string, dropSlug: string): Promise<PublicDrop | null> {
  const org = await getBusinessBySlug(orgSlug);
  if (!org || (org.status !== "approved" && org.status !== "live")) return null;
  const shop = await getShop(org.id);
  if (!shop?.isPublished) return null;
  const { data, error } = await getSupabaseAdmin().from("drops").select(DROP_COLUMNS).eq("organization_id", org.id).eq("slug", dropSlug).neq("status", "draft").maybeSingle();
  throwIfSupabaseError(error, "Could not load drop");
  if (!data) return null;
  const drop = toDrop(data);
  const published = await listProducts(org.id, { publishedOnly: true });
  const products = drop.productIds.map((id) => published.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  return { org, shop, drop, products };
}

// ---- reservations ------------------------------------------------------------

const RESERVATION_COLUMNS =
  "id,reference_code,buyer_name,buyer_phone,buyer_email,items,total_cents,payment_method,payment_status,status,fulfilment,zone,delivery_note,hold_until,paid_at,collected_at,cancelled_at,source,commission_eligible,created_at";

function toReservation(row: Record<string, unknown>): ListedReservation {
  const items = (Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : []).map((i) => ({
    variantId: Number(i.variantId),
    productId: Number(i.productId),
    title: String(i.title ?? ""),
    label: String(i.label ?? ""),
    qty: Number(i.qty),
    unitCents: Number(i.unitCents),
  }));
  return {
    id: Number(row.id),
    referenceCode: row.reference_code as string,
    buyerName: row.buyer_name as string,
    buyerPhone: row.buyer_phone as string,
    buyerEmail: (row.buyer_email as string | null) ?? null,
    items,
    totalCents: Number(row.total_cents),
    paymentMethod: row.payment_method as ShopPaymentMethod,
    paymentStatus: row.payment_status as PaymentStatus,
    status: row.status as ReservationStatus,
    fulfilment: row.fulfilment as Fulfilment,
    zone: (row.zone as string | null) ?? null,
    deliveryNote: (row.delivery_note as string | null) ?? null,
    holdUntil: row.hold_until as string,
    paidAt: (row.paid_at as string | null) ?? null,
    collectedAt: (row.collected_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    source: row.source as ShopSource,
    commissionEligible: Boolean(row.commission_eligible),
    createdAt: row.created_at as string,
  };
}

export type NewReservation = {
  orgId: number;
  shop: Shop;
  dropId: number;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  items: ReservationItem[];
  totalCents: number;
  paymentMethod: ShopPaymentMethod;
  fulfilment: Fulfilment;
  zone: string | null;
  deliveryNote: string | null;
  source: ShopSource;
  commissionEligible: boolean;
  commissionReason: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerHost: string | null;
  now?: Date;
};

// Takes the stock and records the reservation in one database
// transaction. Throws SOLD_OUT:<variant ids> when a size ran out between
// the page loading and the buyer pressing Reserve.
export async function createReservation(input: NewReservation): Promise<{ id: number; referenceCode: string; receiptToken: string; holdUntil: string }> {
  const supabase = getSupabaseAdmin();
  const hold = holdUntil(input.now ?? new Date(), input.shop.holdHours).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referenceCode = makeReferenceCode(input.shop.referencePrefix, randomBytes(6));
    const receiptToken = randomBytes(18).toString("hex");
    const { data, error } = await supabase.rpc("shop_create_reservation", {
      p: {
        reference_code: referenceCode,
        receipt_token: receiptToken,
        organization_id: input.orgId,
        drop_id: input.dropId,
        buyer_name: input.buyerName,
        buyer_phone: input.buyerPhone,
        buyer_email: input.buyerEmail ?? "",
        items: input.items,
        total_cents: input.totalCents,
        payment_method: input.paymentMethod,
        fulfilment: input.fulfilment,
        zone: input.zone ?? "",
        delivery_note: input.deliveryNote ?? "",
        hold_until: hold,
        source: input.source,
        utm_source: input.utmSource,
        utm_medium: input.utmMedium,
        utm_campaign: input.utmCampaign,
        referrer_host: input.referrerHost,
        commission_eligible: input.commissionEligible,
        commission_reason: input.commissionReason,
      },
    });
    if (!error) return { id: Number((data as { id: number }).id), referenceCode, receiptToken, holdUntil: hold };
    if (error.code === "23505") continue; // a reference code or token collision: draw again
    const soldOut = /SOLD_OUT:(\d+)/.exec(error.message ?? "");
    if (soldOut) throw new Error(`SOLD_OUT:${soldOut[1]}`);
    if ((error.message ?? "").includes("UNKNOWN_VARIANT")) throw new Error("UNKNOWN_VARIANT");
    throwIfSupabaseError(error, "Could not save reservation");
  }
  throw new Error("Could not draw a free reference code");
}

export type Receipt = { org: Business; shop: Shop; drop: Drop; reservation: ListedReservation };

// The buyer's itemised receipt. The token is the only key: 36 random hex
// characters, never guessable from the reference code.
export async function getReceipt(orgSlug: string, token: string): Promise<Receipt | null> {
  if (!/^[a-f0-9]{36}$/.test(token)) return null;
  const org = await getBusinessBySlug(orgSlug);
  if (!org) return null;
  const { data, error } = await getSupabaseAdmin().from("reservations").select(`${RESERVATION_COLUMNS},drop_id`).eq("organization_id", org.id).eq("receipt_token", token).maybeSingle();
  throwIfSupabaseError(error, "Could not load reservation");
  if (!data) return null;
  const [shop, drop] = await Promise.all([getShop(org.id), getDrop(org.id, Number(data.drop_id))]);
  if (!shop || !drop) return null;
  return { org, shop, drop, reservation: toReservation(data) };
}

export async function listDropReservations(orgId: number, dropId: number): Promise<ListedReservation[]> {
  const { data, error } = await getSupabaseAdmin().from("reservations").select(RESERVATION_COLUMNS).eq("organization_id", orgId).eq("drop_id", dropId).order("created_at", { ascending: false });
  throwIfSupabaseError(error, "Could not load reservations");
  return (data ?? []).map(toReservation);
}

export type ReservationAction = "paid" | "unpaid" | "refunded" | "collected" | "uncollected" | "cancel";

// One tap on the seller's list. Each action only applies from the state
// it makes sense in (CONFLICT otherwise, e.g. two phones tapping at once).
export async function updateReservation(orgId: number, reservationId: number, action: ReservationAction, actorUserId: string): Promise<ListedReservation> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  if (action === "cancel") {
    // The database function works by id alone: make sure it is this shop's.
    const { data: own, error: ownError } = await supabase.from("reservations").select("id").eq("id", reservationId).eq("organization_id", orgId).maybeSingle();
    throwIfSupabaseError(ownError, "Could not load reservation");
    if (!own) throw new Error("CONFLICT");
    const { data, error } = await supabase.rpc("shop_release_reservation", { p_id: reservationId, p_status: "cancelled", p_only_expired: false });
    throwIfSupabaseError(error, "Could not cancel reservation");
    if (!data) throw new Error("CONFLICT");
  } else {
    const table = () => supabase.from("reservations");
    const query =
      action === "paid"
        ? table().update({ payment_status: "paid", paid_at: now, updated_at: now }).eq("status", "active").eq("payment_status", "pending")
        : action === "unpaid"
          ? table().update({ payment_status: "pending", paid_at: null, updated_at: now }).eq("status", "active").eq("payment_status", "paid")
          : action === "refunded"
            ? table().update({ payment_status: "refunded", updated_at: now }).eq("payment_status", "paid")
            : action === "collected"
              ? table().update({ collected_at: now, updated_at: now }).eq("status", "active").is("collected_at", null)
              : table().update({ collected_at: null, updated_at: now }).not("collected_at", "is", null);
    const { data, error } = await query.eq("id", reservationId).eq("organization_id", orgId).select("id").maybeSingle();
    throwIfSupabaseError(error, "Could not update reservation");
    if (!data) throw new Error("CONFLICT");
  }
  const { data: row, error: readError } = await supabase.from("reservations").select(RESERVATION_COLUMNS).eq("id", reservationId).eq("organization_id", orgId).single();
  throwIfSupabaseError(readError, "Could not load reservation");
  const reservation = toReservation(row!);
  await logAudit({ actorUserId, organizationId: orgId, action: `reservation.${action}`, targetTable: "reservations", targetId: reservationId, after: { reference: reservation.referenceCode, payment_status: reservation.paymentStatus, status: reservation.status, collected: Boolean(reservation.collectedAt) } });
  return reservation;
}

// "Release now?": the owner confirmed these. Each is re-checked in the
// database (still unpaid, still past its hold) as it is released.
export async function releaseExpired(orgId: number, dropId: number, ids: number[], actorUserId: string): Promise<string[]> {
  const listed = await listDropReservations(orgId, dropId);
  const now = new Date();
  const candidates = listed.filter((r) => ids.includes(r.id) && isPastHold(r, now));
  const released: string[] = [];
  for (const r of candidates) {
    const { data, error } = await getSupabaseAdmin().rpc("shop_release_reservation", { p_id: r.id, p_status: "released", p_only_expired: true });
    throwIfSupabaseError(error, "Could not release reservation");
    if (data) released.push(r.referenceCode);
  }
  if (released.length) {
    await logAudit({ actorUserId, organizationId: orgId, action: "reservation.released_unpaid", targetTable: "drops", targetId: dropId, after: { references: released } });
  }
  return released;
}

// ---- waitlist ----------------------------------------------------------------

// Throws NOT_SOLD_OUT (reserve it instead) or ALREADY_ON_LIST.
export async function joinWaitlist(input: { orgId: number; dropId: number; variantId: number; name: string; phone: string; email: string | null }): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: variant, error } = await supabase.from("product_variants").select("id,stock").eq("id", input.variantId).maybeSingle();
  throwIfSupabaseError(error, "Could not load size");
  if (!variant) throw new Error("UNKNOWN_VARIANT");
  if (variant.stock === null || Number(variant.stock) > 0) throw new Error("NOT_SOLD_OUT");
  const { error: insertError } = await supabase.from("drop_waitlist").insert({ organization_id: input.orgId, drop_id: input.dropId, variant_id: input.variantId, name: input.name, phone: input.phone, email: input.email });
  if (insertError?.code === "23505") throw new Error("ALREADY_ON_LIST");
  throwIfSupabaseError(insertError, "Could not join the waitlist");
}

export type WaitlistEntry = { id: number; variantId: number; productTitle: string; label: string; name: string; phone: string; email: string | null; createdAt: string };

export async function listWaitlist(orgId: number, dropId: number): Promise<WaitlistEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("drop_waitlist")
    .select("id,variant_id,name,phone,email,created_at,product_variants(label,products(title))")
    .eq("organization_id", orgId)
    .eq("drop_id", dropId)
    .order("created_at", { ascending: true });
  throwIfSupabaseError(error, "Could not load the waitlist");
  return (data ?? []).map((row) => {
    const variant = (Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants) as { label?: string; products?: { title?: string } | { title?: string }[] } | null;
    const product = Array.isArray(variant?.products) ? variant?.products[0] : variant?.products;
    return {
      id: Number(row.id),
      variantId: Number(row.variant_id),
      productTitle: product?.title ?? "",
      label: variant?.label ?? "",
      name: row.name as string,
      phone: row.phone as string,
      email: (row.email as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });
}

// ---- platform admin ----------------------------------------------------------

export type LicenceRequest = { productId: number; orgId: number; orgName: string; orgSlug: string | null; title: string; photo: string | null; licenceKind: LicenceKind | null; licenceNote: string | null; approvedAt: string | null; isPublished: boolean };

export async function listLicenceProducts(): Promise<LicenceRequest[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("products")
    .select("id,organization_id,title,photos,licence_kind,licence_note,licence_approved_at,is_published,organizations(name,slug)")
    .eq("uses_marks", true)
    .order("licence_approved_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load licence requests");
  return (data ?? []).map((row) => {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null } | null;
    const photos = Array.isArray(row.photos) ? (row.photos as string[]) : [];
    return {
      productId: Number(row.id),
      orgId: Number(row.organization_id),
      orgName: org?.name ?? "",
      orgSlug: org?.slug ?? null,
      title: row.title as string,
      photo: photos[0] ?? null,
      licenceKind: (row.licence_kind as LicenceKind | null) ?? null,
      licenceNote: (row.licence_note as string | null) ?? null,
      approvedAt: (row.licence_approved_at as string | null) ?? null,
      isPublished: Boolean(row.is_published),
    };
  });
}

// Platform owners only (the route checks). Approving needs a kind and a
// note; withdrawing also unpublishes the product.
export async function setLicenceApproval(productId: number, approve: boolean, actorUserId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: product, error } = await supabase.from("products").select("id,organization_id,uses_marks,licence_kind,licence_note").eq("id", productId).maybeSingle();
  throwIfSupabaseError(error, "Could not load product");
  if (!product || !product.uses_marks) throw new Error("NOT_FOUND");
  if (approve && (!product.licence_kind || !String(product.licence_note ?? "").trim())) throw new Error("NEEDS_LICENCE_NOTE");
  const patch = approve
    ? { licence_approved_at: new Date().toISOString(), licence_approved_by: actorUserId }
    : { licence_approved_at: null, licence_approved_by: null, is_published: false };
  const { error: updateError } = await supabase.from("products").update(patch).eq("id", productId);
  throwIfSupabaseError(updateError, "Could not save the licence decision");
  await logAudit({ actorUserId, organizationId: Number(product.organization_id), action: approve ? "product.licence_approved" : "product.licence_withdrawn", targetTable: "products", targetId: productId, after: { licence_kind: product.licence_kind, licence_note: product.licence_note } });
  bumpListings();
}

export type ShopOverview = { orgId: number; orgName: string; orgSlug: string | null; isPublished: boolean; drops: number; reservations: StatsInput[] };

export async function listShopOverview(): Promise<ShopOverview[]> {
  const supabase = getSupabaseAdmin();
  const [{ data: shops, error }, { data: drops, error: dropsError }, { data: reservations, error: resError }] = await Promise.all([
    supabase.from("shops").select("organization_id,is_published,organizations(name,slug)"),
    supabase.from("drops").select("organization_id"),
    supabase.from("reservations").select("organization_id,status,payment_status,collected_at,source,commission_eligible,total_cents"),
  ]);
  throwIfSupabaseError(error ?? dropsError ?? resError, "Could not load shops");
  return (shops ?? []).map((row) => {
    const orgId = Number(row.organization_id);
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null } | null;
    return {
      orgId,
      orgName: org?.name ?? "",
      orgSlug: org?.slug ?? null,
      isPublished: Boolean(row.is_published),
      drops: (drops ?? []).filter((d) => Number(d.organization_id) === orgId).length,
      reservations: (reservations ?? [])
        .filter((r) => Number(r.organization_id) === orgId)
        .map((r) => ({
          status: r.status as ReservationStatus,
          paymentStatus: r.payment_status as PaymentStatus,
          collectedAt: (r.collected_at as string | null) ?? null,
          source: r.source as ShopSource,
          commissionEligible: Boolean(r.commission_eligible),
          totalCents: Number(r.total_cents),
        })),
    };
  });
}
