// Drops (brief 15): the rules, pure, so the pages, the route handlers,
// db/shop.ts and the unit tests all read the same ones. No server imports:
// the drop page's client components use some of these too.
import type { Attribution } from "@/lib/attribution";
import { csvCell } from "@/lib/rosterCsv";

export type DropStatus = "draft" | "published" | "closed";
export type PaymentStatus = "pending" | "paid" | "refunded";
export type ReservationStatus = "active" | "cancelled" | "released";
export type Fulfilment = "pickup" | "seller_delivery";
export type ShopPaymentMethod = "bank_transfer" | "cash";
export type ShopSource = "portpass" | "instagram" | "direct";
export type LicenceKind = "fan_edition" | "official_licensed";

export const SHOP_PAYMENT_METHODS: readonly ShopPaymentMethod[] = ["bank_transfer", "cash"];
export const DEFAULT_HOLD_HOURS = 48;
export const MAX_LINES = 20;
export const MAX_QTY_PER_LINE = 10;

// ---- the drop window ------------------------------------------------------
// A published drop opens at opensAt. With followersFirstUntil set, opensAt
// is when the followers' private link starts working and followersFirstUntil
// is the public open; without it, opensAt is the public open.

export type DropWindow = { status: DropStatus; opensAt: string; closesAt: string | null; followersFirstUntil: string | null };
export type DropPhase = "draft" | "upcoming" | "followers" | "open" | "closed";

export function dropPhase(drop: DropWindow, now: Date = new Date()): DropPhase {
  if (drop.status === "draft") return "draft";
  if (drop.status === "closed") return "closed";
  const t = now.getTime();
  if (drop.closesAt && t >= Date.parse(drop.closesAt)) return "closed";
  if (t < Date.parse(drop.opensAt)) return "upcoming";
  if (drop.followersFirstUntil && t < Date.parse(drop.followersFirstUntil)) return "followers";
  return "open";
}

export function canReserve(phase: DropPhase, hasFollowersKey: boolean): boolean {
  return phase === "open" || (phase === "followers" && hasFollowersKey);
}

// When this visitor can reserve: the drop's opening for anyone before it
// opens; during the followers' window, the public open for everyone else.
export function countdownTarget(drop: DropWindow, phase: DropPhase, hasFollowersKey: boolean): string | null {
  if (phase === "upcoming") return drop.opensAt;
  if (phase === "followers" && !hasFollowersKey) return drop.followersFirstUntil;
  return null;
}

export function publicOpensAt(drop: DropWindow): string {
  return drop.followersFirstUntil ?? drop.opensAt;
}

// "2d 4h", "3h 12m", "4m 09s": the countdown's text, from milliseconds.
export function countdownParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

// ---- reference codes ------------------------------------------------------
// KL-7KQ3MX: the shop's prefix and six characters a buyer can read out over
// the phone (no 0/O, 1/I/L, 5/S).

export const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";
const SHOP_REFERENCE = /^[A-Z]{2,4}-[A-Z0-9]{6}$/;

export function makeReferenceCode(prefix: string, randomBytes: Uint8Array): string {
  let body = "";
  for (let i = 0; i < 6; i += 1) body += REFERENCE_ALPHABET[randomBytes[i] % REFERENCE_ALPHABET.length];
  return `${prefix}-${body}`;
}

export function normalizeShopReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return SHOP_REFERENCE.test(code) ? code : null;
}

export function isValidReferencePrefix(value: string): boolean {
  return /^[A-Z]{2,4}$/.test(value);
}

// ---- pricing an order ------------------------------------------------------

export type CatalogueVariant = { variantId: number; productId: number; title: string; label: string; unitCents: number; stock: number | null };
export type ReservationItem = { variantId: number; productId: number; title: string; label: string; qty: number; unitCents: number };
export type PricedOrder = { ok: true; items: ReservationItem[]; totalCents: number } | { ok: false; error: string; soldOut?: number[] };

