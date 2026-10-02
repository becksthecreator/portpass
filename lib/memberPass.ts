import { createHmac, timingSafeEqual } from "node:crypto";

// The Member Pass code (brief 10, 6.2): six digits that change every 30
// seconds, so a screenshot of someone's pass stops working. It is an HMAC
// of the member number and the time window, made with a secret that never
// leaves the server: the pass page is handed ready-made codes, never the
// means to make them.

export const PASS_WINDOW_SECONDS = 30;
// A code is accepted for its own 30 seconds and the 60 after: older than
// 90 seconds fails. One window ahead is also accepted, for a phone whose
// clock runs a little fast.
export const PASS_WINDOWS_BACK = 2;
export const PASS_WINDOWS_AHEAD = 1;
// The pass page is given this many codes: twelve minutes in hand, topped
// up every minute, so it keeps working for ten once the signal goes.
export const PASS_CODES_AHEAD = 24;

export function passWindow(now: number = Date.now()): number {
  return Math.floor(now / 1000 / PASS_WINDOW_SECONDS);
}

// The key is derived from a secret the server already holds, so there is
// no new secret to set up or to leak.
function passKey(secret: string): Buffer {
  return createHmac("sha256", "portpass-member-pass").update(secret).digest();
}

export function passCode(secret: string, memberNumber: string, window: number): string {
  const mac = createHmac("sha256", passKey(secret)).update(`${memberNumber}:${window}`).digest();
  // The same truncation as an authenticator app's codes (RFC 4226).
  const offset = mac[mac.length - 1] & 0x0f;
  const value = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

export function checkPassCode(secret: string, memberNumber: string, typed: string, now: number = Date.now()): boolean {
  const code = typed.replace(/\D/g, "");
  if (!secret || code.length !== 6) return false;
  const current = passWindow(now);
  let match = false;
  // Every candidate is compared, in the same time, whether or not one matched.
  for (let window = current - PASS_WINDOWS_BACK; window <= current + PASS_WINDOWS_AHEAD; window += 1) {
    if (timingSafeEqual(Buffer.from(passCode(secret, memberNumber, window)), Buffer.from(code))) match = true;
  }
  return match;
}

export type PassCode = { code: string; from: number; until: number };

// The codes for now and the next ten minutes, each with the moment it
// starts and stops being the one to show.
export function upcomingPassCodes(secret: string, memberNumber: string, now: number = Date.now()): PassCode[] {
  const first = passWindow(now);
  return Array.from({ length: PASS_CODES_AHEAD }, (_, index) => {
    const window = first + index;
    return { code: passCode(secret, memberNumber, window), from: window * PASS_WINDOW_SECONDS * 1000, until: (window + 1) * PASS_WINDOW_SECONDS * 1000 };
  });
}

// The server secret the pass is keyed from. Empty when the server isn't
// configured, in which case no code is ever valid.
export function passSecret(): string {
  return process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
}

// ---- After a check ----------------------------------------------------------------------

// A pass code lasts 90 seconds; recording the perk at the till can take
// longer. A valid check hands the business a short-lived ticket naming the
// business and the member, and "record redemption" presents it: nobody
// can record a perk against a member number they only guessed.
export const CHECK_TICKET_MINUTES = 10;

function ticketMac(secret: string, organizationId: number, memberNumber: string, expires: number): string {
  return createHmac("sha256", passKey(secret)).update(`ticket:${organizationId}:${memberNumber}:${expires}`).digest("base64url");
}

export function checkTicket(secret: string, organizationId: number, memberNumber: string, now: number = Date.now()): string {
  const expires = now + CHECK_TICKET_MINUTES * 60 * 1000;
  return `${expires}.${ticketMac(secret, organizationId, memberNumber, expires)}`;
}

export function ticketValid(secret: string, organizationId: number, memberNumber: string, ticket: string, now: number = Date.now()): boolean {
  const [rawExpires, mac] = ticket.split(".");
  const expires = Number(rawExpires);
  if (!secret || !mac || !Number.isInteger(expires) || expires < now) return false;
  const expected = Buffer.from(ticketMac(secret, organizationId, memberNumber, expires));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
