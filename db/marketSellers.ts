import { bumpListings } from "@/lib/revalidate";
import { BUSINESS_LICENCE_TYPE, prefixCandidates, zonesToRow, type DeliveryZone, type SellerApplication, type SellerProfileInput, type SellerStatus } from "@/lib/market/sellers";
import type { MarketCategorySlug } from "@/lib/market/categories";
import { logAudit } from "./audit";
import { createDraftBusiness, getBusiness } from "./business";
import { demoOrganizationIdOrNull } from "./demo";
import { markLeadsLive } from "./leadLinks";
import { getOrganizationLicences, setOrganizationLicences, type Licence } from "./licences";
import { getShop, SHOP_COLUMNS, toShop, type Shop } from "./shop";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// PortPass Market sellers (brief 25, part A). A seller is a business with a
// shop row; the seller's Market fields ride on it (db/shop.ts). The two
// records verification needs are the business's own: its licence number
// (organizations.licences, through db/licences.ts) and its contact person
// (organizations.primary_contact). Neither is ever public. Access control
// lives in the routes and pages (lib/auth/guards.ts); this module trusts
// its callers and keeps the data rules.

const db = () => getSupabaseAdmin();

// ---- the seller's records ---------------------------------------------------

export type SellerRecords = { licenceNumber: string | null; contactPerson: string | null; licenceVerifiedAt: string | null };

function businessLicence(licences: Licence[]): Licence | null {
  return licences.find((l) => l.type === BUSINESS_LICENCE_TYPE && l.number) ?? licences.find((l) => l.number) ?? null;
}

export async function getSellerRecords(orgId: number): Promise<SellerRecords> {
  const [{ data, error }, licences] = await Promise.all([db().from("organizations").select("primary_contact").eq("id", orgId).maybeSingle(), getOrganizationLicences(orgId)]);
  throwIfSupabaseError(error, "Could not load the seller's records");
  return {
    licenceNumber: businessLicence(licences?.licences ?? [])?.number ?? null,
    contactPerson: ((data?.primary_contact as string | null) ?? "").trim() || null,
    licenceVerifiedAt: licences?.verifiedAt ?? null,
  };
}

// The business licence entry replaced (or removed), any other licence kept.
// db/licences.ts clears the licence check on any change, and the database
// sends a verified seller back to pending (organizations_seller_records_changed).
async function setBusinessLicence(orgId: number, number: string | null, actorUserId: string | null): Promise<void> {
  const current = (await getOrganizationLicences(orgId))?.licences ?? [];
  const others = current.filter((l) => l.type !== BUSINESS_LICENCE_TYPE);
  const next: Licence[] = number ? [...others, { type: BUSINESS_LICENCE_TYPE, number, expiresOn: null, documentUrl: null }] : others;
  await setOrganizationLicences(orgId, next, actorUserId);
}

async function setContactPerson(orgId: number, contactPerson: string | null): Promise<void> {
  const { error } = await db().from("organizations").update({ primary_contact: contactPerson }).eq("id", orgId);
  throwIfSupabaseError(error, "Could not save the contact person");
}

// ---- the seller's own settings (their shop page) ------------------------------