// Turns what the buyer asked for into the receipt's lines, from the
// catalogue the server loaded (never from prices the form sent).
export function priceOrder(requested: { variantId: number; qty: number }[], catalogue: Map<number, CatalogueVariant>): PricedOrder {
  if (!Array.isArray(requested) || requested.length === 0) return { ok: false, error: "Pick at least one size." };
  const merged = new Map<number, number>();
  for (const line of requested) {
    if (!Number.isInteger(line.variantId) || !Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY_PER_LINE) {
      return { ok: false, error: `Choose between 1 and ${MAX_QTY_PER_LINE} of each item.` };
    }
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.qty);
  }
  if (merged.size > MAX_LINES) return { ok: false, error: "That's more items than one reservation can hold." };
  const items: ReservationItem[] = [];
  const soldOut: number[] = [];
  for (const [variantId, qty] of merged) {
    const variant = catalogue.get(variantId);
    if (!variant) return { ok: false, error: "One of those sizes isn't part of this drop." };
    if (qty > MAX_QTY_PER_LINE) return { ok: false, error: `Choose between 1 and ${MAX_QTY_PER_LINE} of each item.` };
    if (variant.stock !== null && variant.stock < qty) soldOut.push(variantId);
    items.push({ variantId, productId: variant.productId, title: variant.title, label: variant.label, qty, unitCents: variant.unitCents });
  }
  if (soldOut.length) return { ok: false, error: soldOutMessage(soldOut, catalogue), soldOut };
  return { ok: true, items, totalCents: items.reduce((sum, item) => sum + item.qty * item.unitCents, 0) };
}

export function soldOutMessage(variantIds: number[], catalogue: Map<number, CatalogueVariant>): string {
  const names = variantIds.map((id) => catalogue.get(id)).filter((v): v is CatalogueVariant => Boolean(v)).map((v) => `${v.title} (${v.label})`);
  if (!names.length) return "That size just sold out.";
  return `${names.join(", ")} ${names.length === 1 ? "has" : "have"} just sold out. You can join the waitlist instead.`;
}

// ---- holds -----------------------------------------------------------------

export function holdUntil(createdAt: Date, holdHours: number): Date {
  return new Date(createdAt.getTime() + holdHours * 3600_000);
}

export type HeldReservation = { status: ReservationStatus; paymentStatus: PaymentStatus; collectedAt: string | null; holdUntil: string };

// Unpaid, still holding stock and past its hold: what "Release now?" offers.
export function isPastHold(r: HeldReservation, now: Date = new Date()): boolean {
  return r.status === "active" && r.paymentStatus === "pending" && r.collectedAt === null && Date.parse(r.holdUntil) < now.getTime();
}

// ---- where the order came from ------------------------------------------
// Handbook §5 "Brought by PortPass": a PortPass link (utm_source=portpass)
// or arriving from another PortPass page is the evidence; the seller's own
// Instagram link and everything else are not. Commission is owed only once
// such an order is also paid (see reservationStats).

export function isInstagramHost(host: string | null | undefined): boolean {
  return Boolean(host && /(^|\.)instagram\.com$/.test(host));
}

export function resolveShopSource(a: Attribution | null): { source: ShopSource; commissionEligible: boolean; reason: string } {
  const utm = (a?.utmSource ?? "").toLowerCase();
  if (utm === "portpass") return { source: "portpass", commissionEligible: true, reason: "PortPass link" };
  if (a?.viaPortpass) return { source: "portpass", commissionEligible: true, reason: "Found on PortPass" };
  if (utm === "instagram" || utm === "ig" || isInstagramHost(a?.referrerHost)) return { source: "instagram", commissionEligible: false, reason: "Seller's Instagram link" };
  return { source: "direct", commissionEligible: false, reason: utm ? `Other link (${utm})` : "Direct" };
}

export const SOURCE_LABEL: Record<ShopSource, string> = { portpass: "PortPass link", instagram: "Seller's Instagram", direct: "Direct" };

