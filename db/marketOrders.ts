import { randomBytes } from "node:crypto";
import type { Attribution } from "@/lib/attribution";
import { nassauLocalToIso, nassauToday } from "@/lib/futprepTerms";
import { buyerOrderEmail, sellerOrderEmail } from "@/lib/market/orderEmail";
import {
  actionTarget,
  allowedFrom,
  canMoveTo,
  DEFAULT_MARKET_SETTINGS,
  feeLines,
  invoicesMonth,
  isOrderStatus,
  monthBounds,
  monthFees,
  monthOf,
  nextMonth,
  orderOptions,
  orderPastHold,
  previousMonth,
  priceMarketOrder,
  requestLines,
  type CommissionableOrder,
  type ListedOrder,
  type MarketSettings,
  type MarketSettingsInput,
  type OrderAction,
  type OrderInput,
  type OrderOptions,
  type OrderStatus,
  type SellerMonthFees,
} from "@/lib/market/orders";
import { viaPortpassFrom } from "@/lib/paymentRequests/email";
import { balanceCents, defaultPrefix, methodsSetUp, payPath } from "@/lib/paymentRequests/rules";
import { holdUntil, makeReferenceCode, resolveShopSource, whatsappHref, type CatalogueVariant, type Fulfilment, type ReservationItem, type ShopPaymentMethod, type ShopSource } from "@/lib/shop/rules";
import { sendEmail } from "@/lib/email";
import { logAudit } from "./audit";
import { draftMarketInvoice, listInvoices, type StoredInvoice } from "./billing";
import { getBusiness, listOwnerEmails, type Business } from "./business";
import { demoOrganizationIdOrNull } from "./demo";
import { createPaymentRequest, getPaymentRequest, getPaymentSettings, markPaymentRequestSent, recordRequestPayment, voidPaymentRequest, type Actor } from "./paymentRequests";
import { getShop, type Product, type Shop } from "./shop";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// PortPass Market orders (brief 25, part C). An order is a reservation of
// kind 'order' (202610200003_market_orders.sql): the stock functions, the
// payment request link and the Drops admin are brief 15's, unchanged.
//
// PortPass never holds money. Every order gets a payment request from the
// seller to the buyer (brief 17); the buyer pays the seller directly and
// the seller marks it paid, which records the payment on that request.
// Nothing here messages a buyer except the one email their own "Place
// order" asks for, and releasing an unpaid order is always the seller's
// confirmed choice.
//
// Every seller-side function takes the organization id its caller has
// already checked (requireOrgRole) and only reads or writes that
// business's orders. The buyer's page reads one order by its code and
// never shows the buyer's phone or email.

const db = () => getSupabaseAdmin();

// Who did it, in a payment request's history, when nobody signed in did:
// the buyer's own order.
export const MARKET_ACTOR: Actor = { userId: null, name: "PortPass Market order" };

const ORDER_COLUMNS =
  "id,organization_id,reference_code,buyer_name,buyer_phone,buyer_email,items,subtotal_cents,delivery_fee_cents,total_cents,payment_method,payment_status,status,order_status,fulfilment,zone,delivery_note,hold_until,source,commission_eligible,payment_request_id,created_at,confirmed_at,ready_at,paid_at,delivered_at,collected_at,cancelled_at";

function toItems(value: unknown): ReservationItem[] {
  return (Array.isArray(value) ? (value as Record<string, unknown>[]) : []).map((item) => ({
    variantId: Number(item.variantId),
    productId: Number(item.productId),
    title: String(item.title ?? ""),
    label: String(item.label ?? ""),
    qty: Number(item.qty),
    unitCents: Number(item.unitCents),
  }));
}

