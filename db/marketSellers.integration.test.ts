import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDraftBusiness } from "./business";
import { applyToSell, getSellerRecords, listSellers, saveSellerProfile, suspendSeller, unsuspendSeller, verifySeller } from "./marketSellers";
import { getPublicShop, getShop, saveProduct, saveShop } from "./shop";

// PortPass Market sellers (brief 25, part A) against the local Supabase
// stack, with TEST businesses that are deleted afterwards: applying makes a
// pending seller whose shop is not public; only a verified seller (licence
// number and contact person on file) is public, to the pages and to the
// browser roles; changing a checked record, or a suspension, takes it off
// again. Nobody is messaged: these call the data layer, not the alert.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const tag = crypto.randomUUID().slice(0, 6);
let userId = "";
let orgId = 0;
let slug = "";
let bareOrgId = 0;

const application = {
  businessName: `TEST — delete Island Candles ${tag}`,
  marketCategory: "home" as const,
  licenceNumber: `BL-TEST-${tag}`,
  contactPerson: "TEST — delete Contact",
  whatsappE164: "+12425550142",
  whatTheySell: "TEST — candles",
  pickupLocation: "TEST — Shirley Street studio",
  acceptsCashOnPickup: true,
};

async function anonProducts(): Promise<number> {
  const { data } = await anon.from("products").select("id").eq("organization_id", orgId);
  return (data ?? []).length;
}

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `market-seller-${tag}@test.portpass.local`, email_confirm: true });
  expect(created.error).toBeNull();
  userId = created.data.user!.id;
  await admin.from("profiles").upsert({ user_id: userId, full_name: "TEST — delete seller" });
});

