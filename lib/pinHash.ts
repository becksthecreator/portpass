import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

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

// 16 MB of memory and about 50 ms on a small server per check: slow for a
// guesser, unnoticed by a coach signing in once a day.
const COST = 16384;
const BLOCK = 8;
const PARALLEL = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

// What a stored value may ask for. A value that asks for more is not one
// this code wrote, and is refused rather than run (a crafted row must not
// be able to make a check eat the server's memory or time).
const MAX_COST = 1 << 20;
const MAX_BLOCK = 32;
const MAX_PARALLEL = 16;
const MAX_KEY_BYTES = 128;
const MAX_SALT_BYTES = 64;

const LEGACY = /^[0-9a-f]{64}$/;

export type PinCheck = {
  ok: boolean;
  // True when the stored value is the old unsalted form and the PIN was
  // right: store hashPin(pin) now.
  upgrade: boolean;
};

type Cost = { N: number; r: number; p: number };

function derive(pin: string, salt: Buffer, keyLength: number, cost: Cost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, keyLength, { N: cost.N, r: cost.r, p: cost.p, maxmem: 2 * 128 * cost.N * cost.r + 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(pin, salt, KEY_BYTES, { N: COST, r: BLOCK, p: PARALLEL });
  return ["scrypt", COST, BLOCK, PARALLEL, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export function isLegacyPinHash(stored: string): boolean {
  return LEGACY.test(stored);
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 1 && (value & (value - 1)) === 0;
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
  const cost: Cost = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) };
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  const sane =
    isPowerOfTwo(cost.N) && cost.N <= MAX_COST &&
    Number.isInteger(cost.r) && cost.r >= 1 && cost.r <= MAX_BLOCK &&
    Number.isInteger(cost.p) && cost.p >= 1 && cost.p <= MAX_PARALLEL &&
    salt.length >= 8 && salt.length <= MAX_SALT_BYTES &&
    expected.length >= 16 && expected.length <= MAX_KEY_BYTES;
  if (!sane) return { ok: false, upgrade: false };
  let key: Buffer;
  try {
    key = await derive(pin, salt, expected.length, cost);
  } catch {
    return { ok: false, upgrade: false };
  }
  return { ok: key.length === expected.length && timingSafeEqual(key, expected), upgrade: false };
}
