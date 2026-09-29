import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasPlatformRole, requirePlatformRole, requireSignedInApi } from "./guards";
import { createAuthClient } from "./server";
import type { Session } from "./session";

// The Admin Control Center's door (28 Sept brief, security rules): a
// platform role from the session, two-step login (TOTP through Supabase
// Auth MFA, so the session is at AAL2), and an admin window of 12 hours
// after the last code -- Supabase refreshes sessions indefinitely, so the
// window is what makes "admin sessions expire". The window is a signed
// cookie: the timestamp alone could be edited in the browser.

export const ADMIN_WINDOW_COOKIE = "pp_admin_since";
export const ADMIN_WINDOW_MS = 12 * 60 * 60 * 1000;
export const ADMIN_MFA_PATH = "/admin/verify";

function windowKey(): string {
  // Server-only secret; never reaches the browser. Derived so the cookie
  // can't be minted without it.
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  return createHmac("sha256", "portpass-admin-window").update(secret).digest("hex");
}

export function signAdminWindow(startedAt: number): string {
  const mac = createHmac("sha256", windowKey()).update(String(startedAt)).digest("base64url");
  return `${startedAt}.${mac}`;
}

export function adminWindowStartedAt(value: string | undefined | null): number | null {
  if (!value) return null;
  const [ts, mac] = value.split(".");
  if (!ts || !mac || !/^\d+$/.test(ts)) return null;
  const expected = createHmac("sha256", windowKey()).update(ts).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const startedAt = Number(ts);
  if (Date.now() - startedAt > ADMIN_WINDOW_MS) return null;
  return startedAt;
}

export function adminWindowCookieOptions(): { name: string; value: string; httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string; maxAge: number } {
  return {
    name: ADMIN_WINDOW_COOKIE,
    value: signAdminWindow(Date.now()),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_WINDOW_MS / 1000),
  };
}

export type StepUp = { aal2: boolean; windowOpen: boolean; enrolled: boolean; factorId: string | null };

// What the current session has: AAL2 (a code was entered this session),
// an open 12-hour window, whether a TOTP factor exists at all, and which
// one -- the verify screen challenges that id (02 brief, A1: without it a
// returning admin's code box never unlocked).
export async function adminStepUp(): Promise<StepUp> {
  let aal2 = false;
  let enrolled = false;
  let factorId: string | null = null;
  try {
    const client = await createAuthClient();
    const [{ data: aal }, { data: factors }] = await Promise.all([client.auth.mfa.getAuthenticatorAssuranceLevel(), client.auth.mfa.listFactors()]);
    aal2 = aal?.currentLevel === "aal2";
    const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
    enrolled = Boolean(verified);
    factorId = verified?.id ?? null;
  } catch {
    aal2 = false;
    enrolled = false;
    factorId = null;
  }
  const windowOpen = adminWindowStartedAt((await cookies()).get(ADMIN_WINDOW_COOKIE)?.value) !== null;
  return { aal2, windowOpen, enrolled, factorId };
}

function verifyHref(returnTo: string): string {
  return `${ADMIN_MFA_PATH}?next=${encodeURIComponent(returnTo)}`;
}

// ---- pages ---------------------------------------------------------------

// Every /admin page: platform role (owner or admin), then the step-up.
// Not signed in -> /login; signed in without a platform role -> 404 (the
// URL never confirms the area exists); platform role without a fresh code
// -> the verify screen, which comes back here.
export async function requireAdmin(returnTo: string): Promise<Session> {
  const session = await requirePlatformRole("platform_admin", returnTo);
  const step = await adminStepUp();
  if (!step.aal2 || !step.windowOpen) redirect(verifyHref(returnTo));
  return session;
}

// ---- route handlers -------------------------------------------------------

export async function requireAdminApi(): Promise<{ ok: true; session: Session } | { ok: false; response: NextResponse }> {
  const signedIn = await requireSignedInApi();
  if (!signedIn.ok) return signedIn;
  if (!hasPlatformRole(signedIn.session, "platform_admin")) {
    return { ok: false, response: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  }
  const step = await adminStepUp();
  if (!step.aal2 || !step.windowOpen) {
    return { ok: false, response: NextResponse.json({ error: "Two-step verification required.", code: "mfa_required", verify: ADMIN_MFA_PATH }, { status: 403 }) };
  }
  return signedIn;
}