// The two links a seller shares, plus the followers' private link.
export function dropShareLinks(base: string, orgSlug: string, dropSlug: string, followersToken: string): { portpass: string; instagram: string; followers: string; direct: string } {
  const direct = `${base}/shop/${orgSlug}/drop/${dropSlug}`;
  const campaign = encodeURIComponent(`drop_${dropSlug}`);
  return {
    direct,
    portpass: `${direct}?utm_source=portpass&utm_medium=link&utm_campaign=${campaign}`,
    instagram: `${direct}?utm_source=instagram&utm_medium=seller_bio&utm_campaign=${campaign}`,
    followers: `${direct}?k=${followersToken}&utm_source=instagram&utm_medium=followers&utm_campaign=${campaign}`,
  };
}

// ---- labels ----------------------------------------------------------------

export function licenceLabel(kind: LicenceKind | null): string | null {
  if (kind === "fan_edition") return "Fan edition";
  if (kind === "official_licensed") return "Official licensed";
  return null;
}

export function paymentMethodLabel(method: ShopPaymentMethod, fulfilment: Fulfilment = "pickup"): string {
  if (method === "bank_transfer") return "Bank transfer";
  return fulfilment === "seller_delivery" ? "Cash on delivery" : "Cash at pickup";
}

export function fulfilmentLabel(f: Fulfilment): string {
  return f === "pickup" ? "Pickup" : "Delivery by the seller";
}

