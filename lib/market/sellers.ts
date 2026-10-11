// PortPass Market sellers (brief 25, part A): the rules, pure, so the
// forms, the route handlers, db/marketSellers.ts and the unit tests all
// read the same ones. No server imports.
import { normalizePhoneE164 } from "@/lib/phone";
import { isMarketCategory, type MarketCategorySlug } from "./categories";

export type SellerStatus = "none" | "pending" | "verified" | "suspended";
export type SellerPlan = "none" | "seller";

// The badge a verified seller's storefront and every one of its product
// cards carry.
export const MADE_IN_BAHAMAS = "Made in The Bahamas";

export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = {
  none: "Not on the Market",
  pending: "Waiting for PortPass to verify",
  verified: "Verified: Made in The Bahamas",
  suspended: "Suspended by PortPass",
};

export function isSellerStatus(value: unknown): value is SellerStatus {
  return value === "none" || value === "pending" || value === "verified" || value === "suspended";
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? (body[key] as string).trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function text(body: Record<string, unknown>, key: string, max: number): string {
  // Keeps line breaks (a pickup note can be a few lines).
  return typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
}

// ---- delivery zones ----------------------------------------------------------
// A zone the seller delivers to, its fee and how many days ahead it needs.
// The database checks the same shape (public.seller_delivery_zones_valid).

export type DeliveryZone = { zone: string; feeCents: number; leadDays: number };

export const MAX_DELIVERY_ZONES = 12;
export const MAX_ZONE_FEE_CENTS = 100_000;
export const MAX_LEAD_DAYS = 30;

export function parseDeliveryZones(raw: unknown): Parsed<DeliveryZone[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Delivery areas didn't come through. Try again." };
  if (raw.length > MAX_DELIVERY_ZONES) return { ok: false, error: `Up to ${MAX_DELIVERY_ZONES} delivery areas.` };
  const zones: DeliveryZone[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const zone = str(row, "zone", 60);
    if (!zone) return { ok: false, error: "Every delivery area needs a name, like Cable Beach." };
    if (seen.has(zone.toLowerCase())) return { ok: false, error: `"${zone}" is listed twice.` };
    seen.add(zone.toLowerCase());
    const feeCents = Number(row.feeCents);
    if (!Number.isInteger(feeCents) || feeCents < 0 || feeCents > MAX_ZONE_FEE_CENTS) return { ok: false, error: `The delivery fee for ${zone} must be between $0 and $1,000.` };
    const leadDays = Number(row.leadDays);
    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > MAX_LEAD_DAYS) return { ok: false, error: `Days needed for ${zone} must be a whole number from 0 to ${MAX_LEAD_DAYS}.` };
    zones.push({ zone, feeCents, leadDays });
  }
  return { ok: true, value: zones };
}

export function zonesToRow(zones: DeliveryZone[]): { zone: string; fee_cents: number; lead_days: number }[] {
  return zones.map((z) => ({ zone: z.zone, fee_cents: z.feeCents, lead_days: z.leadDays }));
}

export function zonesFromRow(raw: unknown): DeliveryZone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return { zone: String(row.zone ?? ""), feeCents: Number(row.fee_cents), leadDays: Number(row.lead_days) };
    })
    .filter((z) => z.zone && Number.isInteger(z.feeCents) && Number.isInteger(z.leadDays));
}

// "Cable Beach · $10 · 2 days' notice", "Downtown · free · same day".
export function zoneLine(z: DeliveryZone): string {
  const fee = z.feeCents === 0 ? "free" : `$${(z.feeCents / 100).toFixed(z.feeCents % 100 === 0 ? 0 : 2)}`;
  const lead = z.leadDays === 0 ? "same day" : z.leadDays === 1 ? "1 day's notice" : `${z.leadDays} days' notice`;
  return `${z.zone} · ${fee} · ${lead}`;
}

// ---- the business licence --------------------------------------------------
// A number, as printed on the licence. Never a file.

const LICENCE = /^[A-Za-z0-9][A-Za-z0-9 ./-]{1,58}[A-Za-z0-9]$/;

export function cleanLicenceNumber(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  return LICENCE.test(value) ? value : null;
}

// What organizations.licences calls a business licence (db/licences.ts).
export const BUSINESS_LICENCE_TYPE = "Business licence";

// ---- applying at /sell -----------------------------------------------------

export type SellerApplication = {
  businessName: string;
  marketCategory: MarketCategorySlug;
  licenceNumber: string;
  contactPerson: string;
  whatsappE164: string;
  whatTheySell: string;
  pickupLocation: string;
  acceptsCashOnPickup: boolean;
};

