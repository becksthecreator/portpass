// @public-route: a buyer orders on PortPass Market without an account (brief 25, C2).
import { NextRequest, NextResponse } from "next/server";
import { getMarketProduct } from "@/db/market";
import { placeMarketOrder, tellSellerAboutOrder } from "@/db/marketOrders";
import { afterResponse } from "@/lib/afterResponse";
import { bodyOf, readJson } from "@/lib/api/body";
import { parseAttributionCookie, shopAttributionCookie } from "@/lib/attribution";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { parseOrderInput } from "@/lib/market/orders";
import { dropPhase, soldOutMessage, type CatalogueVariant } from "@/lib/shop/rules";

// A buyer orders on PortPass Market without an account (brief 25, C2).
// Rate-limited per address. Everything that matters is
// decided here from the database: that the product is on the Market (a
// verified seller, an open shop, never the demo), the prices, the delivery
// fee, the ways this seller can be paid, the hold, and where the order came
// from (the seller's first-party cookie). Nothing is charged: the order gets
// a payment request from the seller, the buyer is emailed the code and how
// to pay the seller directly, and the seller's owners are told.

const limited = createRateLimiter(6, 60_000);

// As loose as the slugs lib/slug.ts makes; the lookup is parameterised.
const SLUG = /^[a-z0-9-]{1,80}$/;

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["org", "product", "items", "buyerName", "buyerPhone", "buyerEmail", "fulfilment", "zone", "deliveryNote", "paymentMethod"]);

const ERRORS: Record<string, { status: number; error: string }> = {
  NOT_ORDERABLE: { status: 409, error: "This seller isn't taking orders here yet. Message them to order." },
  BAD_FULFILMENT: { status: 400, error: "Choose pickup or delivery." },
  BAD_ZONE: { status: 400, error: "Choose one of the seller's delivery areas." },
  BAD_METHOD: { status: 400, error: "Choose one of the ways this seller takes payment." },
  UNKNOWN_VARIANT: { status: 400, error: "One of those sizes isn't part of this product." },
};

export async function POST(request: NextRequest) {
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body = read.value as Record<string, unknown>;

  const orgSlug = typeof body.org === "string" ? body.org.trim() : "";
  const productSlug = typeof body.product === "string" ? body.product.trim() : "";
  if (!SLUG.test(orgSlug) || !SLUG.test(productSlug)) return NextResponse.json({ error: "This product isn't available." }, { status: 404 });
  const page = await getMarketProduct(orgSlug, productSlug).catch((error) => {
    console.error("market order: product lookup", error instanceof Error ? error.message : "");
    return null;
  });
  if (!page) return NextResponse.json({ error: "This product isn't available." }, { status: 404 });

  // While the product is in an open drop it is reserved there, as its page says.
  if (page.drops.some((d) => dropPhase(d) === "open" && d.productIds.includes(page.product.id))) {
    return NextResponse.json({ error: "This is in an open drop right now: reserve it there." }, { status: 409 });
  }

  const parsed = parseOrderInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const attribution = parseAttributionCookie(request.cookies.get(shopAttributionCookie(orgSlug))?.value);
  const origin = new URL(request.url).origin;
  try {
    const placed = await placeMarketOrder({ org: page.org, shop: page.shop, product: page.product, input: parsed.value, attribution, origin });
    afterResponse(() => tellSellerAboutOrder(page.org.id, placed.id, origin).catch((error) => console.error("market order: seller email", error instanceof Error ? error.message : "")));
    return NextResponse.json({ referenceCode: placed.referenceCode, orderUrl: `/order/${placed.referenceCode}`, holdUntil: placed.holdUntil, emailed: placed.emailed }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (ERRORS[message]) return NextResponse.json({ error: ERRORS[message].error }, { status: ERRORS[message].status });
    if (message.startsWith("PRICE:")) return NextResponse.json({ error: message.slice("PRICE:".length) }, { status: 400 });
    if (message.startsWith("SOLD_OUT:")) {
      const ids = message.slice("SOLD_OUT:".length).split(",").map(Number).filter(Number.isInteger);
      const catalogue = new Map<number, CatalogueVariant>(page.product.variants.map((v) => [v.id, { variantId: v.id, productId: page.product.id, title: page.product.title, label: v.label, unitCents: page.product.priceCents, stock: v.stock }]));
      return NextResponse.json({ error: soldOutMessage(ids, catalogue), soldOut: ids }, { status: 409 });
    }
    console.error("market order", message);
    return NextResponse.json({ error: "We couldn't place your order. Please try again." }, { status: 500 });
  }
}
