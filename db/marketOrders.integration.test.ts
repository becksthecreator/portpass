import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nassauToday } from "@/lib/futprepTerms";
import { DEFAULT_MARKET_SETTINGS, monthOf, nextMonth, type OrderInput } from "@/lib/market/orders";
import { draftMarketInvoice } from "./billing";
import { getMarketProduct } from "./market";
import { updateReservation } from "./shop";
import { cancelOrder, getOrderOptions, getPublicOrder, getSellerOrder, listSellerOrders, markOrderPaid, marketFeesForMonth, moveOrder, placeMarketOrder, releaseExpiredOrders, runMarketFees } from "./marketOrders";

// PortPass Market orders (brief 25, part C) against the local Supabase
// stack, with a TEST seller and TEST buyers (@example.com, 242-555-01xx),
// all deleted afterwards. Nothing is sent: sendEmail refuses example
// addresses, and no seller email path is called here.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6).replace(/[^a-z0-9]/g, "x");
const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
const prefix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => letters[b % letters.length]).join("");
const actor = { userId: null, name: "TEST seller" };
let orgId = 0;
let slug = "";
let small = 0; // stock 3
let large = 0; // no stock limit
let staffId = ""; // a TEST account for the audit trail's "who"

const buyer = (over: Partial<OrderInput> = {}): OrderInput => ({
  items: [{ variantId: small, qty: 2 }],
  buyerName: "TEST Delete Buyer",
  buyerPhone: "+12425550162",
  buyerEmail: `test-buyer-${tag}@example.com`,
  fulfilment: "pickup",
  zone: null,
  deliveryNote: null,
  paymentMethod: "bank_transfer",
  ...over,
});

async function page() {
  const found = await getMarketProduct(slug, "kit");
  if (!found) throw new Error("the TEST product is not on the Market");
  return found;
}

async function stockOf(variantId: number): Promise<number | null> {
  const { data } = await admin.from("product_variants").select("stock").eq("id", variantId).single();
  return data?.stock ?? null;
}

async function place(over: Partial<OrderInput> = {}, extra: { now?: Date; viaPortpass?: boolean } = {}) {
  const p = await page();
  return placeMarketOrder({ org: p.org, shop: p.shop, product: p.product, drops: p.drops, input: buyer(over), attribution: extra.viaPortpass === false ? null : { utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, viaPortpass: true }, origin: "http://localhost:3000", now: extra.now });
}

beforeAll(async () => {
  const staff = await admin.auth.admin.createUser({ email: `test-delete-orders-staff-${tag}@test.portpass.local`, email_confirm: true });
  if (staff.error || !staff.data.user) throw new Error(`could not create the TEST staff account: ${staff.error?.message}`);
  staffId = staff.data.user.id;
  slug = `test-mkt-orders-${tag}`;
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: `TEST — delete Orders ${tag}`, slug, primary_category: "shop", status: "approved", whatsapp_e164: "+12425550163", primary_contact: "TEST Contact", licences: [{ type: "Business licence", number: `TEST-${tag}` }] })
    .select("id")
    .single();
  if (error || !org) throw new Error(`could not seed the seller: ${error?.message}`);
  orgId = Number(org.id);
  const shop = await admin.from("shops").insert({
    organization_id: orgId,
    reference_prefix: prefix,
    returns_policy: "TEST — 7 days",
    hold_hours: 48,
    is_published: true,
    seller_status: "verified",
    seller_verified_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    seller_plan: "seller",
    seller_plan_since: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    seller_pickup_note: "TEST studio, Saturdays",
    seller_delivery_zones: [{ zone: "Cable Beach", fee_cents: 1500, lead_days: 2 }],
    accepts_cash_on_pickup: true,
  });
  if (shop.error) throw new Error(`could not seed the shop: ${shop.error.message}`);
  const settings = await admin.from("organization_payment_settings").insert({ organization_id: orgId, reference_prefix: `${prefix}P`.slice(0, 4), accepted_methods: ["bank_transfer", "cash"], bank_name: "TEST Bank", account_name: "TEST Seller", account_number_last4: "0000" });
  if (settings.error) throw new Error(`could not seed payment settings: ${settings.error.message}`);
  const { data: product, error: productError } = await admin.from("products").insert({ organization_id: orgId, slug: "kit", title: `TEST Kit ${tag}`, description: "TEST — delete", price_cents: 3500, market_category: "kits-apparel", is_published: false }).select("id").single();
  if (productError || !product) throw new Error(`could not seed the product: ${productError?.message}`);
  const { data: variants, error: variantError } = await admin.from("product_variants").insert([{ product_id: product.id, label: "S", stock: 3, sort_order: 0 }, { product_id: product.id, label: "L", stock: null, sort_order: 1 }]).select("id,label");
  if (variantError || !variants) throw new Error(`could not seed sizes: ${variantError?.message}`);
  small = Number(variants.find((v) => v.label === "S")!.id);
  large = Number(variants.find((v) => v.label === "L")!.id);
  const published = await admin.from("products").update({ is_published: true }).eq("id", product.id);
  if (published.error) throw new Error(`could not publish: ${published.error.message}`);
  const live = await admin.from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", orgId);
  if (live.error) throw new Error(`could not take the seller live: ${live.error.message}`);
});