function toOrder(row: Record<string, unknown>): ListedOrder {
  const stamp = (key: string) => (row[key] as string | null) ?? null;
  return {
    id: Number(row.id),
    referenceCode: row.reference_code as string,
    buyerName: row.buyer_name as string,
    buyerPhone: row.buyer_phone as string,
    buyerEmail: (row.buyer_email as string | null) ?? null,
    items: toItems(row.items),
    subtotalCents: Number(row.subtotal_cents ?? 0),
    deliveryFeeCents: Number(row.delivery_fee_cents ?? 0),
    totalCents: Number(row.total_cents),
    paymentMethod: row.payment_method as ShopPaymentMethod,
    paid: row.payment_status === "paid",
    paidAt: stamp("paid_at"),
    // A released or cancelled reservation is a cancelled order whatever its
    // step said (the database keeps the two in step; this is the backstop).
    status: row.status !== "active" ? "cancelled" : isOrderStatus(row.order_status) ? row.order_status : "new",
    fulfilment: row.fulfilment as Fulfilment,
    zone: (row.zone as string | null) ?? null,
    deliveryNote: (row.delivery_note as string | null) ?? null,
    holdUntil: row.hold_until as string,
    source: row.source as ShopSource,
    broughtByPortpass: Boolean(row.commission_eligible),
    paymentRequestId: row.payment_request_id === null || row.payment_request_id === undefined ? null : Number(row.payment_request_id),
    createdAt: row.created_at as string,
    confirmedAt: stamp("confirmed_at"),
    readyAt: stamp("ready_at"),
    collectedAt: stamp("collected_at"),
    deliveredAt: stamp("delivered_at"),
    cancelledAt: stamp("cancelled_at"),
  };
}

// ---- what a seller can take ----------------------------------------------------

export async function getOrderOptions(orgId: number, shop: Shop): Promise<OrderOptions> {
  const settings = await getPaymentSettings(orgId);
  return orderOptions({ pickupNote: shop.sellerPickupNote, zones: shop.sellerDeliveryZones, bankReady: methodsSetUp(settings).includes("bank_transfer"), cashOnPickup: shop.acceptsCashOnPickup });
}

// ---- placing an order ---------------------------------------------------------------

export type PlaceOrder = {
  org: Business;
  shop: Shop;
  product: Product;
  input: OrderInput;
  attribution: Attribution | null;
  // https://portpassbahamas.com (or the preview's own address), for the links in the emails.
  origin: string;
  now?: Date;
};

export type PlacedOrder = { id: number; referenceCode: string; holdUntil: string; totalCents: number; emailed: boolean };

