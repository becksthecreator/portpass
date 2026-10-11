import { describe, expect, it } from "vitest";
import type { CatalogueVariant } from "@/lib/shop/rules";
import {
  allowedFrom,
  buildCommissionCsv,
  buildOrderPickListCsv,
  buildOrdersCsv,
  buyerWhatsappText,
  canMoveTo,
  DEFAULT_MARKET_SETTINGS,
  feeLines,
  invoicesMonth,
  isMonth,
  monthBounds,
  monthFees,
  nextMonth,
  normalizeOrderCode,
  orderOptions,
  orderPastHold,
  orderStats,
  parseMarketSettings,
  parseOrderInput,
  previousMonth,
  priceMarketOrder,
  requestLines,
  sellerActions,
  timeline,
  type ListedOrder,
} from "./orders";

const jersey = (variantId: number, stock: number | null): CatalogueVariant => ({ variantId, productId: 7, title: "TEST Home jersey", label: variantId === 1 ? "S" : "M", unitCents: 3500, stock });
const catalogue = new Map([[1, jersey(1, 3)], [2, jersey(2, null)]]);

const order = (over: Partial<ListedOrder> = {}): ListedOrder => ({
  id: 1,
  referenceCode: "TK-ABC234",
  buyerName: "Tessa Buyer",
  buyerPhone: "+12425550161",
  buyerEmail: "buyer@family.test",
  items: [{ variantId: 1, productId: 7, title: "TEST Home jersey", label: "S", qty: 2, unitCents: 3500 }],
  subtotalCents: 7000,
  deliveryFeeCents: 0,
  totalCents: 7000,
  paymentMethod: "bank_transfer",
  paid: false,
  paidAt: null,
  status: "new",
  fulfilment: "pickup",
  zone: null,
  deliveryNote: null,
  holdUntil: "2026-10-13T12:00:00.000Z",
  source: "portpass",
  broughtByPortpass: true,
  paymentRequestId: 9,
  createdAt: "2026-10-11T12:00:00.000Z",
  confirmedAt: null,
  readyAt: null,
  collectedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  ...over,
});

describe("an order's steps", () => {
  it("moves forward only, may skip ahead, and never leaves a finished order", () => {
    expect(canMoveTo("new", "confirmed", "pickup", false)).toBe(true);
    expect(canMoveTo("new", "ready", "pickup", false)).toBe(true);
    expect(canMoveTo("ready", "confirmed", "pickup", false)).toBe(false);
    expect(canMoveTo("ready", "out_for_delivery", "pickup", false)).toBe(false);
    expect(canMoveTo("ready", "out_for_delivery", "seller_delivery", false)).toBe(true);
    expect(canMoveTo("collected", "cancelled", "pickup", false)).toBe(false);
    expect(allowedFrom("ready", "pickup")).toEqual(["new", "confirmed", "preparing"]);
  });

  it("cancels only an order nothing is paid on", () => {
    expect(canMoveTo("confirmed", "cancelled", "pickup", false)).toBe(true);
    expect(canMoveTo("confirmed", "cancelled", "pickup", true)).toBe(false);
  });

  it("offers the seller Paid until paid, even once handed over, and nothing on a cancelled order", () => {
    expect(sellerActions({ status: "new", fulfilment: "pickup", paid: false })).toEqual(["paid", "confirm", "ready", "cancel"]);
    expect(sellerActions({ status: "ready", fulfilment: "pickup", paid: true })).toEqual(["collected"]);
    expect(sellerActions({ status: "ready", fulfilment: "seller_delivery", paid: true })).toEqual(["out_for_delivery"]);
    expect(sellerActions({ status: "collected", fulfilment: "pickup", paid: false })).toEqual(["paid"]);
    expect(sellerActions({ status: "collected", fulfilment: "pickup", paid: true })).toEqual([]);
    expect(sellerActions({ status: "cancelled", fulfilment: "pickup", paid: false })).toEqual([]);
  });

  it("shows the buyer each step, and a cancelled order as cancelled", () => {
    expect(timeline({ status: "ready", fulfilment: "pickup" }).map((s) => [s.label, s.done, s.current])).toEqual([
      ["Ordered", true, false],
      ["Confirmed", true, false],
      ["Being prepared", true, false],
      ["Ready", true, true],
      ["Collected", false, false],
    ]);
    expect(timeline({ status: "cancelled", fulfilment: "pickup" }).map((s) => s.label)).toEqual(["Ordered", "Cancelled"]);
  });

  it("offers an unpaid order back to stock only once its hold has passed, and never one on its way", () => {
    const after = new Date("2026-10-14T00:00:00Z");
    expect(orderPastHold(order(), after)).toBe(true);
    expect(orderPastHold(order(), new Date("2026-10-12T00:00:00Z"))).toBe(false);
    expect(orderPastHold(order({ paid: true }), after)).toBe(false);
    expect(orderPastHold(order({ status: "out_for_delivery", fulfilment: "seller_delivery" }), after)).toBe(false);
    expect(orderPastHold(order({ status: "cancelled" }), after)).toBe(false);
  });
});

