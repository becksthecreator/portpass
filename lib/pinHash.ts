import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Staff PIN storage (Brief 24, part D). A PIN is six or more digits, so a
// plain hash of it is quick to reverse by trying every value; each PIN is
// therefore stored as scrypt over a random salt of its own, which makes
// every guess slow and every salt different. No setting is involved: the
// salt travels with the hash.
//
//   scrypt$<N>$<r>$<p>$<salt, base64url>$<key, base64url>
//
// The old form, an unsalted hex SHA-256, is still recognised so an
// existing account keeps signing in; the caller stores the new form after
// a correct sign-in (see upgrade in app/futprep/staff-auth.ts and
// app/weddings/staff-auth.ts). Nothing here logs or returns a PIN.

const scrypt = promisify(scryptCallback);

// 16 MB of memory and about 50 ms on a small server per check: slow for a
// guesser, unnoticed by a coach signing in once a day.
const COST = 16384;
const BLOCK = 8;
const PARALLEL = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const LEGACY = /^[0-9a-f]{64}$/;

export type PinCheck = {
  ok: boolean;
  // True when the stored value is the old unsalted form and the PIN was
  // right: store hashPin(pin) now.
  upgrade: boolean;
};

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = (await scrypt(pin, salt, KEY_BYTES, { N: COST, r: BLOCK, p: PARALLEL })) as Buffer;
  return ["scrypt", COST, BLOCK, PARALLEL, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export function isLegacyPinHash(stored: string): boolean {
  return LEGACY.test(stored);
}

export async function verifyPin(pin: string, stored: string): Promise<PinCheck> {
  if (!pin || !stored) return { ok: false, upgrade: false };
  if (isLegacyPinHash(stored)) {
    const digest = createHash("sha256").update(pin).digest("hex");
    const ok = timingSafeEqual(Buffer.from(digest), Buffer.from(stored));
    return { ok, upgrade: ok };
  }
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return { ok: false, upgrade: false };
  const cost = Number(parts[1]);
  const block = Number(parts[2]);
  const parallel = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (!Number.isInteger(cost) || !Number.isInteger(block) || !Number.isInteger(parallel) || salt.length === 0 || expected.length === 0) return { ok: false, upgrade: false };
  let key: Buffer;
  try {
    key = (await scrypt(pin, salt, expected.length, { N: cost, r: block, p: parallel })) as Buffer;
  } catch {
    return { ok: false, upgrade: false };
  }
  return { ok: key.length === expected.length && timingSafeEqual(key, expected), upgrade: false };
}
