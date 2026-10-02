import { NextResponse } from "next/server";
import { recordRedemption } from "@/db/memberPerks";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { passSecret, ticketValid } from "@/lib/memberPass";
import { isMemberNumber } from "@/lib/memberPerks";
import { perkRefusal } from "@/lib/perks/server";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

const limited = createRateLimiter(60, 10 * 60_000);

// "Record redemption" (brief 10, 6.3): one tap after a valid pass check.
// The ticket from that check is what proves the member was at the counter;
// without it nothing is recorded. The business applies the perk when it
// takes payment: PortPass changes no charge.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  if (limited(`${id}:${auth.session.userId}`)) return NextResponse.json({ error: "Too many in a short time. Try again in a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const memberNumber = body?.memberNumber;
  const ticket = typeof body?.ticket === "string" ? body.ticket.slice(0, 200) : "";
  const perkId = Number(body?.perkId);
  if (!isMemberNumber(memberNumber) || !Number.isInteger(perkId) || perkId <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!ticketValid(passSecret(), id, memberNumber, ticket)) return NextResponse.json({ error: "That check has expired. Check the Member Pass again." }, { status: 409 });
  const rawPrice = body?.priceCents;
  const priceCents = rawPrice === null || rawPrice === undefined || rawPrice === "" ? null : Number(rawPrice);
  if (priceCents !== null && (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000)) return NextResponse.json({ error: "Enter the price in dollars, like 300 or 49.50." }, { status: 400 });
  const bookingRef = typeof body?.bookingRef === "string" ? body.bookingRef.replace(/\s+/g, " ").trim().slice(0, 80) || null : null;
  const who = auth.session.profile?.fullName?.trim().split(/\s+/)[0] || "Staff";
  try {
    const redemption = await recordRedemption(id, perkId, memberNumber, { method: "pass_scan", bookingRef, priceCents, recordedBy: who });
    return NextResponse.json({ redemption }, { status: 201 });
  } catch (error) {
    const refusal = perkRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("perk redeem", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not record the perk. Try again." }, { status: 500 });
  }
}
