import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth/server";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { normalizePhoneE164 } from "@/lib/phone";
import { isKnownSectionSlug } from "@/db/categories";

// @public-route: this is how anyone starts signing in.
const ipLimited = createRateLimiter(10, 10 * 60_000);
const emailLimited = createRateLimiter(5, 10 * 60_000);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

// Sends a 6-digit code. shouldCreateUser is always true, so the response is
// identical whether or not the address already has an account -- the
// error text never reveals that. What they typed at sign-up (name, phone,
// business intent) rides along as user_metadata and is read back once the
// code is verified (lib/auth/bootstrap.ts).
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ipLimited(ip)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const email = str(body, "email", 254).toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (emailLimited(email)) return NextResponse.json({ error: "Too many codes requested for this email. Try again in a few minutes." }, { status: 429 });

  const fullName = str(body, "fullName", 120);
  const phoneRaw = str(body, "phone", 40);
  const phoneE164 = phoneRaw ? normalizePhoneE164(phoneRaw) : null;
  if (phoneRaw && !phoneE164) return NextResponse.json({ error: "Enter a phone number we can reach, like 423-8161 or +1 242 423 8161." }, { status: 400 });
  const intent = str(body, "intent", 20);
  const businessName = str(body, "businessName", 150);
  const section = str(body, "section", 40);
  if (section && !(await isKnownSectionSlug(section))) return NextResponse.json({ error: "Choose a section." }, { status: 400 });

  const data: Record<string, string> = {};
  if (fullName) data.full_name = fullName;
  if (phoneE164) data.phone_e164 = phoneE164;
  if (intent === "business" || intent === "customer") data.intent = intent;
  if (businessName) data.business_name = businessName;
  if (section) data.section = section;

  let client;
  try {
    client = await createAuthClient();
  } catch (error) {
    console.error("auth/send: not configured", error);
    return NextResponse.json({ error: "Sign-in isn't available right now." }, { status: 503 });
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: Object.keys(data).length ? data : undefined },
  });
  if (error) {
    // Deliberately the same wording for every failure mode Supabase can
    // report here (rate limit, provider outage): none of them are the
    // caller's business beyond "try again", and none reveal account state.
    console.error("auth/send: signInWithOtp failed", { status: error.status, message: error.message });
    const tooMany = /rate limit|too many/i.test(error.message);
    return NextResponse.json(
      { error: tooMany ? "Too many codes requested. Try again in a few minutes." : "We couldn’t send a code right now. Try again in a minute." },
      { status: tooMany ? 429 : 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