// Errors the route turns into words: NOT_ORDERABLE, BAD_FULFILMENT,
// BAD_ZONE, BAD_METHOD, PRICE:<message>, SOLD_OUT:<variant ids>,
// UNKNOWN_VARIANT. The caller has already loaded the product through the
// market_products view, so the seller is verified, its shop open and the
// business not the demo.
export async function placeMarketOrder(p: PlaceOrder): Promise<PlacedOrder> {
  const { org, shop, product, input } = p;
  const now = p.now ?? new Date();
  const options = await getOrderOptions(org.id, shop);
  if (!options.canOrder) throw new Error("NOT_ORDERABLE");
  if ((input.fulfilment === "pickup" && !options.pickup) || (input.fulfilment === "seller_delivery" && !options.delivery)) throw new Error("BAD_FULFILMENT");
  const zone = input.fulfilment === "seller_delivery" ? (shop.sellerDeliveryZones.find((z) => z.zone === input.zone) ?? null) : null;
  if (input.fulfilment === "seller_delivery" && !zone) throw new Error("BAD_ZONE");
  if (!options.methods[input.fulfilment].includes(input.paymentMethod)) throw new Error("BAD_METHOD");

  // Prices from the database, never from the form.
  const catalogue = new Map<number, CatalogueVariant>();
  for (const variant of product.variants) {
    catalogue.set(variant.id, { variantId: variant.id, productId: product.id, title: product.title, label: variant.label, unitCents: product.priceCents, stock: variant.stock });
  }
  const priced = priceMarketOrder(input.items, catalogue, zone);
  if (!priced.ok) throw new Error(priced.soldOut?.length ? `SOLD_OUT:${priced.soldOut.join(",")}` : `PRICE:${priced.error}`);
  if (priced.totalCents <= 0) throw new Error("NOT_ORDERABLE");

  const source = resolveShopSource(p.attribution);
  const hold = holdUntil(now, shop.holdHours).toISOString();
  let created: { id: number; referenceCode: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const referenceCode = makeReferenceCode(shop.referencePrefix, randomBytes(6));
    const { data, error } = await db().rpc("market_create_order", {
      p: {
        reference_code: referenceCode,
        // The column is shared with Drops' receipts; an order is read by its code.
        receipt_token: randomBytes(18).toString("hex"),
        organization_id: org.id,
        buyer_name: input.buyerName,
        buyer_phone: input.buyerPhone,
        buyer_email: input.buyerEmail,
        items: priced.items,
        subtotal_cents: priced.subtotalCents,
        delivery_fee_cents: priced.deliveryFeeCents,
        total_cents: priced.totalCents,
        payment_method: input.paymentMethod,
        fulfilment: input.fulfilment,
        zone: zone?.zone ?? "",
        delivery_note: input.deliveryNote ?? "",
        hold_until: hold,
        source: source.source,
        utm_source: p.attribution?.utmSource ?? null,
        utm_medium: p.attribution?.utmMedium ?? null,
        utm_campaign: p.attribution?.utmCampaign ?? null,
        referrer_host: p.attribution?.referrerHost ?? null,
        commission_eligible: source.commissionEligible,
        commission_reason: source.reason,
      },
    });
    if (!error) {
      created = { id: Number((data as { id: number }).id), referenceCode };
      break;
    }
    if (error.code === "23505") continue; // a code collision: draw again
    const soldOut = /SOLD_OUT:(\d+)/.exec(error.message ?? "");
    if (soldOut) throw new Error(`SOLD_OUT:${soldOut[1]}`);
    if ((error.message ?? "").includes("UNKNOWN_VARIANT")) throw new Error("UNKNOWN_VARIANT");
    throwIfSupabaseError(error, "Could not save the order");
  }
  if (!created) throw new Error("Could not draw a free order code");

  // The payment request: what the buyer owes the seller and how to pay.
  // Without one the order cannot stand, so it is undone (stock back).
  const settings = await getPaymentSettings(org.id);
  let request: Awaited<ReturnType<typeof createPaymentRequest>>;
  try {
    request = await createPaymentRequest(
      org.id,
      {
        customerName: input.buyerName,
        customerEmail: input.buyerEmail,
        customerPhone: input.buyerPhone,
        personId: null,
        lines: requestLines(priced.items, priced.deliveryFeeCents, zone?.zone ?? null),
        totalCents: priced.totalCents,
        dueDate: nassauToday(new Date(hold)),
        allowPartPayment: false,
        methods: [input.paymentMethod],
        offeringId: null,
        registrationId: null,
        privateSessionRequestId: null,
        reservationId: created.id,
      },
      MARKET_ACTOR,
      settings?.referencePrefix ?? defaultPrefix(org.name),
    );
    const { error } = await db().from("reservations").update({ payment_request_id: request.id }).eq("id", created.id).eq("organization_id", org.id);
    throwIfSupabaseError(error, "Could not link the payment request");
  } catch (error) {
    await db().rpc("shop_release_reservation", { p_id: created.id, p_status: "cancelled", p_only_expired: false });
    throw error;
  }

  await logAudit({ actorUserId: null, organizationId: org.id, action: "market.order.placed", targetTable: "reservations", targetId: created.id, after: { reference: created.referenceCode, total_cents: priced.totalCents, source: source.source, payment_request: request.referenceCode } });

  // The buyer's email: their code, how to pay, where to follow it. The
  // request counts as sent only if it went.
  const orderUrl = `${p.origin}/order/${created.referenceCode}`;
  const sellerWhatsappUrl = org.whatsappE164 ? whatsappHref(org.whatsappE164, `Hi ${org.name}, about my PortPass order ${created.referenceCode}: `) : null;
  const buyer = buyerOrderEmail({
    sellerName: org.name,
    buyerName: input.buyerName,
    referenceCode: created.referenceCode,
    items: priced.items,
    subtotalCents: priced.subtotalCents,
    deliveryFeeCents: priced.deliveryFeeCents,
    totalCents: priced.totalCents,
    fulfilment: input.fulfilment,
    zone: zone?.zone ?? null,
    pickupNote: shop.sellerPickupNote,
    paymentMethod: input.paymentMethod,
    holdUntil: hold,
    orderUrl,
    payUrl: `${p.origin}${payPath(request.publicToken)}`,
    payReference: request.referenceCode,
    sellerWhatsappUrl,
  });
  const outcome = await sendEmail({ to: input.buyerEmail, subject: buyer.subject, html: buyer.html, from: viaPortpassFrom(org.name), log: { template: "market_order_placed", organizationId: org.id } }).catch(() => "failed" as const);
  if (outcome === "sent") await markPaymentRequestSent(org.id, request.id, "email", MARKET_ACTOR).catch((error) => console.error("market order: mark sent", error instanceof Error ? error.message : ""));
  return { id: created.id, referenceCode: created.referenceCode, holdUntil: hold, totalCents: priced.totalCents, emailed: outcome === "sent" };
}

