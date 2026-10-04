import { createHmac, timingSafeEqual } from "node:crypto";

// The demo session (brief 18, part B): what a visitor gets from one tap on
// /demo. It is not a PortPass account and it is never read by the guards
// that protect real businesses, the admin area or anyone's account
// (lib/auth/guards.ts): only the /demo screens and the payments API's demo
// door look at it, and only for the one business that is the demo.
//
// "<demo business id>.<issued at, seconds>.<HMAC>", keyed with a secret
// only the server has, and refused once it is two hours old.

export const DEMO_COOKIE = "portpass_demo";
export const DEMO_SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

function signingKey(): string | null {
  // Derived with its own label, so a demo cookie can never stand in for a
  // staff session, the admin window or a Member Pass (and none of those
  // for it).
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createHmac("sha256", "portpass-demo-session").update(secret).digest("hex");
}

function sign(organizationId: number, issuedAt: number): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(["demo", String(organizationId), String(issuedAt)].join("\n")).digest("base64url");
}

// A new token for the demo business, or null when the server has no secret
// to sign with: better no demo than an unsigned session.
export function issueDemoToken(organizationId: number, now: number = Date.now()): string | null {
  if (!Number.isInteger(organizationId) || organizationId <= 0) return null;
  const issuedAt = Math.floor(now / 1000);
  const mac = sign(organizationId, issuedAt);
  return mac ? `${organizationId}.${issuedAt}.${mac}` : null;
}

// The business a token was issued for, or null for anything this server
// did not sign in the last two hours. The caller still has to check that
// business is the demo: a token is only ever good for that one.
export function demoTokenOrganization(token: string | undefined | null, now: number = Date.now()): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [org, issued, mac] = parts;
  if (!/^[1-9]\d{0,11}$/.test(org) || !/^\d{9,11}$/.test(issued) || !mac) return null;
  const organizationId = Number(org);
  const issuedAt = Number(issued);
  const age = Math.floor(now / 1000) - issuedAt;
  if (age > DEMO_SESSION_MAX_AGE_SECONDS || age < -CLOCK_SKEW_SECONDS) return null;
  const expected = sign(organizationId, issuedAt);
  if (!expected) return null;
  const given = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted) ? organizationId : null;
}
