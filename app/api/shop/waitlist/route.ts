import { NextRequest, NextResponse } from "next/server";
import { getPublicDrop, joinWaitlist } from "@/db/shop";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { normalizePhoneE164 } from "@/lib/phone";

// "Join the waitlist" on a sold-out size (brief 15): one row per person per
// size. Nobody is messaged automatically; the seller sees the list and
// reaches out themselves if stock comes back.

const limited = createRateLimiter(10, 60_000);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const orgSlug = str(body.org, 80);
  const dropSlug = str(body.drop, 80);
  if (!SLUG.test(orgSlug) || !SLUG.test(dropSlug)) return NextResponse.json({ error: "This drop isn't available." }, { status: 404 });
  const found = await getPublicDrop(orgSlug, dropSlug).catch(() => null);
  if (!found || found.drop.status !== "published") return NextResponse.json({ error: "This drop isn't available." }, { status: 404 });

  const variantId = Number(body.variantId);
  const inDrop = found.products.some((p) => p.variants.some((v) => v.id === variantId));
  if (!Number.isInteger(variantId) || !inDrop) return NextResponse.json({ error: "Choose a size." }, { status: 400 });

  const name = str(body.name, 120);
  const phone = normalizePhoneE164(str(body.phone, 40));
  const email = str(body.email, 180);
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Enter a phone or WhatsApp number." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address, or leave it blank." }, { status: 400 });

  try {
    await joinWaitlist({ orgId: found.org.id, dropId: found.drop.id, variantId, name, phone, email: email || null });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ALREADY_ON_LIST") return NextResponse.json({ ok: true, already: true });
    if (message === "NOT_SOLD_OUT") return NextResponse.json({ error: "That size is available again: you can reserve it now." }, { status: 409 });
    console.error("waitlist", error);
    return NextResponse.json({ error: "Could not add you to the waitlist. Please try again." }, { status: 500 });
  }
}