// Saves how buyers get their order and the records PortPass checks. Asking
// to be verified moves a seller from "none" to "pending"; a suspended
// seller cannot ask (PortPass lifts a suspension). Returns the shop and
// whether the seller has just joined the queue (the founders are told).
export async function saveSellerProfile(orgId: number, input: SellerProfileInput, actorUserId: string): Promise<{ shop: Shop; joinedQueue: boolean }> {
  const before = await getShop(orgId);
  if (!before) throw new Error("NO_SHOP");
  if (input.requestVerification && before.sellerStatus === "suspended") throw new Error("SUSPENDED");

  const records = await getSellerRecords(orgId);
  if ((input.licenceNumber ?? null) !== records.licenceNumber) await setBusinessLicence(orgId, input.licenceNumber, actorUserId);
  const contact = input.contactPerson.trim() || null;
  if (contact !== records.contactPerson) await setContactPerson(orgId, contact);

  const patch: Record<string, unknown> = {
    seller_pickup_note: input.pickupNote,
    seller_delivery_zones: zonesToRow(input.deliveryZones),
    accepts_cash_on_pickup: input.acceptsCashOnPickup,
    market_category: input.marketCategory,
    what_they_sell: input.whatTheySell,
    updated_at: new Date().toISOString(),
  };
  if (input.requestVerification && before.sellerStatus === "none") {
    patch.seller_status = "pending";
    patch.seller_applied_at = new Date().toISOString();
  }
  const { data, error } = await db().from("shops").update(patch).eq("organization_id", orgId).select(SHOP_COLUMNS).single();
  throwIfSupabaseError(error, "Could not save the seller settings");
  const shop = toShop(data!);
  // Pending now, and was not before: asked just now, or a verified seller
  // changed a checked record (the database moved it back to pending).
  const joinedQueue = shop.sellerStatus === "pending" && before.sellerStatus !== "pending";
  await logAudit({
    actorUserId,
    organizationId: orgId,
    action: "market.seller_settings_saved",
    targetTable: "shops",
    targetId: orgId,
    after: { seller_status: shop.sellerStatus, market_category: shop.marketCategory, zones: input.deliveryZones.length, cash_on_pickup: input.acceptsCashOnPickup, licence_on_file: Boolean(input.licenceNumber), contact_on_file: Boolean(contact) },
  });
  if (before.sellerStatus === "verified") bumpListings();
  return { shop, joinedQueue };
}

// ---- applying at /sell -------------------------------------------------------

// A signed-in person applies to sell: a new draft business they own, in the
// Shop Bahamian section, with a shop that is not open yet and a seller
// waiting for PortPass. Someone who already has a pending application is
// sent back to it instead of making another business.
export async function applyToSell(userId: string, app: SellerApplication): Promise<{ organizationId: number; slug: string; existing: boolean }> {
  const pending = await findPendingApplication(userId);
  if (pending) return { ...pending, existing: true };

  const business = await createDraftBusiness({ name: app.businessName, section: "shop", subcategory: null, ownerUserId: userId, actorUserId: userId });
  const { error: orgError } = await db().from("organizations").update({ whatsapp_e164: app.whatsappE164, primary_contact: app.contactPerson }).eq("id", business.id);
  throwIfSupabaseError(orgError, "Could not save the seller's contact details");
  await setOrganizationLicences(business.id, [{ type: BUSINESS_LICENCE_TYPE, number: app.licenceNumber, expiresOn: null, documentUrl: null }], userId);

  const now = new Date().toISOString();
  let created = false;
  for (const prefix of prefixCandidates(app.businessName).slice(0, 60)) {
    const { error } = await db().from("shops").insert({
      organization_id: business.id,
      reference_prefix: prefix,
      returns_policy: "",
      hold_hours: 48,
      is_published: false,
      seller_status: "pending",
      seller_applied_at: now,
      market_category: app.marketCategory,
      what_they_sell: app.whatTheySell,
      seller_pickup_note: app.pickupLocation,
      accepts_cash_on_pickup: app.acceptsCashOnPickup,
    });
    if (error?.code === "23505") continue; // that prefix belongs to another shop
    throwIfSupabaseError(error, "Could not create the shop");
    created = true;
    break;
  }
  if (!created) throw new Error("Could not find a free reference prefix");
  await logAudit({ actorUserId: userId, organizationId: business.id, action: "market.seller_applied", targetTable: "shops", targetId: business.id, after: { market_category: app.marketCategory, cash_on_pickup: app.acceptsCashOnPickup } });
  return { organizationId: business.id, slug: business.slug ?? "", existing: false };
}