describe("the order form", () => {
  const body = { items: [{ variantId: 1, qty: 2 }], buyerName: " Tessa Buyer ", buyerPhone: "242-555-0161", buyerEmail: "Buyer@Family.test", fulfilment: "pickup", paymentMethod: "bank_transfer" };

  it("reads a good order and needs an email", () => {
    const parsed = parseOrderInput(body);
    expect(parsed).toMatchObject({ ok: true, value: { buyerName: "Tessa Buyer", buyerPhone: "+12425550161", buyerEmail: "buyer@family.test", fulfilment: "pickup", zone: null } });
    expect(parseOrderInput({ ...body, buyerEmail: "" })).toMatchObject({ ok: false });
    expect(parseOrderInput({ ...body, items: [] })).toMatchObject({ ok: false });
    expect(parseOrderInput({ ...body, fulfilment: "seller_delivery" })).toMatchObject({ ok: false, error: "Choose your delivery area." });
    expect(parseOrderInput({ ...body, paymentMethod: "card" })).toMatchObject({ ok: false });
  });

  it("prices from the catalogue, adds the zone's delivery fee, and refuses what is short", () => {
    expect(priceMarketOrder([{ variantId: 1, qty: 2 }], catalogue, null)).toMatchObject({ ok: true, subtotalCents: 7000, deliveryFeeCents: 0, totalCents: 7000 });
    expect(priceMarketOrder([{ variantId: 2, qty: 1 }], catalogue, { zone: "Cable Beach", feeCents: 1500, leadDays: 2 })).toMatchObject({ ok: true, subtotalCents: 3500, deliveryFeeCents: 1500, totalCents: 5000 });
    expect(priceMarketOrder([{ variantId: 1, qty: 4 }], catalogue, null)).toMatchObject({ ok: false, soldOut: [1] });
    const unknown = priceMarketOrder([{ variantId: 99, qty: 1 }], catalogue, null);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).not.toContain("drop");
  });

  it("offers bank transfer once it is set up, cash only for pickup when the seller takes it, and no form without either", () => {
    expect(orderOptions({ pickupNote: "TEST studio", zones: [], bankReady: true, cashOnPickup: true })).toEqual({ pickup: true, delivery: false, methods: { pickup: ["bank_transfer", "cash"], seller_delivery: ["bank_transfer"] }, canOrder: true });
    expect(orderOptions({ pickupNote: "", zones: [{ zone: "Nassau East", feeCents: 1000, leadDays: 2 }], bankReady: false, cashOnPickup: true })).toMatchObject({ pickup: false, delivery: false, canOrder: false });
    expect(orderOptions({ pickupNote: "TEST studio", zones: [], bankReady: false, cashOnPickup: false }).canOrder).toBe(false);
  });

  it("gives the payment request one line a size, and the delivery fee, adding up to the total", () => {
    const priced = priceMarketOrder([{ variantId: 1, qty: 2 }, { variantId: 2, qty: 1 }], catalogue, { zone: "Cable Beach", feeCents: 1500, leadDays: 2 });
    if (!priced.ok) throw new Error("priced");
    const lines = requestLines(priced.items, priced.deliveryFeeCents, "Cable Beach");
    expect(lines.map((l) => l.label)).toEqual(["TEST Home jersey (S)", "TEST Home jersey (M)", "Delivery to Cable Beach"]);
    expect(lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0)).toBe(priced.totalCents);
  });

  it("reads an order code however it is typed, and nothing else", () => {
    expect(normalizeOrderCode(" tk-abc234 ")).toBe("TK-ABC234");
    expect(normalizeOrderCode("TK-ABC23")).toBeNull();
    expect(normalizeOrderCode("../TK-ABC234")).toBeNull();
    expect(normalizeOrderCode(42)).toBeNull();
  });
});

