// Parsing what the seller's forms send (brief 15). Pure: the route handlers
// call these, then db/shop.ts applies the data rules. Each returns the
// clean value or the sentence to show the seller.
import { nassauLocalToIso } from "@/lib/futprepTerms";
import { isValidReferencePrefix, type DropStatus, type LicenceKind } from "./rules";
import type { DropInput, ProductInput, ShopInput, VariantInput } from "@/db/shop";

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
}

export function parseShopInput(body: Record<string, unknown>): Parsed<ShopInput> {
  const referencePrefix = str(body, "referencePrefix", 4).toUpperCase();
  if (!isValidReferencePrefix(referencePrefix)) return { ok: false, error: "The reference prefix is two to four letters, like KL." };
  const returnsPolicy = str(body, "returnsPolicy", 2000);
  const holdHours = Number(body.holdHours);
  if (!Number.isInteger(holdHours) || holdHours < 1 || holdHours > 336) return { ok: false, error: "Hold reservations for between 1 and 336 hours." };
  const isPublished = body.isPublished === true;
  if (isPublished && !returnsPolicy) return { ok: false, error: "Add your returns policy before opening the shop: the law asks for it on the page." };
  return { ok: true, value: { referencePrefix, returnsPolicy, holdHours, isPublished } };
}

export const MAX_PRODUCT_PHOTOS = 6;
export const MAX_VARIANTS = 20;