afterAll(async () => {
  for (const id of [orgId, bareOrgId].filter(Boolean)) {
    await admin.from("audit_log").delete().eq("organization_id", id);
    const { error } = await admin.from("organizations").delete().eq("id", id);
    expect(error).toBeNull();
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("applying at /sell", () => {
  it("makes a draft business the applicant owns, a closed shop and a pending seller, with the records on file", async () => {
    const result = await applyToSell(userId, application);
    expect(result.existing).toBe(false);
    orgId = result.organizationId;
    slug = result.slug;
    const { data: org } = await admin.from("organizations").select("status,is_published,primary_category,whatsapp_e164").eq("id", orgId).single();
    expect(org).toEqual({ status: "draft", is_published: false, primary_category: "shop", whatsapp_e164: "+12425550142" });
    const { data: member } = await admin.from("organization_members").select("role").eq("organization_id", orgId).eq("user_id", userId).single();
    expect(member?.role).toBe("org_owner");

    const shop = await getShop(orgId);
    expect(shop).toMatchObject({ isPublished: false, sellerStatus: "pending", marketCategory: "home", sellerPickupNote: "TEST — Shirley Street studio", acceptsCashOnPickup: true });
    expect(shop!.sellerAppliedAt).not.toBeNull();
    expect(await getSellerRecords(orgId)).toMatchObject({ licenceNumber: `BL-TEST-${tag}`, contactPerson: "TEST — delete Contact" });
  });

  it("sends someone who has already applied back to that application", async () => {
    const again = await applyToSell(userId, { ...application, businessName: `TEST — delete Second ${tag}` });
    expect(again).toEqual({ organizationId: orgId, slug, existing: true });
  });

  it("is in Admin -> Market -> Sellers, with its records", async () => {
    const row = (await listSellers()).find((s) => s.orgId === orgId);
    expect(row).toMatchObject({ sellerStatus: "pending", licenceNumber: `BL-TEST-${tag}`, contactPerson: "TEST — delete Contact", productsPublished: 0 });
  });
});

describe("an unverified seller builds a storefront that is not public", () => {
  it("keeps the shop and its products hidden from the page and from the browser roles", async () => {
    await saveShop(orgId, { referencePrefix: (await getShop(orgId))!.referencePrefix, returnsPolicy: "TEST — exchanges within 7 days.", holdHours: 48, isPublished: true }, userId);
    const { product } = await saveProduct(orgId, null, { title: "TEST Candle", description: "TEST — delete", priceCents: 2500, photos: [], isPublished: true, usesMarks: false, licenceKind: null, licenceNote: null, marketCategory: "home", variants: [{ id: null, label: "8oz", stock: 5 }] }, userId);
    expect(product.isPublished).toBe(true);
    expect(product.marketCategory).toBe("home");
    expect(await getPublicShop(slug)).toBeNull();
    expect(await anonProducts()).toBe(0);
  });
});

describe("verifying", () => {
  it("is refused without a licence number or a contact person, even written straight to the table", async () => {
    const bare = await createDraftBusiness({ name: `TEST — delete Bare ${tag}`, section: "shop", subcategory: null, ownerUserId: null, actorUserId: userId });
    bareOrgId = bare.id;
    const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
    const prefix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => letters[b % letters.length]).join("");
    await saveShop(bareOrgId, { referencePrefix: prefix, returnsPolicy: "", holdHours: 48, isPublished: false }, userId);
    await expect(verifySeller(bareOrgId, userId)).rejects.toThrow("NEEDS_CONTACT");
    await admin.from("organizations").update({ primary_contact: "TEST — delete" }).eq("id", bareOrgId);
    await expect(verifySeller(bareOrgId, userId)).rejects.toThrow("NEEDS_LICENCE");
    const { error } = await admin.from("shops").update({ seller_status: "verified", seller_verified_at: new Date().toISOString() }).eq("organization_id", bareOrgId);
    expect(error?.code).toBe("23514");
  });

  it("refuses the demo business", async () => {
    const { data: demo } = await admin.from("organizations").select("id").eq("is_demo", true).maybeSingle();
    if (!demo) return; // a stack without the demo business has nothing to refuse
    await expect(verifySeller(Number(demo.id), userId)).rejects.toThrow(/DEMO|NO_SHOP/);
  });

  it("approves the business, takes it live with its published product, and opens the storefront to everyone", async () => {
    const { wentLive } = await verifySeller(orgId, userId);
    expect(wentLive).toBe(true);
    const { data: org } = await admin.from("organizations").select("status,is_published,licence_verified_at").eq("id", orgId).single();
    expect(org!.status).toBe("live");
    expect(org!.is_published).toBe(true);
    expect(org!.licence_verified_at).not.toBeNull();
    const shop = await getPublicShop(slug);
    expect(shop?.shop.sellerStatus).toBe("verified");
    expect(shop?.products.map((p) => p.title)).toEqual(["TEST Candle"]);
    expect(await anonProducts()).toBe(1);
  });
});

describe("after verification", () => {
  it("a changed licence number sends the seller back to PortPass and off the Market", async () => {
    const { shop, joinedQueue } = await saveSellerProfile(
      orgId,
      { marketCategory: "home", whatTheySell: "TEST — candles", contactPerson: "TEST — delete Contact", licenceNumber: `BL-TEST-${tag}-2`, pickupNote: "TEST — studio", deliveryZones: [{ zone: "Cable Beach", feeCents: 1000, leadDays: 2 }], acceptsCashOnPickup: true, requestVerification: false },
      userId,
    );
    expect(shop.sellerStatus).toBe("pending");
    expect(joinedQueue).toBe(true);
    expect(shop.sellerDeliveryZones).toEqual([{ zone: "Cable Beach", feeCents: 1000, leadDays: 2 }]);
    expect(await getPublicShop(slug)).toBeNull();
    expect(await anonProducts()).toBe(0);
  });

  it("a suspension takes it off with a reason; lifting it goes back to the queue, not straight back on", async () => {
    await verifySeller(orgId, userId);
    expect(await getPublicShop(slug)).not.toBeNull();
    await expect(suspendSeller(orgId, " ", userId)).rejects.toThrow("NEEDS_REASON");
    await suspendSeller(orgId, "TEST — paused while we talk", userId);
    expect(await getShop(orgId)).toMatchObject({ sellerStatus: "suspended", sellerStatusReason: "TEST — paused while we talk", sellerVerifiedAt: null });
    expect(await getPublicShop(slug)).toBeNull();
    await expect(verifySeller(orgId, userId)).rejects.toThrow("SELLER_SUSPENDED");
    await expect(saveSellerProfile(orgId, { marketCategory: "home", whatTheySell: "", contactPerson: "TEST — delete Contact", licenceNumber: `BL-TEST-${tag}-2`, pickupNote: "TEST", deliveryZones: [], acceptsCashOnPickup: true, requestVerification: true }, userId)).rejects.toThrow("SUSPENDED");
    await unsuspendSeller(orgId, userId);
    expect(await getShop(orgId)).toMatchObject({ sellerStatus: "pending", sellerStatusReason: null });
    expect(await getPublicShop(slug)).toBeNull();
  });

  it("never lets a browser role read the seller's records", async () => {
    const { data: shops } = await anon.from("shops").select("organization_id").eq("organization_id", orgId);
    expect(shops ?? []).toEqual([]);
    const { data: orgs } = await anon.from("organizations").select("licences").eq("id", orgId);
    expect(orgs ?? []).toEqual([]);
  });
});