afterAll(async () => {
  if (!orgId) return;
  const { data: requests } = await admin.from("payment_requests").select("id").eq("organization_id", orgId);
  const requestIds = (requests ?? []).map((r) => r.id);
  if (requestIds.length) await admin.from("payments").delete().in("payment_request_id", requestIds);
  await admin.from("reservations").update({ payment_request_id: null }).eq("organization_id", orgId);
  await admin.from("payment_requests").delete().eq("organization_id", orgId);
  await admin.from("reservations").delete().eq("organization_id", orgId);
  const { data: invoices } = await admin.from("portpass_invoices").select("id").eq("organization_id", orgId);
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  if (invoiceIds.length) await admin.from("portpass_invoices").delete().in("id", invoiceIds);
  await admin.from("organization_payment_settings").delete().eq("organization_id", orgId);
  await admin.from("audit_log").delete().eq("organization_id", orgId);
  await admin.from("organizations").update({ is_published: false }).eq("id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error).toBeNull();
  if (staffId) await admin.auth.admin.deleteUser(staffId);
});

describe("placing an order", () => {
  it("offers pickup (bank or cash) and delivery (bank only) for this seller", async () => {
    const p = await page();
    expect(await getOrderOptions(orgId, p.shop)).toEqual({ pickup: true, delivery: true, methods: { pickup: ["bank_transfer", "cash"], seller_delivery: ["bank_transfer"] }, canOrder: true });
  });

  it("takes the stock, prices from the database, records the source, and makes the seller's payment request", async () => {
    const placed = await place();
    expect(placed.referenceCode.startsWith(`${prefix}-`)).toBe(true);
    expect(placed.totalCents).toBe(7000);
    expect(placed.emailed).toBe(false); // an example address is never emailed
    expect(await stockOf(small)).toBe(1);
    const order = await getSellerOrder(orgId, placed.id);
    expect(order).toMatchObject({ status: "new", paid: false, subtotalCents: 7000, deliveryFeeCents: 0, totalCents: 7000, source: "portpass", broughtByPortpass: true, fulfilment: "pickup" });
    const { data: request } = await admin.from("payment_requests").select("reservation_id,total_cents,methods_allowed,customer_email,status,line_items").eq("id", order!.paymentRequestId!).single();
    expect(request).toMatchObject({ reservation_id: placed.id, total_cents: 7000, methods_allowed: ["bank_transfer"], customer_email: `test-buyer-${tag}@example.com` });
    const { data: lines } = await admin.from("order_items").select("variant_id,qty,unit_cents").eq("reservation_id", placed.id);
    expect(lines).toEqual([{ variant_id: small, qty: 2, unit_cents: 3500 }]);
  });

  it("adds the zone's delivery fee, and refuses cash for a delivery or a zone the seller doesn't serve", async () => {
    const placed = await place({ items: [{ variantId: large, qty: 1 }], fulfilment: "seller_delivery", zone: "Cable Beach" }, { viaPortpass: false });
    const order = await getSellerOrder(orgId, placed.id);
    expect(order).toMatchObject({ subtotalCents: 3500, deliveryFeeCents: 1500, totalCents: 5000, zone: "Cable Beach", source: "direct", broughtByPortpass: false });
    await expect(place({ items: [{ variantId: large, qty: 1 }], fulfilment: "seller_delivery", zone: "Cable Beach", paymentMethod: "cash" })).rejects.toThrow("BAD_METHOD");
    await expect(place({ items: [{ variantId: large, qty: 1 }], fulfilment: "seller_delivery", zone: "Exuma" })).rejects.toThrow("BAD_ZONE");
  });

  it("never sells around a drop: a product in a drop that is coming up is reserved there", async () => {
    const opens = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { data: drop, error } = await admin.from("drops").insert({ organization_id: orgId, slug: `test-drop-${tag}`, title: "TEST — delete drop", opens_at: opens, status: "published", allow_pickup: true }).select("id").single();
    if (error || !drop) throw new Error(`could not seed a drop: ${error?.message}`);
    const { data: product } = await admin.from("products").select("id").eq("organization_id", orgId).eq("slug", "kit").single();
    await admin.from("drop_items").insert({ drop_id: drop.id, product_id: product!.id, sort_order: 0 });
    try {
      await expect(place({ items: [{ variantId: large, qty: 1 }] })).rejects.toThrow("IN_DROP");
    } finally {
      await admin.from("drop_items").delete().eq("drop_id", drop.id);
      await admin.from("drops").delete().eq("id", drop.id);
    }
  });

  it("refuses a size that has run short, and takes nothing", async () => {
    await expect(place({ items: [{ variantId: small, qty: 2 }] })).rejects.toThrow(/SOLD_OUT/);
    expect(await stockOf(small)).toBe(1);
  });
});

describe("the buyer's page", () => {
  it("shows the order by its code, without the buyer's phone or email", async () => {
    const [first] = (await listSellerOrders(orgId)).filter((o) => o.fulfilment === "pickup");
    const view = await getPublicOrder(first.referenceCode);
    expect(view).toMatchObject({ referenceCode: first.referenceCode, status: "new", paid: false });
    expect(view?.payReference).toBeTruthy();
    const text = JSON.stringify(view);
    expect(text).not.toContain("+12425550162"); // the buyer's number
    expect(text).not.toContain("example.com"); // the buyer's email
    expect(text).not.toContain("Buyer"); // the buyer's name
    expect(text).not.toMatch(/[a-f0-9]{40}/); // no payment page token
    expect(await getPublicOrder("ZZZ-ZZZZZZ")).toBeNull();
  });
});

describe("the seller's steps", () => {
  it("moves an order forward, never back, and records Paid on its payment request", async () => {
    const [order] = (await listSellerOrders(orgId)).filter((o) => o.fulfilment === "pickup" && o.status === "new");
    expect((await moveOrder(orgId, order.id, "confirm", staffId)).status).toBe("confirmed");
    expect((await moveOrder(orgId, order.id, "ready", staffId)).status).toBe("ready");
    await expect(moveOrder(orgId, order.id, "confirm", staffId)).rejects.toThrow("CONFLICT");
    const paid = await markOrderPaid(orgId, order.id, actor);
    expect(paid.paid).toBe(true);
    const { data: request } = await admin.from("payment_requests").select("status,paid_cents").eq("id", order.paymentRequestId!).single();
    expect(request).toEqual({ status: "paid", paid_cents: 7000 });
    await expect(markOrderPaid(orgId, order.id, actor)).rejects.toThrow("ALREADY_PAID");
    await expect(cancelOrder(orgId, order.id, actor)).rejects.toThrow("HAS_PAYMENTS");
    expect((await moveOrder(orgId, order.id, "collected", staffId)).status).toBe("collected");
    expect((await getPublicOrder(order.referenceCode))?.paid).toBe(true);
  });

  it("cancels an unpaid order: its stock goes back and its payment request is voided", async () => {
    const placed = await place({ items: [{ variantId: small, qty: 1 }] });
    expect(await stockOf(small)).toBe(0);
    const cancelled = await cancelOrder(orgId, placed.id, actor);
    expect(cancelled.status).toBe("cancelled");
    expect(await stockOf(small)).toBe(1);
    const { data: request } = await admin.from("payment_requests").select("status").eq("id", cancelled.paymentRequestId!).single();
    expect(request?.status).toBe("void");
    const { data: row } = await admin.from("reservations").select("status,order_status").eq("id", placed.id).single();
    expect(row).toEqual({ status: "cancelled", order_status: "cancelled" });
  });

  it("releases an unpaid order past its hold only when the seller confirms it", async () => {
    const placed = await place({ items: [{ variantId: small, qty: 1 }] }, { now: new Date(Date.now() - 3 * 86_400_000) });
    const fresh = await place({ items: [{ variantId: large, qty: 1 }] });
    const released = await releaseExpiredOrders(orgId, [placed.id, fresh.id], actor);
    expect(released).toEqual([placed.referenceCode]);
    expect(await stockOf(small)).toBe(1);
    expect((await getSellerOrder(orgId, placed.id))?.status).toBe("cancelled");
    expect((await getSellerOrder(orgId, fresh.id))?.status).toBe("new");
  });

  it("is out of reach of Drops' reservation buttons, so Paid and Cancel always go through the payment request", async () => {
    const [order] = (await listSellerOrders(orgId)).filter((o) => o.status === "new" && !o.paid);
    for (const action of ["paid", "cancel", "collected"] as const) {
      await expect(updateReservation(orgId, order.id, action, staffId)).rejects.toThrow("CONFLICT");
    }
    expect((await getSellerOrder(orgId, order.id))).toMatchObject({ status: "new", paid: false });
  });

  it("keeps another business's orders out of reach", async () => {
    const [order] = await listSellerOrders(orgId);
    expect(await getSellerOrder(orgId + 1_000_000, order.id)).toBeNull();
    await expect(moveOrder(orgId + 1_000_000, order.id, "confirm", staffId)).rejects.toThrow("NOT_FOUND");
  });
});

describe("one buyer's open orders", () => {
  it("lets a buyer hold at most three unpaid orders with one seller", async () => {
    const open = (await listSellerOrders(orgId)).filter((o) => o.status !== "cancelled" && !o.paid).length;
    for (let i = open; i < 3; i += 1) await place({ items: [{ variantId: large, qty: 1 }] });
    await expect(place({ items: [{ variantId: large, qty: 1 }] })).rejects.toThrow("TOO_MANY_OPEN");
    // Another buyer is not held back.
    await expect(place({ items: [{ variantId: large, qty: 1 }], buyerEmail: `test-other-buyer-${tag}@example.com`, buyerPhone: "+12425550164" })).resolves.toMatchObject({ totalCents: 3500 });
  });
});

describe("PortPass's Market fees", () => {
  it("works out the Seller plan and the commission on goods PortPass brought and the seller marked paid this month", async () => {
    const month = monthOf(nassauToday());
    const row = (await marketFeesForMonth(month, DEFAULT_MARKET_SETTINGS)).find((r) => r.organizationId === orgId);
    // The one paid order: $70 of goods, brought by PortPass.
    expect(row?.onSellerPlan).toBe(true);
    expect(row?.fees).toEqual({ planCents: 2900, commissionBaseCents: 7000, commissionCents: 560, orders: 1, totalCents: 3460 });
  });

  it("only logs while fees are off (a dry run), and drafts one Market invoice a seller a month, never two", async () => {
    const { data: settings } = await admin.from("market_settings").select("fees_live").eq("id", true).single();
    if (!settings?.fees_live) {
      const run = await runMarketFees(nassauToday());
      expect(run).toMatchObject({ dryRun: true, drafted: 0 });
    }
    const lines = [{ description: "TEST — delete Seller plan", amountCents: 2900, source: "plan" as const }];
    const first = await draftMarketInvoice({ organizationId: orgId, periodStart: "2026-01-01", periodEnd: "2026-01-31", issuedOn: nassauToday(), lines });
    const second = await draftMarketInvoice({ organizationId: orgId, periodStart: "2026-01-01", periodEnd: "2026-01-31", issuedOn: nassauToday(), lines });
    expect(first).toBeGreaterThan(0);
    expect(second).toBeNull();
    const { data: invoice } = await admin.from("portpass_invoices").select("kind,status,total_cents").eq("id", first!).single();
    expect(invoice).toEqual({ kind: "market", status: "draft", total_cents: 2900 });
  });

  it("once fees are on, charges each order once: the next run never bills it again", async () => {
    const month = monthOf(nassauToday());
    const live = { ...DEFAULT_MARKET_SETTINGS, feesLive: true, feesLiveSince: `${month}-01` };
    // The run on the 1st of next month drafts this month's fees.
    const run = await runMarketFees(`${nextMonth(month)}-01`, { settings: live });
    expect(run.dryRun).toBe(false);
    const { data: invoices } = await admin.from("portpass_invoices").select("id,total_cents,period_start").eq("organization_id", orgId).eq("kind", "market").eq("period_start", `${month}-01`);
    expect(invoices).toHaveLength(1);
    expect(invoices![0].total_cents).toBe(3460);
    const { data: charged } = await admin.from("reservations").select("reference_code").eq("organization_id", orgId).eq("market_invoice_id", invoices![0].id);
    expect(charged).toHaveLength(1);
    // Asked again (the next day), the commission is not counted twice.
    const again = (await marketFeesForMonth(month, live)).find((r) => r.organizationId === orgId);
    expect(again?.fees.commissionCents).toBe(0);
    await runMarketFees(`${nextMonth(month)}-02`, { settings: live });
    const { count } = await admin.from("portpass_invoices").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("kind", "market").eq("period_start", `${month}-01`);
    expect(count).toBe(1);
  });
});
