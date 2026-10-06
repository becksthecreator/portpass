import { createHmac, timingSafeEqual } from "node:crypto";

// The staff PIN session cookie for the Futprep and Wedding Desk staff
// areas. It used to be "<account>.<role>.<SHA-256 of account, role and the
// stored PIN hash>": no server secret was involved, so anyone who could
// read a PIN hash could mint a cookie without signing in, a captured cookie
// let every six-digit PIN be tried offline, and nothing but the browser's
// own cookie expiry ever ended a session.
//
// Now: "<account>.<role>.<issued at, seconds>.<HMAC>", keyed with a secret
// only the server has, and refused once it is older than 8 hours.
// Changing a PIN still signs everyone on that account out, because the PIN
// hash is part of what is signed.

export type StaffArea = "futprep" | "weddings";

// A shift, not a day (Brief 21, part C): staff sessions end after 8 hours.
export const STAFF_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
// A token dated slightly ahead of this server's clock is fine; further
// than this and it wasn't issued by us.
const CLOCK_SKEW_SECONDS = 5 * 60;

function signingKey(): string | null {
  // Server-only; never reaches the browser. Derived, so the staff cookie
  // and the admin window cookie can't be swapped for one another.
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createHmac("sha256", "portpass-staff-session").update(secret).digest("hex");
}

function sign(area: StaffArea, accountKey: string, role: string, issuedAt: number, pinHash: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update([area, accountKey, role, String(issuedAt), pinHash].join("\n")).digest("base64url");
}

// A new session token, or null when the server has no secret to sign with
// (a build with no database credentials): better no staff session than an
// unsigned one.
export function issueStaffToken(area: StaffArea, account: { accountKey: string; role: string; pinHash: string }, now: number = Date.now()): string | null {
  const issuedAt = Math.floor(now / 1000);
  const mac = sign(area, account.accountKey, account.role, issuedAt, account.pinHash);
  return mac ? `${account.accountKey}.${account.role}.${issuedAt}.${mac}` : null;
}

export type StaffTokenParts = { accountKey: string; role: string; issuedAt: number; mac: string };

// Splits a cookie value; null for anything that isn't the four-part form
// (including every cookie issued before sessions were signed).
export function readStaffToken(token: string | undefined | null): StaffTokenParts | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [accountKey, role, issued, mac] = parts;
  if (!accountKey || !role || !mac || !/^\d{9,11}$/.test(issued)) return null;
  return { accountKey, role, issuedAt: Number(issued), mac };
}

// True only for a token this server signed, for this staff area, for this
// account as it is now (same role, same PIN), within the last 12 hours.
export function staffTokenValid(area: StaffArea, parts: StaffTokenParts, account: { role: string; pinHash: string }, now: number = Date.now()): boolean {
  if (parts.role !== account.role) return false;
  const age = Math.floor(now / 1000) - parts.issuedAt;
  if (age > STAFF_SESSION_MAX_AGE_SECONDS || age < -CLOCK_SKEW_SECONDS) return false;
  const expected = sign(area, parts.accountKey, account.role, parts.issuedAt, account.pinHash);
  if (!expected) return false;
  const given = Buffer.from(parts.mac);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
