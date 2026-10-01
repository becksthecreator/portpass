import { NextResponse } from "next/server";
import { revealRegistrationHealth } from "@/db/adminBookings";
import { REVEAL_REASON_MIN } from "@/lib/adminBookings";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

// Deliberately tight: looking at a child's health details is rare.
const limited = createRateLimiter(10, 60 * 60_000);

// Admin -> Bookings: Reveal (brief 08, 1.6). A child's medical, allergy,
// medication, special-needs and emergency details are hidden from platform
// staff too. This shows them for one registration, once, to the person who
// typed a reason; the reason and who asked are written to the audit log
// before anything is read. The response is never cached.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many reveals in the last hour. Try again later." }, { status: 429 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason : "";

  try {
    const revealed = await revealRegistrationHealth(id, reason, auth.session.userId);
    return NextResponse.json(revealed, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "REASON_REQUIRED") return NextResponse.json({ error: `Say why you need to see this (at least ${REVEAL_REASON_MIN} characters). It is logged.` }, { status: 400 });
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("admin health reveal", message);
    return NextResponse.json({ error: "Could not show the details. Nothing was shown." }, { status: 500 });
  }
}