// The seller's owners hear about a new order (after the buyer has their
// answer). The buyer's name only; their contact details are on the orders
// page behind the seller's sign-in.
export async function tellSellerAboutOrder(orgId: number, orderId: number, origin: string): Promise<void> {
  const [org, order] = await Promise.all([getBusiness(orgId), getSellerOrder(orgId, orderId)]);
  if (!org || !order || !org.slug) return;
  const email = sellerOrderEmail({
    sellerName: org.name,
    buyerName: order.buyerName,
    referenceCode: order.referenceCode,
    items: order.items,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    zone: order.zone,
    fulfilment: order.fulfilment,
    paymentMethod: order.paymentMethod,
    broughtByPortpass: order.broughtByPortpass,
    ordersUrl: `${origin}/business/${org.slug}/shop/orders`,
  });
  for (const to of await listOwnerEmails(orgId)) {
    await sendEmail({ to, subject: email.subject, html: email.html, from: viaPortpassFrom(org.name), log: { template: "market_order_new_for_seller", organizationId: orgId } });
  }
}

// ---- the buyer's page ------------------------------------------------------------------

export type PublicOrder = {
  referenceCode: string;
  buyerFirstName: string;
  items: ReservationItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  fulfilment: Fulfilment;
  zone: string | null;
  paymentMethod: ShopPaymentMethod;
  paid: boolean;
  status: OrderStatus;
  holdUntil: string;
  createdAt: string;
  seller: { name: string; slug: string | null; whatsappE164: string | null; phoneE164: string | null; publicEmail: string | null; logoUrl: string | null; brandColor: string | null; pickupNote: string; verified: boolean };
  // The seller's payment request for it: the page links to how to pay.
  pay: { token: string; referenceCode: string } | null;
};