export function parseProductInput(body: Record<string, unknown>): Parsed<ProductInput> {
  const title = str(body, "title", 120);
  if (!title) return { ok: false, error: "Give the product a name." };
  const description = str(body, "description", 2000);
  const priceCents = Number(body.priceCents);
  if (!Number.isInteger(priceCents) || priceCents < 100 || priceCents > 10_000_000) return { ok: false, error: "Enter a price of at least $1." };

  const photos = (Array.isArray(body.photos) ? body.photos : [])
    .filter((p): p is string => typeof p === "string" && /^https?:\/\//.test(p))
    .map((p) => p.slice(0, 600));
  if (photos.length > MAX_PRODUCT_PHOTOS) return { ok: false, error: `Up to ${MAX_PRODUCT_PHOTOS} photos per product.` };

  const rawVariants = Array.isArray(body.variants) ? (body.variants as unknown[]) : [];
  if (rawVariants.length > MAX_VARIANTS) return { ok: false, error: `Up to ${MAX_VARIANTS} sizes per product.` };
  const variants: VariantInput[] = [];
  const seen = new Set<string>();
  for (const raw of rawVariants) {
    const v = (raw ?? {}) as Record<string, unknown>;
    const label = str(v, "label", 40);
    if (!label) return { ok: false, error: "Every size needs a name (S, M, L, or a colourway)." };
    if (seen.has(label.toLowerCase())) return { ok: false, error: `"${label}" is listed twice.` };
    seen.add(label.toLowerCase());
    const stock = v.stock === null || v.stock === undefined || v.stock === "" ? null : Number(v.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 100_000)) return { ok: false, error: `Stock for ${label} must be a whole number (or blank for unlimited).` };
    const id = v.id === null || v.id === undefined ? null : Number(v.id);
    variants.push({ id: id !== null && Number.isInteger(id) && id > 0 ? id : null, label, stock });
  }

  const usesMarks = body.usesMarks === true;
  const kind = str(body, "licenceKind", 30);
  const licenceKind: LicenceKind | null = kind === "fan_edition" || kind === "official_licensed" ? kind : null;
  const licenceNote = str(body, "licenceNote", 1000);
  if (usesMarks && !licenceKind) return { ok: false, error: "Say whether it's a fan edition or officially licensed." };
  if (usesMarks && !licenceNote) return { ok: false, error: "Add the licence note: whose marks they are and what permission you have." };

  return {
    ok: true,
    value: { title, description, priceCents, photos, isPublished: body.isPublished === true, usesMarks, licenceKind: usesMarks ? licenceKind : null, licenceNote: usesMarks ? licenceNote : null, variants },
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDropInput(body: Record<string, unknown>): Parsed<DropInput> {
  const title = str(body, "title", 120);
  if (!title) return { ok: false, error: "Give the drop a name." };
  const opensAt = nassauLocalToIso(str(body, "opensAt", 20));
  if (!opensAt) return { ok: false, error: "Set when the drop opens." };
  const closesRaw = str(body, "closesAt", 20);
  const closesAt = closesRaw ? nassauLocalToIso(closesRaw) : null;
  if (closesRaw && !closesAt) return { ok: false, error: "Check the closing time." };
  const followersRaw = body.followersFirst === true ? str(body, "followersFirstUntil", 20) : "";
  const followersFirstUntil = followersRaw ? nassauLocalToIso(followersRaw) : null;
  if (body.followersFirst === true && !followersFirstUntil) return { ok: false, error: "Set when the drop opens to everyone." };
  if (followersFirstUntil && Date.parse(followersFirstUntil) <= Date.parse(opensAt)) return { ok: false, error: "Everyone's opening has to come after the followers' opening." };
  if (closesAt && Date.parse(closesAt) <= Date.parse(opensAt)) return { ok: false, error: "The drop has to close after it opens." };

  const readyRaw = str(body, "readyOn", 10);
  const readyOn = DATE.test(readyRaw) ? readyRaw : null;
  const statusRaw = str(body, "status", 12);
  const status: DropStatus = statusRaw === "published" || statusRaw === "closed" ? statusRaw : "draft";
  if (status !== "draft" && !readyOn) return { ok: false, error: "Add the pickup or delivery date: buyers have to see it before they reserve." };

  const allowPickup = body.allowPickup === true;
  const allowDelivery = body.allowDelivery === true;
  if (!allowPickup && !allowDelivery) return { ok: false, error: "Offer pickup, delivery or both." };
  const zones = Array.from(
    new Set(
      (Array.isArray(body.deliveryZones) ? body.deliveryZones : [])
        .filter((z): z is string => typeof z === "string")
        .map((z) => z.trim().slice(0, 60))
        .filter(Boolean),
    ),
  ).slice(0, 12);
  if (allowDelivery && zones.length === 0) return { ok: false, error: "List the areas you deliver to." };

  const productIds = (Array.isArray(body.productIds) ? body.productIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const hero = str(body, "heroImageUrl", 600);

  return {
    ok: true,
    value: {
      title,
      description: str(body, "description", 2000),
      heroImageUrl: /^https?:\/\//.test(hero) ? hero : null,
      opensAt,
      closesAt,
      followersFirstUntil,
      readyOn,
      pickupNote: allowPickup ? str(body, "pickupNote", 500) : "",
      deliveryNote: allowDelivery ? str(body, "deliveryNote", 500) : "",
      allowPickup,
      allowDelivery,
      deliveryZones: allowDelivery ? zones : [],
      status,
      productIds,
    },
  };
}

// The sentence for each data-rule error db/shop.ts throws.
export const SHOP_ERRORS: Record<string, string> = {
  NO_SHOP: "Set up the shop first (reference prefix and returns policy).",
  UNKNOWN_PRODUCT: "One of those products isn't yours.",
  NEEDS_READY_DATE: "Add the pickup or delivery date before publishing.",
  NEEDS_PRODUCTS: "Add at least one published product before publishing the drop.",
  NEEDS_ZONES: "List the areas you deliver to.",
  NEEDS_FULFILMENT: "Offer pickup, delivery or both.",
  BAD_WINDOW: "Check the opening and closing times.",
  PREFIX_TAKEN: "Another shop already uses that prefix. Try another.",
  NEEDS_RETURNS_POLICY: "Add your returns policy before opening the shop.",
  PRODUCT_IN_USE: "Someone has reserved this product. Unpublish it instead.",
  NOT_FOUND: "Not found.",
};

export function shopErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("VARIANT_IN_USE:")) return `Someone has reserved ${message.slice(15)}, so it can't be removed. Set its stock to 0 instead.`;
  if (message.startsWith("DUPLICATE_LABEL:")) return `"${message.slice(16)}" is listed twice.`;
  return SHOP_ERRORS[message] ?? null;
}
