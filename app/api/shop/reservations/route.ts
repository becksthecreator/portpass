import { NextRequest, NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { createReservation, getPublicDrop } from "@/db/shop";
import { parseAttributionCookie, shopAttributionCookie } from "@/lib/attribution";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { normalizePhoneE164 } from "@/lib/phone";
import { canReserve, dropPhase, priceOrder, resolveShopSource, SHOP_PAYMENT_METHODS, soldOutMessage, type CatalogueVariant, type Fulfilment, type ShopPaymentMethod } from "@/lib/shop/rules";

// A buyer reserves sizes on a drop (brief 15). Everything that matters is
// decided here, from the database: whether the drop is open for this
// visitor, the prices, the hold, which payment methods the seller takes,
// and where the order came from (the shop's first-party cookie). Nothing
// is charged and no message is sent: the buyer gets a reference code and
// pays the seller directly.

const limited = createRateLimiter(10, 60_000);

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["org", "drop", "key", "items", "buyerName", "buyerPhone", "buyerEmail", "fulfilment", "zone", "deliveryNote", "paymentMethod"]);

export async function POST(request: NextRequest) {
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: Record<string, unknown> | null = read.value;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const orgSlug = str(body.org, 80);
  const dropSlug = str(body.drop, 80);
  if (!SLUG.test(orgSlug) || !SLUG.test(dropSlug)) return NextResponse.json({ error: "This drop isn't available." }, { status: 404 });
  const found = await getPublicDrop(orgSlug, dropSlug).catch((error) => {
    console.error("reserve: drop lookup", error);
    return null;
  });
  if (!found) return NextResponse.json({ error: "This drop isn't available." }, { status: 404 });
  const { org, shop, drop, products } = found;

  const phase = dropPhase(drop);
  const hasKey = str(body.key, 80) !== "" && str(body.key, 80) === drop.followersToken;
  if (!canReserve(phase, hasKey)) {
    const why = phase === "closed" ? "This drop has closed." : "This drop isn't open yet.";
    return NextResponse.json({ error: why }, { status: 409 });
  }

  const catalogue = new Map<number, CatalogueVariant>();
  for (const product of products) {
    for (const variant of product.variants) {
      catalogue.set(variant.id, { variantId: variant.id, productId: product.id, title: product.title, label: variant.label, unitCents: product.priceCents, stock: variant.stock });
    }
  }
  const requested = Array.isArray(body.items)
    ? (body.items as unknown[]).map((line) => {
        const l = (line ?? {}) as Record<string, unknown>;
        return { variantId: Number(l.variantId), qty: Number(l.qty) };
      })
    : [];
  const priced = priceOrder(requested, catalogue);
  if (!priced.ok) return NextResponse.json({ error: priced.error, soldOut: priced.soldOut ?? [] }, { status: priced.soldOut ? 409 : 400 });

  const buyerName = str(body.buyerName, 120);
  const buyerPhone = normalizePhoneE164(str(body.buyerPhone, 40));
  const buyerEmail = str(body.buyerEmail, 180);
  if (!buyerName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!buyerPhone) return NextResponse.json({ error: "Enter a phone or WhatsApp number the seller can reach you on." }, { status: 400 });
  if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) return NextResponse.json({ error: "Enter a valid email address, or leave it blank." }, { status: 400 });

  const fulfilment = body.fulfilment === "seller_delivery" ? "seller_delivery" : body.fulfilment === "pickup" ? "pickup" : null;
  if (!fulfilment || (fulfilment === "pickup" && !drop.allowPickup) || (fulfilment === "seller_delivery" && !drop.allowDelivery)) {
    return NextResponse.json({ error: "Choose pickup or delivery." }, { status: 400 });
  }
  const zone = fulfilment === "seller_delivery" ? str(body.zone, 80) : "";
  if (fulfilment === "seller_delivery" && !drop.deliveryZones.includes(zone)) return NextResponse.json({ error: "Choose a delivery area." }, { status: 400 });
  const deliveryNote = fulfilment === "seller_delivery" ? str(body.deliveryNote, 300) : "";

  // Only what this seller takes; bank transfer only with their details on file.
  const accepted = SHOP_PAYMENT_METHODS.filter((m) => org.paymentMethods.includes(m) && (m !== "bank_transfer" || Boolean(org.bankTransferDetails?.accountNumber)));
  const paymentMethod = str(body.paymentMethod, 20) as ShopPaymentMethod;
  if (!accepted.includes(paymentMethod)) return NextResponse.json({ error: "Choose how you'll pay." }, { status: 400 });

  const attribution = parseAttributionCookie(request.cookies.get(shopAttributionCookie(orgSlug))?.value);
  const source = resolveShopSource(attribution);

  try {
    const created = await createReservation({
      orgId: org.id,
      shop,
      dropId: drop.id,
      buyerName,
      buyerPhone,
      buyerEmail: buyerEmail || null,
      items: priced.items,
      totalCents: priced.totalCents,
      paymentMethod,
      fulfilment: fulfilment as Fulfilment,
      zone: zone || null,
      deliveryNote: deliveryNote || null,
      source: source.source,
      commissionEligible: source.commissionEligible,
      commissionReason: source.reason,
      utmSource: attribution?.utmSource ?? null,
      utmMedium: attribution?.utmMedium ?? null,
      utmCampaign: attribution?.utmCampaign ?? null,
      referrerHost: attribution?.referrerHost ?? null,
    });
    return NextResponse.json(
      { referenceCode: created.referenceCode, holdUntil: created.holdUntil, receiptUrl: `/shop/${orgSlug}/reservation/${created.receiptToken}` },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("SOLD_OUT:")) {
      const ids = message.slice("SOLD_OUT:".length).split(",").map(Number).filter(Number.isInteger);
      return NextResponse.json({ error: soldOutMessage(ids, catalogue), soldOut: ids }, { status: 409 });
    }
    if (message === "UNKNOWN_VARIANT") return NextResponse.json({ error: "One of those sizes isn't part of this drop." }, { status: 400 });
    console.error("reserve", error);
    return NextResponse.json({ error: "Could not save your reservation. Please try again." }, { status: 500 });
  }
}
