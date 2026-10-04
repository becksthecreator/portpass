import { NextResponse } from "next/server";
import { upsertProfile } from "@/db/accounts";
import { requireSignedInApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";

const limited = createRateLimiter(10, 10 * 60_000);

// A signed-in person sets their own name (brief 18, F2: sign-up no longer
// asks for it). Only their own profile, only the name: the account is
// taken from the session, never from the request.
export async function PATCH(request: Request) {
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { fullName?: unknown } | null;
  const fullName = typeof body?.fullName === "string" ? body.fullName.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (fullName.length < 2 || /[@<>]/.test(fullName) || !/\p{L}/u.test(fullName)) return NextResponse.json({ error: "Type your name as you'd like a business to see it." }, { status: 400 });
  try {
    await upsertProfile({ userId: auth.session.userId, fullName, nameFromEmail: false });
  } catch (error) {
    console.error("account profile: name not saved", (error as { code?: string } | null)?.code ?? "");
    return NextResponse.json({ error: "Could not save your name. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
