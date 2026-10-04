import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getDemoBusiness, type DemoBusiness } from "@/db/demo";
import { DEMO_COOKIE, DEMO_SESSION_MAX_AGE_SECONDS, demoTokenOrganization, issueDemoToken } from "@/lib/demoSession";

// The guards for the /demo screens (brief 18, part B). A demo session opens
// the demo business and nothing else:
// - it is a cookie of its own, signed with a key of its own; none of the
//   guards in lib/auth/guards.ts (accounts, businesses, admin) reads it;
// - it names the business it was issued for, and is accepted only while
//   that business is the one with is_demo set;
// - every /demo screen and /api/demo route calls requireDemo, which hands
//   back that one business. There is no way to name another.

export type DemoAccess = { org: DemoBusiness };

// The demo business, when this request carries a valid demo session for it.
export async function currentDemo(): Promise<DemoBusiness | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(DEMO_COOKIE)?.value;
  } catch {
    // Outside a request (a script, a test): there is no demo session.
    return null;
  }
  const organizationId = demoTokenOrganization(token);
  if (!organizationId) return null;
  const demo = await getDemoBusiness();
  return demo && demo.id === organizationId ? demo : null;
}

// Pages: no demo session (or an expired one) goes back to /demo, where one
// tap starts a new one.
export async function requireDemo(): Promise<DemoAccess> {
  const org = await currentDemo();
  if (!org) redirect("/demo");
  return { org };
}

export async function requireDemoApi(): Promise<({ ok: true } & DemoAccess) | { ok: false; response: NextResponse }> {
  const org = await currentDemo();
  if (!org) return { ok: false, response: NextResponse.json({ error: "The demo session has ended. Open /demo to start again.", code: "demo_ended" }, { status: 401 }) };
  return { ok: true, org };
}

export function demoCookie(organizationId: number): { name: string; value: string; options: { httpOnly: true; secure: boolean; sameSite: "lax"; path: string; maxAge: number } } | null {
  const value = issueDemoToken(organizationId);
  if (!value) return null;
  return {
    name: DEMO_COOKIE,
    value,
    // Lax, not strict: the QR on the sign-up kit lands on /demo from
    // outside the site, and the session must hold on the next tap.
    options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DEMO_SESSION_MAX_AGE_SECONDS },
  };
}

// What a demo route answers for something that is switched off there.
export function demoSwitchedOff(what = "That"): NextResponse {
  return NextResponse.json({ error: `${what} is switched off in the demo.`, code: "demo_off" }, { status: 403 });
}