async function findPendingApplication(userId: string): Promise<{ organizationId: number; slug: string } | null> {
  const { data: owned, error } = await db().from("organization_members").select("organization_id").eq("user_id", userId).eq("role", "org_owner");
  throwIfSupabaseError(error, "Could not look up the seller's businesses");
  const ids = (owned ?? []).map((row) => Number(row.organization_id));
  if (!ids.length) return null;
  const { data: shops, error: shopsError } = await db().from("shops").select("organization_id").in("organization_id", ids).eq("seller_status", "pending").limit(1);
  throwIfSupabaseError(shopsError, "Could not look up the seller's applications");
  const shop = (shops ?? [])[0];
  if (!shop) return null;
  const business = await getBusiness(Number(shop.organization_id));
  return business?.slug ? { organizationId: business.id, slug: business.slug } : null;
}

// ---- Admin -> Market -> Sellers ------------------------------------------------

export type AdminSeller = {
  orgId: number;
  name: string;
  slug: string | null;
  businessStatus: string;
  sellerStatus: SellerStatus;
  verifiedAt: string | null;
  appliedAt: string | null;
  statusReason: string | null;
  marketCategory: MarketCategorySlug | null;
  whatTheySell: string;
  shopOpen: boolean;
  whatsappE164: string | null;
  contactPerson: string | null;
  licenceNumber: string | null;
  pickupNote: string;
  deliveryZones: DeliveryZone[];
  acceptsCashOnPickup: boolean;
  productsPublished: number;
  productsTotal: number;
};

const PAGE = 1000;

// PostgREST answers at most 1,000 rows a request: read in pages.
async function productCounts(orgIds: number[]): Promise<Map<number, { published: number; total: number }>> {
  const counts = new Map<number, { published: number; total: number }>();
  if (!orgIds.length) return counts;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from("products").select("organization_id,is_published").in("organization_id", orgIds).order("id", { ascending: true }).range(from, from + PAGE - 1);
    throwIfSupabaseError(error, "Could not count products");
    for (const row of data ?? []) {
      const id = Number(row.organization_id);
      const entry = counts.get(id) ?? { published: 0, total: 0 };
      entry.total += 1;
      if (row.is_published) entry.published += 1;
      counts.set(id, entry);
    }
    if ((data ?? []).length < PAGE) break;
  }
  return counts;
}

// Every business that has asked to sell (anything but "none"), newest
// application first. Never the demo.
export async function listSellers(): Promise<AdminSeller[]> {
  const demoId = await demoOrganizationIdOrNull();
  const { data, error } = await db()
    .from("shops")
    .select(`${SHOP_COLUMNS},organizations!inner(name,slug,status,is_demo,whatsapp_e164,primary_contact,licences)`)
    .neq("seller_status", "none")
    .eq("organizations.is_demo", false)
    .order("seller_applied_at", { ascending: false, nullsFirst: false });
  throwIfSupabaseError(error, "Could not load sellers");
  const rows = (data ?? []).filter((row) => Number(row.organization_id) !== demoId);
  const counts = await productCounts(rows.map((row) => Number(row.organization_id)));
  return rows.map((row) => {
    const shop = toShop(row);
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null; status: string; whatsapp_e164: string | null; primary_contact: string | null; licences: unknown };
    const licences = Array.isArray(org.licences) ? (org.licences as Record<string, unknown>[]) : [];
    const licence = licences.find((l) => l.type === BUSINESS_LICENCE_TYPE && typeof l.number === "string" && l.number) ?? licences.find((l) => typeof l.number === "string" && l.number);
    const count = counts.get(shop.organizationId) ?? { published: 0, total: 0 };
    return {
      orgId: shop.organizationId,
      name: org.name,
      slug: org.slug,
      businessStatus: org.status,
      sellerStatus: shop.sellerStatus,
      verifiedAt: shop.sellerVerifiedAt,
      appliedAt: shop.sellerAppliedAt,
      statusReason: shop.sellerStatusReason,
      marketCategory: shop.marketCategory,
      whatTheySell: shop.whatTheySell,
      shopOpen: shop.isPublished,
      whatsappE164: org.whatsapp_e164,
      contactPerson: (org.primary_contact ?? "").trim() || null,
      licenceNumber: (licence?.number as string | undefined) ?? null,
      pickupNote: shop.sellerPickupNote,
      deliveryZones: shop.sellerDeliveryZones,
      acceptsCashOnPickup: shop.acceptsCashOnPickup,
      productsPublished: count.published,
      productsTotal: count.total,
    };
  });
}

