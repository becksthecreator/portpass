import { NextResponse } from "next/server";
import { endPerk } from "@/db/memberPerks";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { bumpPerks, perkRefusal } from "@/lib/perks/server";

type Ctx = { params: Promise<{ id: string }> };

// Admin actions are rate-limited per founder (brief 08, security rules).
const limited = createRateLimiter(60, 10 * 60_000);

// Admin -> Perks: end a perk that breaks the rules (brief 10, 6.4). The
// reason is required and goes in the audit log.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many actions in a short time. Try again in a few minutes." }, { status: 429 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.replace(/\s+/g, " ").trim() : "";
  if (reason.length < 5) return NextResponse.json({ error: "Give the reason. It is logged." }, { status: 400 });
  try {
    const perk = await endPerk(id, auth.session.userId, { reason });
    bumpPerks();
    return NextResponse.json({ perk });
  } catch (error) {
    const refusal = perkRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("admin perk end", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not end the perk." }, { status: 500 });
  }
}
