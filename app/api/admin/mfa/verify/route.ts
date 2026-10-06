import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { noteAdminSignIn, recordFailedSignIn } from "@/db/alerts";
import { logAudit } from "@/db/audit";
import { afterResponse } from "@/lib/afterResponse";
import { adminWindowCookieOptions } from "@/lib/auth/admin";
import { hasPlatformRole, requireSignedInApi } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/next";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { createAuthClient } from "@/lib/auth/server";

// Verifies a TOTP code for a platform-role account: completes enrolment
// (first time) or answers a challenge (every later sign-in). Success moves
// the Supabase session to AAL2 (the cookies are rewritten here) and opens
// the 12-hour admin window. Five wrong codes in 15 minutes locks the door
// for a while; every verification is audit-logged.
const limited = createRateLimiter(5, 15 * 60_000);

export async function POST(request: Request) {
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_admin")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const key = `${auth.session.userId}:${clientIp(request)}`;
  if (limited(key)) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { factorId?: unknown; code?: unknown; next?: unknown } | null;
  const factorId = typeof body?.factorId === "string" ? body.factorId : "";
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!factorId || !/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });

  const client = await createAuthClient();
  const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error || !data) {
    // Counted for the failed-sign-ins alert (Brief 21, part G): the address, never the code.
    afterResponse(() => recordFailedSignIn("admin_code_failed", clientIp(request)));
    return NextResponse.json({ error: "That code didn’t work. Codes change every 30 seconds — try the current one." }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(adminWindowCookieOptions());
  await logAudit({ actorUserId: auth.session.userId, action: "admin.mfa.verified", targetTable: "auth.users", targetId: auth.session.userId }).catch((e) => console.error("audit", e));
  // A browser and network not seen before for this owner emails the founders (Brief 21, part G).
  afterResponse(() => noteAdminSignIn(auth.session.userId, request));

  const next = safeNext(typeof body?.next === "string" ? body.next : "", "/admin") || "/admin";
  return NextResponse.json({ ok: true, next }, { headers: { "Cache-Control": "private, no-store" } });
}