// wa.me wants digits only. The seller taps it; nothing is ever sent for them.
export function whatsappHref(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// ---- the seller's list -----------------------------------------------------

export type ListedReservation = HeldReservation & {
  id: number;
  referenceCode: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  items: ReservationItem[];
  totalCents: number;
  paymentMethod: ShopPaymentMethod;
  fulfilment: Fulfilment;
  zone: string | null;
  deliveryNote: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  source: ShopSource;
  commissionEligible: boolean;
  createdAt: string;
};

export type ReservationFilter = { variant: string | null; paid: "all" | "paid" | "unpaid"; collected: "all" | "collected" | "not_collected"; showCancelled: boolean };

// variant is "<productId>:<label>" so "M" of two products stay apart.
export function variantKey(item: Pick<ReservationItem, "productId" | "label">): string {
  return `${item.productId}:${item.label}`;
}

export function filterReservations<T extends ListedReservation>(list: T[], f: ReservationFilter): T[] {
  return list.filter((r) => {
    if (!f.showCancelled && r.status !== "active") return false;
    if (f.paid === "paid" && r.paymentStatus !== "paid") return false;
    if (f.paid === "unpaid" && r.paymentStatus === "paid") return false;
    if (f.collected === "collected" && !r.collectedAt) return false;
    if (f.collected === "not_collected" && r.collectedAt) return false;
    if (f.variant && !r.items.some((item) => variantKey(item) === f.variant)) return false;
    return true;
  });
}

export type ReservationStats = {
  reserved: number;
  paid: number;
  collected: number;
  revenuePaidCents: number;
  bySource: Record<ShopSource, { orders: number; paid: number; paidCents: number }>;
  // Handbook §5: PortPass-brought and paid -- the only orders commission applies to.
  commissionableOrders: number;
  commissionableCents: number;
};

export type StatsInput = Pick<ListedReservation, "status" | "paymentStatus" | "collectedAt" | "source" | "commissionEligible" | "totalCents">;

export function reservationStats(list: StatsInput[]): ReservationStats {
  const stats: ReservationStats = {
    reserved: 0,
    paid: 0,
    collected: 0,
    revenuePaidCents: 0,
    bySource: { portpass: { orders: 0, paid: 0, paidCents: 0 }, instagram: { orders: 0, paid: 0, paidCents: 0 }, direct: { orders: 0, paid: 0, paidCents: 0 } },
    commissionableOrders: 0,
    commissionableCents: 0,
  };
  for (const r of list) {
    const isPaid = r.paymentStatus === "paid";
    if (r.status !== "active" && !isPaid) continue;
    stats.reserved += 1;
    const bucket = stats.bySource[r.source] ?? stats.bySource.direct;
    bucket.orders += 1;
    if (r.collectedAt) stats.collected += 1;
    if (isPaid) {
      stats.paid += 1;
      stats.revenuePaidCents += r.totalCents;
      bucket.paid += 1;
      bucket.paidCents += r.totalCents;
      if (r.source === "portpass" && r.commissionEligible) {
        stats.commissionableOrders += 1;
        stats.commissionableCents += r.totalCents;
      }
    }
  }
  return stats;
}

// ---- exports ---------------------------------------------------------------

export type PickRow = { product: string; size: string; reserved: number; paid: number; collected: number; toCollect: number };

// Sizes x counts over the reservations still holding stock.
export function pickList(list: ListedReservation[]): PickRow[] {
  const rows = new Map<string, PickRow & { order: number }>();
  let order = 0;
  for (const r of list) {
    if (r.status !== "active") continue;
    for (const item of r.items) {
      const key = variantKey(item);
      let row = rows.get(key);
      if (!row) {
        row = { product: item.title, size: item.label, reserved: 0, paid: 0, collected: 0, toCollect: 0, order: order++ };
        rows.set(key, row);
      }
      row.reserved += item.qty;
      if (r.paymentStatus === "paid") row.paid += item.qty;
      if (r.collectedAt) row.collected += item.qty;
      else row.toCollect += item.qty;
    }
  }
  return Array.from(rows.values())
    .sort((a, b) => a.product.localeCompare(b.product) || a.order - b.order)
    .map((r) => ({ product: r.product, size: r.size, reserved: r.reserved, paid: r.paid, collected: r.collected, toCollect: r.toCollect }));
}

function csv(lines: (string | number | null)[][]): string {
  // CRLF + BOM, like the roster export: opens cleanly in Excel.
  return `﻿${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function buildPickListCsv(list: ListedReservation[]): string {
  const rows = pickList(list);
  return csv([["Product", "Size", "Reserved", "Paid", "Collected", "Still to collect"], ...rows.map((r) => [r.product, r.size, r.reserved, r.paid, r.collected, r.toCollect])]);
}

function stamp(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function buildReservationsCsv(list: ListedReservation[]): string {
  return csv([
    ["Reference", "Reserved at", "Buyer", "Phone", "Email", "Items", "Total", "Payment method", "Payment", "Paid at", "Fulfilment", "Zone", "Collected at", "Status", "Source"],
    ...list.map((r) => [
      r.referenceCode,
      stamp(r.createdAt),
      r.buyerName,
      r.buyerPhone,
      r.buyerEmail,
      r.items.map((item) => `${item.title} ${item.label} x${item.qty}`).join("; "),
      (r.totalCents / 100).toFixed(2),
      paymentMethodLabel(r.paymentMethod, r.fulfilment),
      r.paymentStatus,
      stamp(r.paidAt),
      r.fulfilment === "pickup" ? "Pickup" : "Delivery",
      r.zone,
      stamp(r.collectedAt),
      r.status,
      SOURCE_LABEL[r.source] ?? r.source,
    ]),
  ]);
}

// ---- Nassau wall-clock for the drop editor ----------------------------------

// An instant -> "2026-10-10T18:00" as a Nassau clock reads it, for a
// datetime-local input. The reverse is lib/futprepTerms.ts nassauLocalToIso.
export function isoToNassauLocal(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatNassau(iso: string, style: "datetime" | "date" = "datetime"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "date"
      ? { weekday: "short", day: "numeric", month: "short", timeZone: "America/Nassau" }
      : { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Nassau" };
  return new Date(iso).toLocaleString("en-GB", options);
}

// A ready_on date ("2026-10-18") is a calendar day, not an instant.
export function formatReadyOn(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