export async function countPendingSellers(): Promise<number> {
  const demoId = await demoOrganizationIdOrNull();
  let query = db().from("shops").select("organization_id", { count: "exact", head: true }).eq("seller_status", "pending");
  if (demoId !== null) query = query.neq("organization_id", demoId);
  const { count, error } = await query;
  throwIfSupabaseError(error, "Could not count pending sellers");
  return count ?? 0;
}

const VERIFY_ERRORS = ["NOT_FOUND", "DEMO", "BUSINESS_SUSPENDED", "SELLER_SUSPENDED", "NEEDS_CONTACT", "NEEDS_LICENCE", "NO_SHOP"] as const;

// Platform owners only (the route checks). The database function checks
// the records and marks the seller verified and the licence checked, in one
// transaction; a business that already has a published product goes live.
export async function verifySeller(orgId: number, actorUserId: string): Promise<{ wentLive: boolean }> {
  const { data, error } = await db().rpc("market_verify_seller", { p_org: orgId, p_actor: actorUserId });
  if (error) {
    const known = VERIFY_ERRORS.find((code) => (error.message ?? "").includes(code));
    if (known) throw new Error(known);
    throwIfSupabaseError(error, "Could not verify the seller");
  }
  const wentLive = Boolean((data as { went_live?: boolean } | null)?.went_live);
  await logAudit({ actorUserId, organizationId: orgId, action: "market.seller_verified", targetTable: "shops", targetId: orgId, after: { seller_status: "verified" } });
  if (wentLive) {
    await logAudit({ actorUserId, organizationId: orgId, action: "business.went_live", targetTable: "organizations", targetId: orgId, after: { via: "market seller verified" } });
    await markLeadsLive(orgId, actorUserId);
  }
  bumpListings();
  return { wentLive };
}

// Off the Market at once, with a reason the seller sees. Its products stay
// as they are (published or not); nothing of theirs is public until PortPass
// lifts it.
export async function suspendSeller(orgId: number, reason: string, actorUserId: string): Promise<void> {
  const clean = reason.trim().slice(0, 500);
  if (!clean) throw new Error("NEEDS_REASON");
  const { data, error } = await db().from("shops").update({ seller_status: "suspended", seller_status_reason: clean, updated_at: new Date().toISOString() }).eq("organization_id", orgId).neq("seller_status", "none").select("organization_id").maybeSingle();
  throwIfSupabaseError(error, "Could not suspend the seller");
  if (!data) throw new Error("NOT_FOUND");
  await logAudit({ actorUserId, organizationId: orgId, action: "market.seller_suspended", targetTable: "shops", targetId: orgId, after: { reason: clean } });
  bumpListings();
}

// Lifting a suspension puts the seller back in the queue: PortPass verifies
// again before anything of theirs is public.
export async function unsuspendSeller(orgId: number, actorUserId: string): Promise<void> {
  const { data, error } = await db().from("shops").update({ seller_status: "pending", updated_at: new Date().toISOString() }).eq("organization_id", orgId).eq("seller_status", "suspended").select("organization_id").maybeSingle();
  throwIfSupabaseError(error, "Could not lift the suspension");
  if (!data) throw new Error("NOT_FOUND");
  await logAudit({ actorUserId, organizationId: orgId, action: "market.seller_unsuspended", targetTable: "shops", targetId: orgId, after: { seller_status: "pending" } });
}