export function parseSellerApplication(body: Record<string, unknown>): Parsed<SellerApplication> {
  const businessName = str(body, "businessName", 150);
  if (!businessName) return { ok: false, error: "Tell us your business name." };
  const marketCategory = body.category;
  if (!isMarketCategory(marketCategory)) return { ok: false, error: "Choose what kind of things you sell." };
  const licenceRaw = str(body, "licenceNumber", 60);
  if (!licenceRaw) return { ok: false, error: "Enter your business licence number. PortPass checks it before your shop goes public." };
  const licenceNumber = cleanLicenceNumber(licenceRaw);
  if (!licenceNumber) return { ok: false, error: "That licence number looks off. Type it as it is printed: letters, numbers, dashes." };
  const contactPerson = str(body, "contactPerson", 120);
  if (!contactPerson) return { ok: false, error: "Tell us who we should speak to." };
  const whatsappE164 = normalizePhoneE164(str(body, "whatsapp", 40));
  if (!whatsappE164) return { ok: false, error: "Enter a WhatsApp number buyers can message, like 423-8161 or +1 242 423 8161." };
  const whatTheySell = text(body, "whatTheySell", 500);
  if (!whatTheySell) return { ok: false, error: "Tell us what you sell, in a sentence." };
  const pickupLocation = text(body, "pickupLocation", 500);
  if (!pickupLocation) return { ok: false, error: "Tell buyers where they collect, like \"Our shop on Shirley Street, weekdays 10 to 5\"." };
  if (typeof body.cashOnPickup !== "boolean") return { ok: false, error: "Say whether buyers can pay cash when they collect." };
  return { ok: true, value: { businessName, marketCategory, licenceNumber, contactPerson, whatsappE164, whatTheySell, pickupLocation, acceptsCashOnPickup: body.cashOnPickup } };
}

// ---- the seller's own settings (on their shop page) ------------------------

export type SellerProfileInput = {
  marketCategory: MarketCategorySlug | null;
  whatTheySell: string;
  contactPerson: string;
  licenceNumber: string | null;
  pickupNote: string;
  deliveryZones: DeliveryZone[];
  acceptsCashOnPickup: boolean;
  requestVerification: boolean;
};

// currentLicence: the number on file. It is accepted as it is even if it
// was recorded before this check existed (an admin may have typed a # or
// a comma); only a new or changed number must look like a licence number.
export function parseSellerProfile(body: Record<string, unknown>, currentLicence: string | null = null): Parsed<SellerProfileInput> {
  const rawCategory = body.category;
  const blank = rawCategory === null || rawCategory === "" || rawCategory === undefined;
  if (!blank && !isMarketCategory(rawCategory)) return { ok: false, error: "Choose what kind of things you sell." };
  const category: MarketCategorySlug | null = blank ? null : (rawCategory as MarketCategorySlug);
  const licenceRaw = str(body, "licenceNumber", 60);
  const unchanged = currentLicence !== null && licenceRaw === currentLicence.trim().replace(/\s+/g, " ");
  const licenceNumber = !licenceRaw ? null : unchanged ? currentLicence : cleanLicenceNumber(licenceRaw);
  if (licenceRaw && !licenceNumber) return { ok: false, error: "That licence number looks off. Type it as it is printed: letters, numbers, dashes." };
  const zones = parseDeliveryZones(body.deliveryZones);
  if (!zones.ok) return zones;
  const value: SellerProfileInput = {
    marketCategory: category,
    whatTheySell: text(body, "whatTheySell", 500),
    contactPerson: str(body, "contactPerson", 120),
    licenceNumber,
    pickupNote: text(body, "pickupNote", 500),
    deliveryZones: zones.value,
    acceptsCashOnPickup: body.cashOnPickup === true,
    requestVerification: body.requestVerification === true,
  };
  if (value.requestVerification) {
    const missing = verificationProblems({ licenceNumber: value.licenceNumber, contactPerson: value.contactPerson, pickupNote: value.pickupNote, deliveryZones: value.deliveryZones });
    if (missing.length) return { ok: false, error: `Before PortPass can verify you: ${missing.join("; ")}.` };
  }
  return { ok: true, value };
}

// What a seller still has to give before PortPass can verify them: the two
// records the brief asks for, and a way for buyers to get their order.
export function verificationProblems(p: { licenceNumber: string | null; contactPerson: string | null; pickupNote: string; deliveryZones: DeliveryZone[] }): string[] {
  const problems: string[] = [];
  if (!p.licenceNumber) problems.push("add your business licence number");
  if (!p.contactPerson?.trim()) problems.push("add a contact person");
  if (!p.pickupNote.trim() && p.deliveryZones.length === 0) problems.push("say where buyers collect, or where you deliver");
  return problems;
}

// ---- reference prefixes ------------------------------------------------------
// A new seller's shop needs two to four letters for its order codes
// (KL-7KQ3MX). Candidates from the name, most natural first; the caller
// takes the first one free.

export function prefixCandidates(name: string): string[] {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
  const letters = words.join("");
  const out: string[] = [];
  const add = (candidate: string) => {
    if (/^[A-Z]{2,4}$/.test(candidate) && !out.includes(candidate)) out.push(candidate);
  };
  const initials = words.map((w) => w[0]).join("");
  add(initials.slice(0, 4));
  add(initials.slice(0, 3));
  if (words[0]) {
    add(words[0].slice(0, 2));
    add(words[0].slice(0, 3));
    add(words[0].slice(0, 4));
  }
  for (let i = 1; i < letters.length && out.length < 12; i += 1) add(`${letters[0]}${letters[i]}`);
  for (let i = 1; i < letters.length && out.length < 20; i += 1) add(`${letters.slice(0, 2)}${letters[i]}`);
  // Last resort: the name's first letter (or P) and two more letters.
  const first = letters[0] ?? "P";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of alphabet) for (const b of alphabet) add(`${first}${a}${b}`);
  return out;
}
