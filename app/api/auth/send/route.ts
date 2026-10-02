import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth/server";
import { clientIp, createRateLimiterWithRetry } from "@/lib/auth/rateLimit";
import { appLimitFailure, supabaseSendFailure, type SendFailure } from "@/lib/auth/sendErrors";
import { normalizePhoneE164 } from "@/lib/phone";
import { isKnownSectionSlug } from "@/db/categories";
import { cleanSignupSource } from "@/lib/memberPerks";

// @public-route: this is how anyone starts signing in.
const ipLimit = createRateLimiterWithRetry(10, 10 * 60_000);
const emailLimit = createRateLimiterWithRetry(5, 10 * 60_000);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

function fail(f: SendFailure, reason: string) {
  // Every failed send is logged with its reason (02 brief, A2.4). The
  // address is not: the log is for spotting a stuck mailer, not people.
  console.warn("auth_send_failed", { reason, code: f.code, retryAfter: f.retryAfter ?? null });
  return NextResponse.json({ error: f.error, code: f.code, retryAfter: f.retryAfter }, { status: f.status });
}

// Sends a 6-digit code. /signup may create the account; /login may not
// (shouldCreateUser: false), so a mistyped address on the sign-in screen
// no longer leaves a stray user behind -- the screen says there is no
// account and links to sign-up instead. What they typed at sign-up (name,
// phone, business intent) rides along as user_metadata and is read back
// once the code is verified (lib/auth/bootstrap.ts).
export async function POST(request: Request) {
  const ip = clientIp(request);
  const ipHit = ipLimit(ip);
  if (ipHit.limited) return fail(appLimitFailure("ip", ipHit.retryAfter), "ip_limit");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const email = str(body, "email", 254).toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const emailHit = emailLimit(email);
  if (emailHit.limited) return fail(appLimitFailure("email", emailHit.retryAfter), "email_limit");

  const mode: "login" | "signup" = str(body, "mode", 10) === "signup" ? "signup" : "login";
  const fullName = str(body, "fullName", 120);
  const phoneRaw = str(body, "phone", 40);
  const phoneE164 = phoneRaw ? normalizePhoneE164(phoneRaw) : null;
  if (phoneRaw && !phoneE164) return NextResponse.json({ error: "Enter a phone number we can reach, like 423-8161 or +1 242 423 8161." }, { status: 400 });
  const intent = str(body, "intent", 20);
  const businessName = str(body, "businessName", 150);
  const section = str(body, "section", 40);
  if (section && !(await isKnownSectionSlug(section))) return NextResponse.json({ error: "Choose a section." }, { status: 400 });

  const data: Record<string, string> = {};
  if (mode === "signup") {
    if (fullName) data.full_name = fullName;
    if (phoneE164) data.phone_e164 = phoneE164;
    if (intent === "business" || intent === "customer") data.intent = intent;
    if (businessName) data.business_name = businessName;
    if (section) data.section = section;
    // Where the sign-up link came from, as a short tag (never an identifier).
    const source = cleanSignupSource(str(body, "source", 40));
    if (source) data.signup_source = source;
  }

  let client;
  try {
    client = await createAuthClient();
  } catch (error) {
    console.error("auth/send: not configured", error);
    return NextResponse.json({ error: "Sign-in isn't available right now." }, { status: 503 });
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: mode === "signup", data: Object.keys(data).length ? data : undefined },
  });
  if (error) {
    // Status and code only: the provider's message can quote the address typed.
    console.error("auth/send: signInWithOtp failed", { status: error.status, code: error.code });
    return fail(supabaseSendFailure(error, mode), "supabase");
  }

  return NextResponse.json({ ok: true });
}
