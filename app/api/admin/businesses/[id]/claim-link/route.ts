import { NextResponse } from "next/server";
import { createClaimLink } from "@/db/adminBusinessActions";
import { getBusiness } from "@/db/business";
import { claimLinkMessage } from "@/lib/adminEmail";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

const limited = createRateLimiter(30, 10 * 60_000);

// Admin -> Businesses: "Send claim link" (brief 08, 1.2). Makes a fresh
// one-use link and hands back a WhatsApp link with the message already
// written. Nothing is sent from here: the founder taps the WhatsApp link
// and sends it themselves. The link is shown once and only its hash is
// kept, so it is never logged.
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many links in a short time. Try again in a few minutes." }, { status: 429 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const business = await getBusiness(id);
    if (!business) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const { token, expiresAt } = await createClaimLink(id, auth.session.userId);
    const url = `https://portpassbahamas.com/claim/${token}`;
    const text = claimLinkMessage(business.name, url);
    const number = (business.whatsappE164 ?? business.phoneE164 ?? "").replace(/\D/g, "");
    return NextResponse.json(
      { url, expiresAt, message: text, whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(text)}`, hasNumber: Boolean(number) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (message === "ALREADY_CLAIMED") return NextResponse.json({ error: "This business already has an owner." }, { status: 409 });
    console.error("admin claim link", message);
    return NextResponse.json({ error: "Could not make the link." }, { status: 500 });
  }
}
