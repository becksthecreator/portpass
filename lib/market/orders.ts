// PortPass Market orders (brief 25, part C): the rules, pure, so the order
// form, the routes, db/marketOrders.ts, the pages and the unit tests read
// the same ones. No server imports. Money is integer cents; PortPass never
// holds any of it: the buyer pays the seller directly and the seller marks
// it paid.
import { normalizePhoneE164 } from "@/lib/phone";
import { csvCell } from "@/lib/rosterCsv";
import { priceOrder, type CatalogueVariant, type Fulfilment, type ReservationItem, type ShopPaymentMethod, type ShopSource } from "@/lib/shop/rules";
import type { DeliveryZone } from "./sellers";

export type OrderStatus = "new" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "collected" | "cancelled";
export type OrderAction = "paid" | "confirm" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "collected" | "cancel";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  collected: "Collected",
  cancelled: "Cancelled",
};

export const ORDER_ACTION_LABEL: Record<OrderAction, string> = {
  paid: "Paid",
  confirm: "Confirm",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  collected: "Collected",
  cancel: "Cancel",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && value in ORDER_STATUS_LABEL;
}

export function isOrderAction(value: unknown): value is OrderAction {
  return typeof value === "string" && value in ORDER_ACTION_LABEL;
}

// ---- the steps ----------------------------------------------------------------
// new -> confirmed -> preparing -> ready -> collected (pickup)
//                                        -> out_for_delivery -> delivered (delivery)
// A step can be skipped forward (a seller who prepares on the spot goes
// straight to Ready); nothing goes back. Cancelled is only for an order no
// money has been recorded against: a paid order is refunded on its payment
// request first. Paid is separate from the steps.