// By its code only. What a buyer may see: the seller, what was ordered,
// where it is and how to pay. Never the buyer's phone or email (a code can
// be forwarded), never anything from the seller's side.
export async function getPublicOrder(code: string): Promise<PublicOrder | null> {
  const { data, error } = await db().from("reservations").select(ORDER_COLUMNS).eq("reference_code", code).eq("kind", "order").maybeSingle();
  throwIfSupabaseError(error, "Could not load the order");
  if (!data) return null;
  const orgId = Number(data.organization_id);
  if (orgId === (await demoOrganizationIdOrNull())) return null;
  const order = toOrder(data);
  const [org, shop, request] = await Promise.all([
    getBusiness(orgId),
    getShop(orgId),
    order.paymentRequestId ? db().from("payment_requests").select("public_token,reference_code,status").eq("id", order.paymentRequestId).eq("organization_id", orgId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  throwIfSupabaseError(request.error, "Could not load the payment request");
  if (!org) return null;
  const req = request.data as { public_token: string; reference_code: string; status: string } | null;
  return {
    referenceCode: order.referenceCode,
    buyerFirstName: order.buyerName.trim().split(/\s+/)[0] ?? "",
    items: order.items,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    fulfilment: order.fulfilment,
    zone: order.zone,
    paymentMethod: order.paymentMethod,
    paid: order.paid,
    status: order.status,
    holdUntil: order.holdUntil,
    createdAt: order.createdAt,
    seller: { name: org.name, slug: org.slug, whatsappE164: org.whatsappE164, phoneE164: org.phoneE164, publicEmail: org.publicEmail, logoUrl: org.logoUrl, brandColor: org.brandColor, pickupNote: shop?.sellerPickupNote ?? "", verified: shop?.sellerStatus === "verified" },
    pay: req && req.status !== "void" ? { token: req.public_token, referenceCode: req.reference_code } : null,
  };
}

// ---- the seller's orders ---------------------------------------------------------------

// Newest first; the 2,000 most recent (PostgREST answers 1,000 a page).
export async function listSellerOrders(orgId: number): Promise<ListedOrder[]> {
  const out: ListedOrder[] = [];
  for (let from = 0; from < 2000; from += 1000) {
    const { data, error } = await db().from("reservations").select(ORDER_COLUMNS).eq("organization_id", orgId).eq("kind", "order").order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + 999);
    throwIfSupabaseError(error, "Could not load the orders");
    out.push(...(data ?? []).map(toOrder));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function getSellerOrder(orgId: number, orderId: number): Promise<ListedOrder | null> {
  const { data, error } = await db().from("reservations").select(ORDER_COLUMNS).eq("id", orderId).eq("organization_id", orgId).eq("kind", "order").maybeSingle();
  throwIfSupabaseError(error, "Could not load the order");
  return data ? toOrder(data) : null;
}

const STEP_STAMP: Partial<Record<OrderStatus, string>> = { confirmed: "confirmed_at", ready: "ready_at", delivered: "delivered_at", collected: "collected_at" };

// One step on the seller's list: Confirm, Preparing, Ready, Out for
// delivery, Delivered, Collected. The update repeats the "from" condition,
// so two phones tapping at once can't both win (CONFLICT).
export async function moveOrder(orgId: number, orderId: number, action: Exclude<OrderAction, "paid" | "cancel">, actorUserId: string): Promise<ListedOrder> {
  const order = await getSellerOrder(orgId, orderId);
  if (!order) throw new Error("NOT_FOUND");
  const target = actionTarget(action);
  if (!target || !canMoveTo(order.status, target, order.fulfilment, order.paid)) throw new Error("CONFLICT");
  const now = new Date().toISOString();
  const stamp = STEP_STAMP[target];
  const { data, error } = await db()
    .from("reservations")
    .update({ order_status: target, updated_at: now, ...(stamp ? { [stamp]: now } : {}) })
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .eq("kind", "order")
    .eq("status", "active")
    .in("order_status", allowedFrom(target, order.fulfilment))
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not update the order");
  if (!data) throw new Error("CONFLICT");
  await logAudit({ actorUserId, organizationId: orgId, action: `market.order.${action}`, targetTable: "reservations", targetId: orderId, before: { status: order.status }, after: { reference: order.referenceCode, status: target } });
  return (await getSellerOrder(orgId, orderId))!;
}

// "Paid": the money reached the seller. It is recorded on the order's
// payment request (the full balance, by the method the buyer chose), which
// keeps the order's payment status in step (brief 17's syncLinkedRecord).
// ALREADY_PAID, CANCELLED.
export async function markOrderPaid(orgId: number, orderId: number, actor: Actor): Promise<ListedOrder> {
  const order = await getSellerOrder(orgId, orderId);
  if (!order) throw new Error("NOT_FOUND");
  if (order.status === "cancelled") throw new Error("CANCELLED");
  if (order.paid) throw new Error("ALREADY_PAID");
  const found = order.paymentRequestId ? await getPaymentRequest(orgId, order.paymentRequestId) : null;
  if (found && found.request.status !== "void") {
    const balance = balanceCents(found.request);
    if (balance > 0) {
      await recordRequestPayment(orgId, found.request.id, { amountCents: balance, method: order.paymentMethod, receivedAt: new Date().toISOString(), reference: order.referenceCode, note: "Marked paid from the Market orders list." }, actor);
    }
  }
  // An order without a live request (none could be made, or it was voided
  // on the payments screen) is marked on the order itself.
  const now = new Date().toISOString();
  const { error } = await db().from("reservations").update({ payment_status: "paid", paid_at: now, updated_at: now }).eq("id", orderId).eq("organization_id", orgId).eq("status", "active").eq("payment_status", "pending");
  throwIfSupabaseError(error, "Could not mark the order paid");
  const updated = (await getSellerOrder(orgId, orderId))!;
  await logAudit({ actorUserId: actor.userId, organizationId: orgId, action: "market.order.paid", targetTable: "reservations", targetId: orderId, after: { reference: order.referenceCode, total_cents: order.totalCents, paid: updated.paid } });
  return updated;
}

// Cancel an order nothing has been paid on: the stock goes back (brief 15's
// shop_release_reservation) and its payment request is voided. Nobody is
// messaged. A payment recorded on the request must be refunded there first.
// HAS_PAYMENTS, CONFLICT.
export async function cancelOrder(orgId: number, orderId: number, actor: Actor): Promise<ListedOrder> {
  const order = await getSellerOrder(orgId, orderId);
  if (!order) throw new Error("NOT_FOUND");
  if (order.paid) throw new Error("HAS_PAYMENTS");
  if (!canMoveTo(order.status, "cancelled", order.fulfilment, order.paid)) throw new Error("CONFLICT");
  const found = order.paymentRequestId ? await getPaymentRequest(orgId, order.paymentRequestId) : null;
  if (found && found.request.paidCents > 0) throw new Error("HAS_PAYMENTS");
  const { data, error } = await db().rpc("shop_release_reservation", { p_id: orderId, p_status: "cancelled", p_only_expired: false });
  throwIfSupabaseError(error, "Could not cancel the order");
  if (!data) throw new Error("CONFLICT");
  await voidRequestFor(orgId, found?.request.id ?? null, "The order was cancelled.", actor);
  await logAudit({ actorUserId: actor.userId, organizationId: orgId, action: "market.order.cancel", targetTable: "reservations", targetId: orderId, before: { status: order.status }, after: { reference: order.referenceCode, status: "cancelled" } });
  return (await getSellerOrder(orgId, orderId))!;
}

async function voidRequestFor(orgId: number, requestId: number | null, reason: string, actor: Actor): Promise<void> {
  if (!requestId) return;
  try {
    await voidPaymentRequest(orgId, requestId, reason, actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message !== "VOID" && message !== "HAS_PAYMENTS") throw error;
  }
}

// "Release now?": the seller confirmed these unpaid orders past their hold.
// Each is re-checked in the database (still unpaid, still past its hold)
// as it is released. Nobody is messaged.
export async function releaseExpiredOrders(orgId: number, ids: number[], actor: Actor): Promise<string[]> {
  const wanted = new Set(ids);
  const now = new Date();
  const candidates = (await listSellerOrders(orgId)).filter((order) => wanted.has(order.id) && orderPastHold(order, now));
  const released: string[] = [];
  for (const order of candidates) {
    const found = order.paymentRequestId ? await getPaymentRequest(orgId, order.paymentRequestId) : null;
    if (found && found.request.paidCents > 0) continue;
    const { data, error } = await db().rpc("shop_release_reservation", { p_id: order.id, p_status: "released", p_only_expired: true });
    throwIfSupabaseError(error, "Could not release the order");
    if (!data) continue;
    await voidRequestFor(orgId, found?.request.id ?? null, "Not paid within the hold; the seller released the order.", actor);
    released.push(order.referenceCode);
  }
  if (released.length) await logAudit({ actorUserId: actor.userId, organizationId: orgId, action: "market.order.released_unpaid", targetTable: "reservations", targetId: null, after: { references: released } });
  return released;
}

// ---- PortPass's Market fees ------------------------------------------------------------

function toSettings(row: Record<string, unknown> | null): MarketSettings {
  if (!row) return DEFAULT_MARKET_SETTINGS;
  return { sellerPlanCents: Number(row.seller_plan_cents), commissionBps: Number(row.commission_bps), feesLive: Boolean(row.fees_live), feesLiveSince: (row.fees_live_since as string | null) ?? null };
}

export async function getMarketSettings(): Promise<MarketSettings> {
  const { data, error } = await db().from("market_settings").select("seller_plan_cents,commission_bps,fees_live,fees_live_since").eq("id", true).maybeSingle();
  throwIfSupabaseError(error, "Could not load the Market settings");
  return toSettings(data);
}

// Platform owners only (the route checks). Switching fees on records the
// day, so the first month invoiced is this one, never the months before.
export async function saveMarketSettings(input: MarketSettingsInput, actorUserId: string, today: string = nassauToday()): Promise<MarketSettings> {
  const before = await getMarketSettings();
  const feesLiveSince = input.feesLive ? (before.feesLive ? before.feesLiveSince : today) : null;
  const { data, error } = await db()
    .from("market_settings")
    .upsert({ id: true, seller_plan_cents: input.sellerPlanCents, commission_bps: input.commissionBps, fees_live: input.feesLive, fees_live_since: feesLiveSince, updated_at: new Date().toISOString(), updated_by: actorUserId })
    .select("seller_plan_cents,commission_bps,fees_live,fees_live_since")
    .single();
  throwIfSupabaseError(error, "Could not save the Market settings");
  const after = toSettings(data);
  await logAudit({ actorUserId, organizationId: null, action: "market.settings.saved", targetTable: "market_settings", targetId: null, before, after });
  return after;
}

export type SellerFees = { organizationId: number; name: string; slug: string | null; onSellerPlan: boolean; fees: SellerMonthFees; orders: CommissionableOrder[] };

// Nassau midnight at the start of a day, as an instant.
function dayStartIso(day: string): string {
  return nassauLocalToIso(`${day}T00:00`) ?? `${day}T05:00:00.000Z`;
}

// What each seller owes PortPass for a month: the Seller plan (on the plan,
// verified, and verified before the month was out) and the commission on
// orders PortPass brought that were paid during the month (Nassau time).
// Never the demo.
export async function marketFeesForMonth(month: string, settings: MarketSettings): Promise<SellerFees[]> {
  const demoId = await demoOrganizationIdOrNull();
  const from = dayStartIso(monthBounds(month).start);
  const until = dayStartIso(monthBounds(nextMonth(month)).start);
  const [{ data: plans, error: plansError }, { data: paid, error: paidError }] = await Promise.all([
    db().from("shops").select("organization_id").eq("seller_plan", "seller").eq("seller_status", "verified").lt("seller_verified_at", until).limit(1000),
    db().from("reservations").select("organization_id,reference_code,paid_at,subtotal_cents,total_cents,buyer_name").eq("kind", "order").eq("commission_eligible", true).eq("payment_status", "paid").gte("paid_at", from).lt("paid_at", until).order("paid_at", { ascending: true }).limit(10000),
  ]);
  throwIfSupabaseError(plansError, "Could not load the Seller plans");
  throwIfSupabaseError(paidError, "Could not load the paid orders");
  const onPlan = new Set((plans ?? []).map((row) => Number(row.organization_id)));
  const ordersBy = new Map<number, CommissionableOrder[]>();
  for (const row of paid ?? []) {
    const orgId = Number(row.organization_id);
    const list = ordersBy.get(orgId) ?? [];
    list.push({ referenceCode: row.reference_code as string, paidAt: row.paid_at as string, subtotalCents: Number(row.subtotal_cents ?? 0), totalCents: Number(row.total_cents), buyerName: row.buyer_name as string });
    ordersBy.set(orgId, list);
  }
  const ids = Array.from(new Set([...onPlan, ...ordersBy.keys()])).filter((id) => id !== demoId);
  if (!ids.length) return [];
  const { data: orgs, error: orgsError } = await db().from("organizations").select("id,name,slug,is_demo").in("id", ids);
  throwIfSupabaseError(orgsError, "Could not load the sellers");
  return (orgs ?? [])
    .filter((org) => !org.is_demo)
    .map((org) => {
      const orgId = Number(org.id);
      const orders = ordersBy.get(orgId) ?? [];
      return { organizationId: orgId, name: org.name as string, slug: (org.slug as string | null) ?? null, onSellerPlan: onPlan.has(orgId), orders, fees: monthFees({ onSellerPlan: onPlan.has(orgId), settings, orders }) };
    })
    .sort((a, b) => b.fees.totalCents - a.fees.totalCents || a.name.localeCompare(b.name));
}

export type MarketFeesRun = { month: string; dryRun: boolean; sellers: number; totalCents: number; drafted: number };

// The daily job's step (brief 25, C5). Last month's fees, per seller. While
// fees are off (Antonio has not confirmed the prices) it only writes the
// amounts to the log. Once on, it drafts one PortPass invoice per seller
// for the month, never twice (the database refuses a second); a founder
// sends it. It never sends anything itself.
export async function runMarketFees(today: string = nassauToday()): Promise<MarketFeesRun> {
  const month = previousMonth(monthOf(today));
  const settings = await getMarketSettings();
  const rows = (await marketFeesForMonth(month, settings)).filter((row) => row.fees.totalCents > 0);
  const totalCents = rows.reduce((sum, row) => sum + row.fees.totalCents, 0);
  if (!invoicesMonth(settings, month)) {
    // Ids and amounts only: no names, no buyers.
    console.info(`[market fees] dry run for ${month}: ${rows.length} seller(s), ${totalCents} cents in all. ${rows.map((row) => `org ${row.organizationId}: plan ${row.fees.planCents}, commission ${row.fees.commissionCents} on ${row.fees.commissionBaseCents} (${row.fees.orders} orders)`).join("; ")}`);
    return { month, dryRun: true, sellers: rows.length, totalCents, drafted: 0 };
  }
  const { start, end } = monthBounds(month);
  let drafted = 0;
  for (const row of rows) {
    if (await draftMarketInvoice({ organizationId: row.organizationId, periodStart: start, periodEnd: end, issuedOn: today, lines: feeLines(month, row.fees, settings.commissionBps) })) drafted += 1;
  }
  console.info(`[market fees] ${month}: drafted ${drafted} invoice(s) for ${rows.length} seller(s), ${totalCents} cents in all.`);
  return { month, dryRun: false, sellers: rows.length, totalCents, drafted };
}

export type MarketIncome = {
  settings: MarketSettings;
  month: string;
  lastMonth: string;
  invoices: StoredInvoice[];
  totals: { count: number; totalCents: number; paidCents: number; outstandingCents: number };
  lastMonthFees: SellerFees[];
  monthToDate: SellerFees[];
};

// Admin -> Market -> Income: this month's Market invoices (raised for last
// month's fees), what is paid and outstanding, what last month's run drafts
// (or would draft while fees are off), and this month so far.
export async function getMarketIncome(today: string = nassauToday()): Promise<MarketIncome> {
  const month = monthOf(today);
  const lastMonth = previousMonth(month);
  const settings = await getMarketSettings();
  const [all, lastMonthFees, monthToDate] = await Promise.all([listInvoices({ kind: "market" }), marketFeesForMonth(lastMonth, settings), marketFeesForMonth(month, settings)]);
  const invoices = all.filter((invoice) => monthOf(invoice.issuedOn) === month && invoice.status !== "void");
  const totals = invoices.reduce(
    (sum, invoice) => ({
      count: sum.count + 1,
      totalCents: sum.totalCents + invoice.totalCents,
      paidCents: sum.paidCents + invoice.paidCents,
      outstandingCents: sum.outstandingCents + (invoice.status === "draft" ? 0 : Math.max(0, invoice.totalCents - invoice.paidCents)),
    }),
    { count: 0, totalCents: 0, paidCents: 0, outstandingCents: 0 },
  );
  return { settings, month, lastMonth, invoices, totals, lastMonthFees: lastMonthFees.filter((row) => row.fees.totalCents > 0 || row.onSellerPlan), monthToDate: monthToDate.filter((row) => row.fees.totalCents > 0 || row.onSellerPlan) };
}

// One seller's month, for the commission CSV.
export async function sellerMonthFees(orgId: number, month: string): Promise<SellerFees | null> {
  const settings = await getMarketSettings();
  return (await marketFeesForMonth(month, settings)).find((row) => row.organizationId === orgId) ?? null;
}

// The Seller plan is PortPass's to switch on or off per seller (Admin ->
// Market -> Sellers).
export async function setSellerPlan(orgId: number, on: boolean, actorUserId: string): Promise<void> {
  const { data, error } = await db().from("shops").update({ seller_plan: on ? "seller" : "none" }).eq("organization_id", orgId).select("organization_id").maybeSingle();
  throwIfSupabaseError(error, "Could not change the Seller plan");
  if (!data) throw new Error("NOT_FOUND");
  await logAudit({ actorUserId, organizationId: orgId, action: on ? "market.seller.plan_on" : "market.seller.plan_off", targetTable: "shops", targetId: orgId, after: { seller_plan: on ? "seller" : "none" } });
}
