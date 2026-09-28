import { NextResponse } from "next/server";
import { hasPlatformRole, requireSignedInApi } from "@/lib/auth/guards";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { createAuthClient } from "@/lib/auth/server";

// Starts TOTP enrolment for a platform-role account (the step before
// /admin opens). Unverified leftovers from an abandoned attempt are
// removed first so the authenticator app never ends up with a dead entry.
// The secret and QR go to the signed-in person only; nothing is stored
// here -- Supabase Auth holds the factor.
const limited = createRateLimiter(6, 15 * 60_000);

export async function POST(request: Request) {
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_admin")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (limited(`${auth.session.userId}:${clientIp(request)}`)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const client = await createAuthClient();
  const { data: factors } = await client.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") await client.auth.mfa.unenroll({ factorId: factor.id });
  }
  if ((factors?.totp ?? []).some((f) => f.status === "verified")) {
    return NextResponse.json({ error: "Two-step login is already set up on this account." }, { status: 409 });
  }

  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "PortPass admin" });
  if (error || !data) {
    console.error("admin mfa enroll", error);
    return NextResponse.json({ error: "Could not start two-step setup. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }, { headers: { "Cache-Control": "private, no-store" } });
}