const PICKUP_STEPS: OrderStatus[] = ["new", "confirmed", "preparing", "ready", "collected"];
const DELIVERY_STEPS: OrderStatus[] = ["new", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

export function orderSteps(fulfilment: Fulfilment): OrderStatus[] {
  return fulfilment === "pickup" ? PICKUP_STEPS : DELIVERY_STEPS;
}

const ACTION_TARGET: Partial<Record<OrderAction, OrderStatus>> = {
  confirm: "confirmed",
  preparing: "preparing",
  ready: "ready",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  collected: "collected",
  cancel: "cancelled",
};

export function actionTarget(action: OrderAction): OrderStatus | null {
  return ACTION_TARGET[action] ?? null;
}

export function isFinished(status: OrderStatus): boolean {
  return status === "collected" || status === "delivered" || status === "cancelled";
}

// Whether a step action may happen now (the database update repeats the
// "from" condition, so two phones tapping at once can't both win).
export function canMoveTo(current: OrderStatus, target: OrderStatus, fulfilment: Fulfilment, paid: boolean): boolean {
  if (isFinished(current)) return false;
  if (target === "cancelled") return !paid;
  const steps = orderSteps(fulfilment);
  const from = steps.indexOf(current);
  const to = steps.indexOf(target);
  return from >= 0 && to > from;
}

// The statuses an action may start from.
export function allowedFrom(target: OrderStatus, fulfilment: Fulfilment): OrderStatus[] {
  if (target === "cancelled") return ["new", "confirmed", "preparing", "ready", "out_for_delivery"];
  const steps = orderSteps(fulfilment);
  const to = steps.indexOf(target);
  return to > 0 ? steps.slice(0, to) : [];
}

// The buttons a seller sees on one order: Paid (until paid, even once it
// is handed over: cash is often taken at the door) and the next step or
// two, then Cancel while nothing is paid.
export function sellerActions(order: { status: OrderStatus; fulfilment: Fulfilment; paid: boolean }): OrderAction[] {
  if (order.status === "cancelled") return [];
  const actions: OrderAction[] = [];
  if (!order.paid) actions.push("paid");
  if (isFinished(order.status)) return actions;
  const steps = orderSteps(order.fulfilment);
  const next = steps[steps.indexOf(order.status) + 1];
  if (order.status === "new") actions.push("confirm");
  if (next === "preparing" && order.status === "confirmed") actions.push("preparing");
  if (["new", "confirmed", "preparing"].includes(order.status)) actions.push("ready");
  if (order.status === "ready") actions.push(order.fulfilment === "pickup" ? "collected" : "out_for_delivery");
  if (order.status === "out_for_delivery") actions.push("delivered");
  if (!order.paid) actions.push("cancel");
  return actions;
}

// The buyer's timeline on /order/<code>: each step, done or not.
export function timeline(order: { status: OrderStatus; fulfilment: Fulfilment }): { status: OrderStatus; label: string; done: boolean; current: boolean }[] {
  if (order.status === "cancelled") return [{ status: "new", label: "Ordered", done: true, current: false }, { status: "cancelled", label: ORDER_STATUS_LABEL.cancelled, done: true, current: true }];
  const steps = orderSteps(order.fulfilment);
  const at = steps.indexOf(order.status);
  return steps.map((status, index) => ({ status, label: status === "new" ? "Ordered" : ORDER_STATUS_LABEL[status], done: index <= at, current: index === at }));
}

// ---- the order form ---------------------------------------------------------------

export type OrderInput = {
  items: { variantId: number; qty: number }[];
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  fulfilment: Fulfilment;
  zone: string | null;
  deliveryNote: string | null;
  paymentMethod: ShopPaymentMethod;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
}

// An email address with nothing that could reach a database filter.
const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// A name as the seller's email and list show it: letters, spaces,
// apostrophes (a phone's curly ones too), hyphens and a full stop that ends
// a word ("St. Clair", "Jr."), so nobody can put a web address or a message
// into someone else's inbox through the order form: a dot followed by a
// letter ("evil.example") is refused.
const NAME = /^[\p{L}\p{M}'‘’. -]+$/u;
const DOT_INSIDE_A_WORD = /\.[\p{L}\p{M}]/u;

// The name as it is kept: one kind of apostrophe, single spaces.
function cleanName(raw: string): string {
  return raw.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

// One Market order holds this many items at most, and one buyer may have
// this many unpaid orders waiting with one seller: enough for a family's
// kit, too few for anyone to empty a seller's stock with orders they never
// mean to pay.
export const MAX_ORDER_UNITS = 10;
export const MAX_OPEN_ORDERS_PER_BUYER = 5;

export function parseOrderInput(body: Record<string, unknown>): Parsed<OrderInput> {
  const items = Array.isArray(body.items)
    ? (body.items as unknown[]).map((line) => {
        const l = (line ?? {}) as Record<string, unknown>;
        return { variantId: Number(l.variantId), qty: Number(l.qty) };
      })
    : [];
  if (!items.length) return { ok: false, error: "Pick at least one size." };
  const units = items.reduce((sum, line) => sum + (Number.isFinite(line.qty) ? line.qty : 0), 0);
  if (units > MAX_ORDER_UNITS) return { ok: false, error: `One order can hold up to ${MAX_ORDER_UNITS} items. Message the seller for more.` };
  const rawName = str(body, "buyerName", 60);
  if (!rawName) return { ok: false, error: "Enter your name." };
  if (!NAME.test(rawName) || DOT_INSIDE_A_WORD.test(rawName)) return { ok: false, error: "Enter your name in letters only." };
  const buyerName = cleanName(rawName);
  const buyerPhone = normalizePhoneE164(str(body, "buyerPhone", 40));
  if (!buyerPhone) return { ok: false, error: "Enter a phone or WhatsApp number the seller can reach you on." };
  const buyerEmail = str(body, "buyerEmail", 180);
  if (!EMAIL.test(buyerEmail)) return { ok: false, error: "Enter your email: your order code and how to pay are sent there." };
  const fulfilment: Fulfilment | null = body.fulfilment === "seller_delivery" ? "seller_delivery" : body.fulfilment === "pickup" ? "pickup" : null;
  if (!fulfilment) return { ok: false, error: "Choose pickup or delivery." };
  const zone = fulfilment === "seller_delivery" ? str(body, "zone", 60) : "";
  if (fulfilment === "seller_delivery" && !zone) return { ok: false, error: "Choose your delivery area." };
  const paymentMethod: ShopPaymentMethod | null = body.paymentMethod === "bank_transfer" ? "bank_transfer" : body.paymentMethod === "cash" ? "cash" : null;
  if (!paymentMethod) return { ok: false, error: "Choose how you'll pay the seller." };
  return { ok: true, value: { items, buyerName, buyerPhone, buyerEmail: buyerEmail.toLowerCase(), fulfilment, zone: zone || null, deliveryNote: fulfilment === "seller_delivery" ? str(body, "deliveryNote", 300) || null : null, paymentMethod } };
}

export type PricedMarketOrder = { ok: true; items: ReservationItem[]; subtotalCents: number; deliveryFeeCents: number; totalCents: number } | { ok: false; error: string; soldOut?: number[] };

// The receipt's lines from the catalogue the server loaded (never from
// prices the form sent), plus the delivery fee of the zone chosen.
export function priceMarketOrder(requested: { variantId: number; qty: number }[], catalogue: Map<number, CatalogueVariant>, zone: DeliveryZone | null): PricedMarketOrder {
  const priced = priceOrder(requested, catalogue);
  // Brief 15 words its messages for a drop; an order is one product.
  if (!priced.ok) return { ...priced, error: priced.error.replace("this drop", "this product").replace("one reservation", "one order") };
  const deliveryFeeCents = zone?.feeCents ?? 0;
  return { ok: true, items: priced.items, subtotalCents: priced.totalCents, deliveryFeeCents, totalCents: priced.totalCents + deliveryFeeCents };
}

// How a buyer may pay this seller for this order: bank transfer once the
// seller's payment settings can say where to send it, cash only when they
// take cash on pickup and the buyer is collecting.
export function orderPaymentMethods(input: { bankReady: boolean; cashOnPickup: boolean; fulfilment: Fulfilment }): ShopPaymentMethod[] {
  const methods: ShopPaymentMethod[] = [];
  if (input.bankReady) methods.push("bank_transfer");
  if (input.cashOnPickup && input.fulfilment === "pickup") methods.push("cash");
  return methods;
}

export type OrderOptions = {
  pickup: boolean;
  delivery: boolean;
  methods: Record<Fulfilment, ShopPaymentMethod[]>;
  canOrder: boolean;
};

// What the order form offers for one seller: pickup once they have said
// where, delivery to the areas they listed, and the ways to pay for each.
// Nothing to offer (no way to get it, or no way to pay) means no form: the
// page says to message the seller instead.
export function orderOptions(input: { pickupNote: string; zones: DeliveryZone[]; bankReady: boolean; cashOnPickup: boolean }): OrderOptions {
  const methods: Record<Fulfilment, ShopPaymentMethod[]> = {
    pickup: orderPaymentMethods({ bankReady: input.bankReady, cashOnPickup: input.cashOnPickup, fulfilment: "pickup" }),
    seller_delivery: orderPaymentMethods({ bankReady: input.bankReady, cashOnPickup: input.cashOnPickup, fulfilment: "seller_delivery" }),
  };
  const pickup = input.pickupNote.trim() !== "" && methods.pickup.length > 0;
  const delivery = input.zones.length > 0 && methods.seller_delivery.length > 0;
  return { pickup, delivery, methods, canOrder: pickup || delivery };
}

// Unpaid, still waiting to be handed over and past the seller's hold: what
// "Release now?" offers. Never one already on its way to the buyer.
export function orderPastHold(order: { status: OrderStatus; paid: boolean; holdUntil: string }, now: Date = new Date()): boolean {
  if (order.paid || isFinished(order.status) || order.status === "out_for_delivery") return false;
  return Date.parse(order.holdUntil) < now.getTime();
}

// The payment request's lines: one per size, and the delivery fee.
export function requestLines(items: ReservationItem[], deliveryFeeCents: number, zone: string | null): { label: string; qty: number; unitCents: number }[] {
  const lines = items.map((item) => ({ label: `${item.title} (${item.label})`.slice(0, 120), qty: item.qty, unitCents: item.unitCents }));
  if (deliveryFeeCents > 0) lines.push({ label: `Delivery${zone ? ` to ${zone}` : ""}`.slice(0, 120), qty: 1, unitCents: deliveryFeeCents });
  return lines;
}

// ---- the order code -----------------------------------------------------------

const ORDER_CODE = /^[A-Z]{2,4}-[A-Z0-9]{6}$/;

export function normalizeOrderCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return ORDER_CODE.test(code) ? code : null;
}

// ---- the seller's numbers -------------------------------------------------------

export type OrderForStats = { status: OrderStatus; paid: boolean; totalCents: number; subtotalCents: number; broughtByPortpass: boolean };

export type OrderStats = { orders: number; paid: number; revenuePaidCents: number; broughtByPortpass: number; broughtByPortpassPaidCents: number };

// Cancelled orders are not counted; "brought by PortPass" is the source the
// server recorded when the order was placed (a PortPass page or link).
export function orderStats(list: OrderForStats[]): OrderStats {
  const stats: OrderStats = { orders: 0, paid: 0, revenuePaidCents: 0, broughtByPortpass: 0, broughtByPortpassPaidCents: 0 };
  for (const order of list) {
    if (order.status === "cancelled" && !order.paid) continue;
    stats.orders += 1;
    if (order.broughtByPortpass) stats.broughtByPortpass += 1;
    if (order.paid) {
      stats.paid += 1;
      stats.revenuePaidCents += order.totalCents;
      if (order.broughtByPortpass) stats.broughtByPortpassPaidCents += order.totalCents;
    }
  }
  return stats;
}

// ---- PortPass's fees ------------------------------------------------------------
// The seller plan (a monthly fee) and the commission on what PortPass
// brought: commission_bps of the goods total (not the delivery fee, which
// is the seller's cost of getting it there) of each order brought by
// PortPass and paid during the month. Rounded to the cent, half up.

// feesLiveSince: the Nassau day fees were switched on. The first month
// invoiced is the one that day falls in: switching on never bills the
// months before it.
export type MarketSettings = { sellerPlanCents: number; commissionBps: number; feesLive: boolean; feesLiveSince: string | null };
export const DEFAULT_MARKET_SETTINGS: MarketSettings = { sellerPlanCents: 2900, commissionBps: 800, feesLive: false, feesLiveSince: null };

// Whether the daily job drafts real invoices for this month, or only logs
// what it would draft.
export function invoicesMonth(settings: MarketSettings, month: string): boolean {
  return settings.feesLive && settings.feesLiveSince !== null && month >= monthOf(settings.feesLiveSince);
}

export type MarketSettingsInput = { sellerPlanCents: number; commissionBps: number; feesLive: boolean };

// Admin -> Market -> Income: the price in dollars, the commission as a
// percentage (two decimals at most), and the switch.
export function parseMarketSettings(body: Record<string, unknown>): { ok: true; value: MarketSettingsInput } | { ok: false; error: string } {
  const dollars = Number(body.sellerPlanDollars);
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 10_000) return { ok: false, error: "The Seller plan price must be between $0 and $10,000." };
  const percent = Number(body.commissionPercent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { ok: false, error: "The commission must be between 0% and 100%." };
  const sellerPlanCents = Math.round(dollars * 100);
  const commissionBps = Math.round(percent * 100);
  if (Math.abs(sellerPlanCents - dollars * 100) > 1e-6 || Math.abs(commissionBps - percent * 100) > 1e-6) return { ok: false, error: "Use at most two decimal places." };
  if (typeof body.feesLive !== "boolean") return { ok: false, error: "Say whether fees are switched on." };
  return { ok: true, value: { sellerPlanCents, commissionBps, feesLive: body.feesLive } };
}

// The invoice's lines for one seller's month.
export function feeLines(month: string, fees: SellerMonthFees, bps: number): { description: string; amountCents: number; source: "plan" | "commission" }[] {
  const lines: { description: string; amountCents: number; source: "plan" | "commission" }[] = [];
  const name = monthName(month);
  if (fees.planCents > 0) lines.push({ description: `PortPass Market Seller plan, ${name}`, amountCents: fees.planCents, source: "plan" });
  if (fees.commissionCents > 0) {
    const orders = `${fees.orders} order${fees.orders === 1 ? "" : "s"}`;
    lines.push({ description: `${percentLabel(bps)} of ${dollarsLabel(fees.commissionBaseCents)} in Market orders PortPass brought, paid in ${name} (${orders})`, amountCents: fees.commissionCents, source: "commission" });
  }
  return lines;
}

function percentLabel(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

function dollarsLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

// reason: why the server counted it as brought by PortPass (a PortPass
// link, found on PortPass), so a seller can question a line.
export type CommissionableOrder = { referenceCode: string; paidAt: string; subtotalCents: number; totalCents: number; reason: string | null };

export type SellerMonthFees = { planCents: number; commissionBaseCents: number; commissionCents: number; orders: number; totalCents: number };

export function monthFees(input: { onSellerPlan: boolean; settings: MarketSettings; orders: CommissionableOrder[] }): SellerMonthFees {
  const planCents = input.onSellerPlan ? input.settings.sellerPlanCents : 0;
  const commissionBaseCents = input.orders.reduce((sum, o) => sum + o.subtotalCents, 0);
  const commissionCents = Math.round((commissionBaseCents * input.settings.commissionBps) / 10_000);
  return { planCents, commissionBaseCents, commissionCents, orders: input.orders.length, totalCents: planCents + commissionCents };
}

// "2026-10" for the month a Nassau date falls in; the month before.
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^20\d\d-(0[1-9]|1[0-2])$/.test(value);
}

// The first and last day of a month ("2026-10" -> 2026-10-01 .. 2026-10-31).
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---- exports ------------------------------------------------------------------

export type ListedOrder = {
  id: number;
  referenceCode: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  items: ReservationItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentMethod: ShopPaymentMethod;
  paid: boolean;
  paidAt: string | null;
  status: OrderStatus;
  fulfilment: Fulfilment;
  zone: string | null;
  deliveryNote: string | null;
  holdUntil: string;
  source: ShopSource;
  broughtByPortpass: boolean;
  paymentRequestId: number | null;
  createdAt: string;
  confirmedAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  // The open payment request's page token (the seller's list only; never on
  // the buyer's /order page or in a spreadsheet).
  payToken: string | null;
};

function csv(lines: (string | number | null)[][]): string {
  // CRLF + BOM, like the roster and Drops exports: opens cleanly in Excel.
  return `﻿${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function stamp(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function buildOrdersCsv(list: ListedOrder[]): string {
  return csv([
    ["Order", "Ordered at", "Buyer", "Phone", "Email", "Items", "Goods", "Delivery fee", "Total", "Pay by", "Paid", "Paid at", "Status", "Fulfilment", "Zone", "Brought by PortPass"],
    ...list.map((o) => [
      o.referenceCode,
      stamp(o.createdAt),
      o.buyerName,
      o.buyerPhone,
      o.buyerEmail,
      o.items.map((item) => `${item.title} ${item.label} x${item.qty}`).join("; "),
      dollars(o.subtotalCents),
      dollars(o.deliveryFeeCents),
      dollars(o.totalCents),
      o.paymentMethod === "bank_transfer" ? "Bank transfer" : "Cash on pickup",
      o.paid ? "Yes" : "No",
      stamp(o.paidAt),
      ORDER_STATUS_LABEL[o.status],
      o.fulfilment === "pickup" ? "Pickup" : "Delivery",
      o.zone,
      o.broughtByPortpass ? "Yes" : "No",
    ]),
  ]);
}

// Sizes x counts over the orders still to hand over (not cancelled, not
// yet collected or delivered).
export function buildOrderPickListCsv(list: ListedOrder[]): string {
  const rows = new Map<string, { product: string; size: string; qty: number; paid: number; order: number }>();
  let order = 0;
  for (const o of list) {
    if (isFinished(o.status)) continue;
    for (const item of o.items) {
      const key = `${item.productId}:${item.label}`;
      let row = rows.get(key);
      if (!row) {
        row = { product: item.title, size: item.label, qty: 0, paid: 0, order: order++ };
        rows.set(key, row);
      }
      row.qty += item.qty;
      if (o.paid) row.paid += item.qty;
    }
  }
  const sorted = Array.from(rows.values()).sort((a, b) => a.product.localeCompare(b.product) || a.order - b.order);
  return csv([["Product", "Size", "To hand over", "Of which paid"], ...sorted.map((r) => [r.product, r.size, r.qty, r.paid])]);
}

export function buildCommissionCsv(month: string, sellerName: string, orders: CommissionableOrder[], bps: number): string {
  return csv([
    ["Seller", "Month", "Order", "Paid at", "Why PortPass brought it", "Goods", "Commission rate", "Commission"],
    ...orders.map((o) => [sellerName, month, o.referenceCode, stamp(o.paidAt), o.reason, dollars(o.subtotalCents), `${(bps / 100).toFixed(2)}%`, dollars(Math.round((o.subtotalCents * bps) / 10_000))]),
  ]);
}

// The seller taps this to message the buyer; nothing is sent for them.
// With the payment page while the order is unpaid, for a buyer whose email
// didn't arrive.
export function buyerWhatsappText(order: { referenceCode: string; buyerName: string }, sellerName: string, payUrl: string | null = null): string {
  const first = order.buyerName.trim().split(/\s+/)[0] ?? "";
  return `Hi ${first}, about your PortPass order ${order.referenceCode} from ${sellerName}: ${payUrl ? `how to pay is here: ${payUrl} ` : ""}`;
}
