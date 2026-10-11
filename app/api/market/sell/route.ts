import { NextResponse } from "next/server";
import { alertSellerApplied } from "@/db/marketAlerts";
import { applyToSell } from "@/db/marketSellers";
import { afterResponse } from "@/lib/afterResponse";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireSignedInApi } from "@/lib/auth/guards";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { parseSellerApplication } from "@/lib/market/sellers";

// /sell (brief 25, A4): a signed-in person applies to sell on PortPass
// Market. It makes a draft business they own, with a shop that is not open
// and a seller waiting for PortPass to verify; nothing is public and
// nothing is approved automatically. The founders are told (at most once
// an hour). Rate-limited per address and per account, since it makes rows.
const limitedIp = createRateLimiter(5, 60_000);
const limitedUser = createRateLimiter(3, 60 * 60_000);

const Body = bodyOf(["businessName", "category", "licenceNumber", "contactPerson", "whatsapp", "whatTheySell", "pickupLocation", "cashOnPickup"]);

export async function POST(request: Request) {
  if (limitedIp(clientIp(request))) return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const parsed = parseSellerApplication(read.value as Record<string, unknown>);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (limitedUser(auth.session.userId)) return NextResponse.json({ error: "You've applied a few times already. Give us a moment, or message us on WhatsApp." }, { status: 429 });
  try {
    const result = await applyToSell(auth.session.userId, parsed.value);
    if (!result.existing) afterResponse(() => alertSellerApplied());
    return NextResponse.json({ slug: result.slug, existing: result.existing }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    console.error("sell: apply", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "We couldn't save that. Please try again, or message us on WhatsApp." }, { status: 500 });
  }
}
