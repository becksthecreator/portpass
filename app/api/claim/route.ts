import { NextResponse } from "next/server";
import { claimBusiness } from "@/db/adminBusinessActions";
import { requireSignedInApi } from "@/lib/auth/guards";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

// Claiming a business PortPass built (brief 08, 1.2): the owner opens the
// link they were sent, signs in, and becomes the business's owner. The
// token is the proof; it works once and expires. Signed-in people only,
// and attempts are limited so tokens can't be guessed at speed.
const limited = createRateLimiter(10, 10 * 60_000);

export async function POST(request: Request) {
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;
  if (limited(`${auth.session.userId}:${clientIp(request)}`)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  try {
    const claimed = await claimBusiness(token, auth.session.userId);
    return NextResponse.json({ ok: true, next: claimed.slug ? `/business/${claimed.slug}` : "/where-to" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "That link isn't valid. Ask PortPass for a new one." }, { status: 404 });
    if (message === "ALREADY_USED") return NextResponse.json({ error: "That link has already been used. If that wasn't you, tell PortPass." }, { status: 409 });
    if (message === "EXPIRED") return NextResponse.json({ error: "That link has expired. Ask PortPass for a new one." }, { status: 410 });
    console.error("claim business", message);
    return NextResponse.json({ error: "Could not claim the business. Try again." }, { status: 500 });
  }
}