describe("the seller's numbers and spreadsheets", () => {
  it("counts orders, paid, revenue paid and what PortPass brought, leaving out unpaid cancelled ones", () => {
    const stats = orderStats([order({ paid: true, status: "collected" }), order({ broughtByPortpass: false }), order({ status: "cancelled" })]);
    expect(stats).toEqual({ orders: 2, paid: 1, revenuePaidCents: 7000, broughtByPortpass: 1, broughtByPortpassPaidCents: 7000 });
  });

  it("writes the orders and the pick list, opening cleanly in Excel", () => {
    const csv = buildOrdersCsv([order()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith('"Order","Ordered at","Buyer"')).toBe(true);
    expect(csv).toContain("TK-ABC234");
    expect(csv).toContain("TEST Home jersey S x2");
    const pick = buildOrderPickListCsv([order(), order({ id: 2, paid: true }), order({ id: 3, status: "collected" })]);
    expect(pick).toContain("\"TEST Home jersey\",\"S\",\"4\",\"2\"");
  });

  it("starts the WhatsApp message with the buyer's first name and the code; nothing is sent for the seller", () => {
    expect(buyerWhatsappText(order(), "TEST Kit Shop")).toBe("Hi Tessa, about your PortPass order TK-ABC234 from TEST Kit Shop: ");
  });
});

describe("PortPass's Market fees", () => {
  const paid = [
    { referenceCode: "TK-AAA222", paidAt: "2026-09-03T15:00:00Z", subtotalCents: 7000, totalCents: 8500, buyerName: "A" },
    { referenceCode: "TK-BBB333", paidAt: "2026-09-20T15:00:00Z", subtotalCents: 3333, totalCents: 3333, buyerName: "B" },
  ];

  it("charges the plan to a seller on it, and the commission on the goods only (not delivery), rounded to the cent", () => {
    const fees = monthFees({ onSellerPlan: true, settings: DEFAULT_MARKET_SETTINGS, orders: paid });
    expect(fees).toEqual({ planCents: 2900, commissionBaseCents: 10333, commissionCents: 827, orders: 2, totalCents: 3727 });
    expect(monthFees({ onSellerPlan: false, settings: DEFAULT_MARKET_SETTINGS, orders: [] }).totalCents).toBe(0);
  });

  it("words the invoice lines for the month", () => {
    const fees = monthFees({ onSellerPlan: true, settings: DEFAULT_MARKET_SETTINGS, orders: paid });
    expect(feeLines("2026-09", fees, 800)).toEqual([
      { description: "PortPass Market Seller plan, September 2026", amountCents: 2900, source: "plan" },
      { description: "8% of $103.33 in Market orders PortPass brought, paid in September 2026 (2 orders)", amountCents: 827, source: "commission" },
    ]);
  });

  it("drafts real invoices only once fees are on, and never for a month before they were switched on", () => {
    expect(invoicesMonth(DEFAULT_MARKET_SETTINGS, "2026-09")).toBe(false);
    const live = { ...DEFAULT_MARKET_SETTINGS, feesLive: true, feesLiveSince: "2026-10-11" };
    expect(invoicesMonth(live, "2026-09")).toBe(false);
    expect(invoicesMonth(live, "2026-10")).toBe(true);
    expect(invoicesMonth(live, "2026-11")).toBe(true);
  });

  it("reads the prices form in dollars and percent", () => {
    expect(parseMarketSettings({ sellerPlanDollars: "29", commissionPercent: "8", feesLive: false })).toEqual({ ok: true, value: { sellerPlanCents: 2900, commissionBps: 800, feesLive: false } });
    expect(parseMarketSettings({ sellerPlanDollars: "29.999", commissionPercent: "8", feesLive: false }).ok).toBe(false);
    expect(parseMarketSettings({ sellerPlanDollars: "-1", commissionPercent: "8", feesLive: false }).ok).toBe(false);
    expect(parseMarketSettings({ sellerPlanDollars: "29", commissionPercent: "101", feesLive: false }).ok).toBe(false);
    expect(parseMarketSettings({ sellerPlanDollars: "29", commissionPercent: "8", feesLive: "yes" }).ok).toBe(false);
  });

  it("works out months", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
  });

  it("writes one seller's commission spreadsheet without the buyers' names", () => {
    const csv = buildCommissionCsv("2026-09", "TEST Kit Shop", paid, 800);
    expect(csv).toContain("TK-AAA222");
    expect(csv).toContain("8.00%");
    expect(csv).not.toContain("\"A\"");
  });
});
