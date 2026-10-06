import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as reserve } from "@/app/api/shop/reservations/route";
import { POST as joinWaitlistRoute } from "@/app/api/shop/waitlist/route";
import { serializeAttributionCookie, shopAttributionCookie } from "@/lib/attribution";
import { reservationStats } from "@/lib/shop/rules";
import { createDraftBusiness } from "./business";
import {
  getReceipt,
  getShop,
  listDropReservations,
  listWaitlist,
  releaseExpired,
  saveDrop,
  saveProduct,
  saveShop,
  setLicenceApproval,
  updateReservation,
  type Drop,
  type Product,
} from "./shop";

// Drops (brief 15) against the local Supabase stack, with a TEST business
// that is deleted afterwards: reserve takes stock, a sold-out size offers
// the waitlist, unpaid reservations past the hold go back to stock only
// when released, paid and collected are recorded, and commission counts
// only PortPass-brought paid orders. Nobody is messaged anywhere.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
let userId = "";
let orgId = 0;
let otherOrgId = 0;
let slug = "";
let jersey: Product;
let cap: Product;
let drop: Drop;
let ip = 0;

const variant = (product: Product, label: string) => product.variants.find((v) => v.label === label)!;
async function stockOf(variantId: number): Promise<number | null> {
  const { data } = await admin.from("product_variants").select("stock").eq("id", variantId).single();
  return data!.stock === null ? null : Number(data!.stock);
}

