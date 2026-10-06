import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveSignInCodeUsed } from "@/db/adminHealth";
import { afterResponse } from "@/lib/afterResponse";
import { bootstrapUser } from "@/lib/auth/bootstrap";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { LAST_CHOICE_COOKIE, resolveDestination } from "@/lib/auth/routing";
import { createAuthClient } from "@/lib/auth/server";
import { sessionForUser } from "@/lib/auth/session";

// @public-route: exchanging a code for a session is, by definition, unauthenticated.
const ipLimited = createRateLimiter(20, 10 * 60_000);
// Five tries per email per ten minutes (Brief 21, part C): a six-digit code
// guessed at that rate is a one-in-200,000 chance before the code expires.
const emailLimited = createRateLimiter(5, 10 * 60_000);

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ipLimited(ip)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const email = str(body, "email", 254).toLowerCase();
  const token = str(body, "token", 12).replace(/\s+/g, "");
  if (!email || !/^\d{6,10}$/.test(token)) {
    return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
  }
  if (emailLimited(email)) return NextResponse.json({ error: "Too many attempts for this email. Request a new code in a few minutes." }, { status: 429 });

  let client;
  try {
    client = await createAuthClient();
  } catch (error) {
    console.error("auth/verify: not configured", error);
    return NextResponse.json({ error: "Sign-in isn't available right now." }, { status: 503 });
  }

  const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) {
    return NextResponse.json({ error: "That code didn’t work. Check it and try again, or request a new one." }, { status: 400 });
  }

  // An emailed code was just typed in correctly, so sign-in email is
  // arriving: Admin -> Phase 1 shows when this last happened. Only the
  // time is kept. Never in the way of the sign-in itself.
  afterResponse(() => saveSignInCodeUsed());

  await bootstrapUser(data.user);
  const session = await sessionForUser({ id: data.user.id, email: data.user.email ?? null, phone: data.user.phone ?? null });
  const lastChoice = (await cookies()).get(LAST_CHOICE_COOKIE)?.value ?? null;
  const metaIntent = typeof data.user.user_metadata?.intent === "string" ? (data.user.user_metadata.intent as string) : null;
  const next = resolveDestination(session, { next: str(body, "next", 512) || null, lastChoice, intent: str(body, "intent", 20) || metaIntent });

  return NextResponse.json({ ok: true, next });
}