function post(handler: (request: NextRequest) => Promise<Response>, url: string, body: Record<string, unknown>, cookie?: string) {
  ip += 1;
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-forwarded-for": `10.15.0.${ip}` };
  if (cookie) headers.cookie = cookie;
  return handler(new NextRequest(`https://portpass.test${url}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

function order(items: { variantId: number; qty: number }[], extra: Record<string, unknown> = {}) {
  return { org: slug, drop: drop.slug, items, buyerName: "TEST — delete Buyer", buyerPhone: "242-555-0199", fulfilment: "pickup", paymentMethod: "bank_transfer", ...extra };
}

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `shop-owner-${tag}@test.portpass.local`, email_confirm: true });
  expect(created.error).toBeNull();
  userId = created.data.user!.id;
  await admin.from("profiles").upsert({ user_id: userId, full_name: "TEST — delete shop owner" });

  const business = await createDraftBusiness({ name: `TEST — delete Kit Shop ${tag}`, section: "shop", subcategory: "apparel-merch", ownerUserId: userId, actorUserId: userId });
  orgId = business.id;
  slug = business.slug!;
  // Approved (not yet live) and taking cash and bank transfer, as an owner would have set it up.
  const { error } = await admin
    .from("organizations")
    .update({ status: "approved", payment_methods: ["cash", "bank_transfer"], bank_transfer_details: { bank: "TEST Bank", accountName: "TEST — delete", accountNumber: "000-TEST", branch: "", instructions: "" } })
    .eq("id", orgId);
  expect(error).toBeNull();
  const other = await createDraftBusiness({ name: `TEST — delete Other Shop ${tag}`, section: "shop", subcategory: null, ownerUserId: null, actorUserId: userId });
  otherOrgId = other.id;

  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const prefix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => letters[b % letters.length]).join("");
  await saveShop(orgId, { referencePrefix: prefix, returnsPolicy: "TEST — exchanges within 7 days.", holdHours: 48, isPublished: true }, userId);

  jersey = (await saveProduct(orgId, null, { title: "TEST Home jersey", description: "TEST — delete", priceCents: 6500, photos: [], isPublished: true, usesMarks: false, licenceKind: null, licenceNote: null, variants: [{ id: null, label: "M", stock: 1 }, { id: null, label: "L", stock: 3 }] }, userId)).product;
  cap = (await saveProduct(orgId, null, { title: "TEST Cap", description: "TEST — delete", priceCents: 2500, photos: [], isPublished: true, usesMarks: false, licenceKind: null, licenceNote: null, variants: [{ id: null, label: "One size", stock: null }] }, userId)).product;
  expect(jersey.isPublished).toBe(true);

  drop = await saveDrop(orgId, null, {
    title: "TEST Drop", description: "", heroImageUrl: null,
    opensAt: new Date(Date.now() - 3600_000).toISOString(), closesAt: null, followersFirstUntil: null,
    readyOn: "2026-12-01", pickupNote: "TEST studio", deliveryNote: "", allowPickup: true, allowDelivery: false, deliveryZones: [],
    status: "published", productIds: [jersey.id, cap.id],
  }, userId);
});

afterAll(async () => {
  for (const id of [orgId, otherOrgId].filter(Boolean)) {
    await admin.from("audit_log").delete().eq("organization_id", id);
    const { error } = await admin.from("organizations").delete().eq("id", id);
    expect(error).toBeNull();
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("a shop with only products can go live", () => {
  it("publishing the first product took the approved business live", async () => {
    const { data } = await admin.from("organizations").select("status,is_published").eq("id", orgId).single();
    expect(data).toEqual({ status: "live", is_published: true });
  });
});

describe("reserve", () => {
  let receiptPath = "";

  it("takes the stock, prices from the database and records a PortPass link as the source", async () => {
    const cookie = `${shopAttributionCookie(slug)}=${serializeAttributionCookie({ utmSource: "portpass", utmMedium: "link", utmCampaign: "drop_test", referrerHost: null, viaPortpass: false })}`;
    // A client that tries to send its own price is refused outright (Brief
    // 21, part E: a body may carry only the fields the route reads).
    const priced = await post(reserve, "/api/shop/reservations", order([{ variantId: variant(jersey, "M").id, qty: 1 }], { unitCents: 1 }), cookie);
    expect(priced.status).toBe(400);
    expect(await stockOf(variant(jersey, "M").id)).toBeGreaterThan(0);
    const response = await post(reserve, "/api/shop/reservations", order([{ variantId: variant(jersey, "M").id, qty: 1 }, { variantId: variant(cap, "One size").id, qty: 2 }]), cookie);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { referenceCode: string; receiptUrl: string; holdUntil: string };
    const shop = await getShop(orgId);
    expect(body.referenceCode).toMatch(new RegExp(`^${shop!.referencePrefix}-[A-Z0-9]{6}$`));
    expect(Date.parse(body.holdUntil) - Date.now()).toBeGreaterThan(47 * 3600_000);
    receiptPath = body.receiptUrl;

    expect(await stockOf(variant(jersey, "M").id)).toBe(0);
    expect(await stockOf(variant(cap, "One size").id)).toBeNull();
    const [row] = await listDropReservations(orgId, drop.id);
    expect(row.referenceCode).toBe(body.referenceCode);
    expect(row.totalCents).toBe(6500 + 2 * 2500);
    expect(row.items.map((i) => `${i.title} ${i.label} x${i.qty}`).sort()).toEqual(["TEST Cap One size x2", "TEST Home jersey M x1"]);
    expect(row.source).toBe("portpass");
    expect(row.commissionEligible).toBe(true);
    expect(row.buyerPhone).toBe("+12425550199");
  });

  it("gives the buyer an itemised receipt behind an unguessable link", async () => {
    const token = receiptPath.split("/").pop()!;
    const receipt = await getReceipt(slug, token);
    expect(receipt?.reservation.items).toHaveLength(2);
    expect(receipt?.shop.returnsPolicy).toContain("exchanges");
    expect(await getReceipt(slug, "0".repeat(36))).toBeNull();
    expect(await getReceipt(slug, "not-a-token")).toBeNull();
  });

  it("refuses payment methods the seller doesn't take and prices the buyer didn't see", async () => {
    await admin.from("organizations").update({ payment_methods: ["cash"] }).eq("id", orgId);
    const response = await post(reserve, "/api/shop/reservations", order([{ variantId: variant(jersey, "L").id, qty: 1 }]));
    expect(response.status).toBe(400);
    await admin.from("organizations").update({ payment_methods: ["cash", "bank_transfer"] }).eq("id", orgId);
  });
});

describe("sell out -> waitlist", () => {
  it("answers 409 naming the sold-out size, and never oversells", async () => {
    const response = await post(reserve, "/api/shop/reservations", order([{ variantId: variant(jersey, "M").id, qty: 1 }]));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; soldOut: number[] };
    expect(body.soldOut).toEqual([variant(jersey, "M").id]);
    expect(body.error).toContain("waitlist");
    expect(await stockOf(variant(jersey, "M").id)).toBe(0);
  });

  it("puts the buyer on the waitlist for that size, once", async () => {
    const payload = { org: slug, drop: drop.slug, variantId: variant(jersey, "M").id, name: "TEST — delete Waiter", phone: "242-555-0198" };
    expect((await post(joinWaitlistRoute, "/api/shop/waitlist", payload)).status).toBe(201);
    const again = await post(joinWaitlistRoute, "/api/shop/waitlist", payload);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { already?: boolean }).already).toBe(true);
    const list = await listWaitlist(orgId, drop.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: "M", productTitle: "TEST Home jersey", phone: "+12425550198" });
  });

  it("sends a size that is still in stock back to Reserve", async () => {
    const response = await post(joinWaitlistRoute, "/api/shop/waitlist", { org: slug, drop: drop.slug, variantId: variant(jersey, "L").id, name: "TEST", phone: "242-555-0197" });
    expect(response.status).toBe(409);
  });
});

describe("release unpaid", () => {
  it("returns stock only for unpaid reservations past the hold, and only once", async () => {
    const [res] = await listDropReservations(orgId, drop.id);
    // Not past the hold yet: nothing happens.
    expect(await releaseExpired(orgId, drop.id, [res.id], userId)).toEqual([]);
    await admin.from("reservations").update({ hold_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", res.id);
    expect(await releaseExpired(orgId, drop.id, [res.id], userId)).toEqual([res.referenceCode]);
    expect(await stockOf(variant(jersey, "M").id)).toBe(1);
    expect(await releaseExpired(orgId, drop.id, [res.id], userId)).toEqual([]);
    expect(await stockOf(variant(jersey, "M").id)).toBe(1);
    const [after] = await listDropReservations(orgId, drop.id);
    expect(after.status).toBe("released");
  });

  it("never releases a paid reservation, even past its hold", async () => {
    const response = await post(reserve, "/api/shop/reservations", order([{ variantId: variant(jersey, "L").id, qty: 1 }]));
    expect(response.status).toBe(201);
    const { referenceCode } = (await response.json()) as { referenceCode: string };
    const res = (await listDropReservations(orgId, drop.id)).find((r) => r.referenceCode === referenceCode)!;
    await updateReservation(orgId, res.id, "paid", userId);
    await admin.from("reservations").update({ hold_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", res.id);
    expect(await releaseExpired(orgId, drop.id, [res.id], userId)).toEqual([]);
    expect(await stockOf(variant(jersey, "L").id)).toBe(2);
  });
});

describe("mark paid and collected", () => {
  it("records paid and collected, undoes them, and counts commission only for PortPass-brought paid orders", async () => {
    const response = await post(reserve, "/api/shop/reservations", order([{ variantId: variant(jersey, "L").id, qty: 2 }], { paymentMethod: "cash" }));
    expect(response.status).toBe(201);
    const { referenceCode } = (await response.json()) as { referenceCode: string };
    let res = (await listDropReservations(orgId, drop.id)).find((r) => r.referenceCode === referenceCode)!;
    expect(res.source).toBe("direct");
    expect(await stockOf(variant(jersey, "L").id)).toBe(0);

    res = await updateReservation(orgId, res.id, "paid", userId);
    expect(res.paymentStatus).toBe("paid");
    expect(res.paidAt).not.toBeNull();
    await expect(updateReservation(orgId, res.id, "paid", userId)).rejects.toThrow("CONFLICT");
    res = await updateReservation(orgId, res.id, "collected", userId);
    expect(res.collectedAt).not.toBeNull();
    res = await updateReservation(orgId, res.id, "uncollected", userId);
    expect(res.collectedAt).toBeNull();
    res = await updateReservation(orgId, res.id, "collected", userId);

    const stats = reservationStats(await listDropReservations(orgId, drop.id));
    expect(stats.paid).toBe(2);
    expect(stats.collected).toBe(1);
    expect(stats.revenuePaidCents).toBe(6500 + 13000);
    // The PortPass-brought order was released unpaid, so nothing is commissionable.
    expect(stats.commissionableOrders).toBe(0);

    const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("action", "reservation.paid");
    expect(count).toBe(2);
  });
});

describe("cancel", () => {
  it("gives the stock back, refuses a paid reservation, and only for its own business", async () => {
    const response = await post(reserve, "/api/shop/reservations", order([{ variantId: variant(jersey, "M").id, qty: 1 }]));
    expect(response.status).toBe(201);
    const { referenceCode } = (await response.json()) as { referenceCode: string };
    const res = (await listDropReservations(orgId, drop.id)).find((r) => r.referenceCode === referenceCode)!;
    expect(await stockOf(variant(jersey, "M").id)).toBe(0);

    await expect(updateReservation(otherOrgId, res.id, "cancel", userId)).rejects.toThrow("CONFLICT");
    await expect(updateReservation(otherOrgId, res.id, "paid", userId)).rejects.toThrow("CONFLICT");
    expect(await stockOf(variant(jersey, "M").id)).toBe(0);

    const paid = (await listDropReservations(orgId, drop.id)).find((r) => r.paymentStatus === "paid")!;
    await expect(updateReservation(orgId, paid.id, "cancel", userId)).rejects.toThrow("CONFLICT");

    const cancelled = await updateReservation(orgId, res.id, "cancel", userId);
    expect(cancelled.status).toBe("cancelled");
    expect(await stockOf(variant(jersey, "M").id)).toBe(1);
  });
});

describe("the drop window", () => {
  it("refuses before the opening, and lets the followers' link in during its window", async () => {
    const opensAt = new Date(Date.now() - 3600_000).toISOString();
    const publicOpen = new Date(Date.now() + 3600_000).toISOString();
    drop = await saveDrop(orgId, drop.id, { ...drop, opensAt, followersFirstUntil: publicOpen, closesAt: null, heroImageUrl: null }, userId);
    const items = [{ variantId: variant(cap, "One size").id, qty: 1 }];
    expect((await post(reserve, "/api/shop/reservations", order(items))).status).toBe(409);
    expect((await post(reserve, "/api/shop/reservations", order(items, { key: "wrong" }))).status).toBe(409);
    expect((await post(reserve, "/api/shop/reservations", order(items, { key: drop.followersToken }))).status).toBe(201);

    drop = await saveDrop(orgId, drop.id, { ...drop, status: "closed", heroImageUrl: null }, userId);
    expect((await post(reserve, "/api/shop/reservations", order(items, { key: drop.followersToken }))).status).toBe(409);
  });
});

describe("§5 marks and crests", () => {
  it("keeps a product with another organisation's marks unpublished until a platform owner approves its licence", async () => {
    const input = { title: "TEST Crest jersey", description: "TEST — delete", priceCents: 7000, photos: [], isPublished: true, usesMarks: true, licenceKind: "official_licensed" as const, licenceNote: "TEST — licence letter", variants: [{ id: null, label: "M", stock: 5 }] };
    const first = await saveProduct(orgId, null, input, userId);
    expect(first.blocked).toBe("licence");
    expect(first.product.isPublished).toBe(false);

    // The database refuses it too, whatever the app does.
    const { error } = await admin.from("products").update({ is_published: true }).eq("id", first.product.id);
    expect(error?.code).toBe("23514");

    await setLicenceApproval(first.product.id, true, userId);
    const second = await saveProduct(orgId, first.product.id, { ...input, variants: first.product.variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock })) }, userId);
    expect(second.blocked).toBeNull();
    expect(second.product.isPublished).toBe(true);
    expect(second.product.licenceApprovedAt).not.toBeNull();

    // Changing the licence note withdraws the approval and unpublishes it.
    const third = await saveProduct(orgId, first.product.id, { ...input, licenceNote: "TEST — a different note", variants: second.product.variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock })) }, userId);
    expect(third.product.licenceApprovedAt).toBeNull();
    expect(third.product.isPublished).toBe(false);
    expect(third.blocked).toBe("licence");
  });
});

describe("browsers are kept out", () => {
  it("anon can't read reservations or call the stock functions", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { data } = await anon.from("reservations").select("id").limit(1);
    expect(data ?? []).toEqual([]);
    const { error } = await anon.rpc("shop_release_reservation", { p_id: 1, p_status: "cancelled", p_only_expired: false });
    expect(error).not.toBeNull();
  });
});
