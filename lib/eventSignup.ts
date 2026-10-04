// The event sign-up form (brief 18, part C): /own for the OWN Conference,
// /join/<event> for the next one. The rules only: what counts as an event
// code, what a submission must have, and how one waits in the browser
// until the phone is back online. Pure, so the form, the API and the tests
// share it.
import { normalizePhoneE164 } from "@/lib/phone";

// "own2026", "school-fair-nov": lower-case words and digits joined by dashes.
const EVENT_CODE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function cleanEventCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  return code.length >= 2 && code.length <= 40 && EVENT_CODE.test(code) ? code : null;
}

// Events with a name of their own. Any other well-formed code works too
// (no deploy needed for the next event) and is shown as its code in words.
const EVENT_NAMES: Record<string, string> = { own2026: "OWN Conference 2026" };

export function eventName(code: string): string {
  return EVENT_NAMES[code] ?? code.split("-").map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word)).join(" ");
}

export const OWN_EVENT = "own2026";

export type EventSignup = {
  event: string;
  name: string;
  businessName: string;
  whatsappE164: string;
  section: string;
  instagramHandle: string | null;
  whatsappConsent: boolean;
};

type Parsed = { ok: true; value: EventSignup } | { ok: false; error: string };

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

// "@harbourkids", "instagram.com/harbourkids/" -> "harbourkids"; anything
// that isn't a handle is dropped rather than refused (it is optional).
export function cleanInstagram(value: unknown): string | null {
  const raw = text(value, 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(raw) ? raw.toLowerCase() : null;
}

// `isSection` says whether a section slug is a real one.
export function parseEventSignup(body: Record<string, unknown>, isSection: (slug: string) => boolean): Parsed {
  const fail = (error: string): Parsed => ({ ok: false, error });
  const event = cleanEventCode(body.event);
  if (!event) return fail("This sign-up link isn't right. Ask us for a new one.");
  const name = text(body.name, 120);
  if (name.length < 2) return fail("Tell us your name.");
  const businessName = text(body.businessName, 150);
  if (businessName.length < 2) return fail("Tell us your business name.");
  const whatsappE164 = normalizePhoneE164(text(body.whatsapp, 40));
  if (!whatsappE164) return fail("Enter a WhatsApp number we can reach, like 423-8161 or +1 242 423 8161.");
  const section = text(body.section, 40);
  if (!section || !isSection(section)) return fail("Choose what you do.");
  return { ok: true, value: { event, name, businessName, whatsappE164, section, instagramHandle: cleanInstagram(body.instagram), whatsappConsent: body.whatsappConsent === true } };
}

// ---- waiting for a signal -----------------------------------------------------------

// A submission made with no signal waits here, in this browser only, and
// is sent when the phone is back online. It is removed as soon as the
// server has it. At most a handful are kept, and none for longer than a
// week (a phone left at a stall should not hold people's details).
export const OFFLINE_KEY = "portpass.join.pending";
export const OFFLINE_MAX = 25;
const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingSignup = { id: string; savedAt: number; body: Record<string, unknown> };

export function readPending(raw: string | null, now: number = Date.now()): PendingSignup[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((item): item is PendingSignup => Boolean(item) && typeof item.id === "string" && typeof item.savedAt === "number" && typeof item.body === "object" && item.body !== null && now - item.savedAt < OFFLINE_MAX_AGE_MS).slice(-OFFLINE_MAX);
  } catch {
    return [];
  }
}

export function addPending(list: PendingSignup[], body: Record<string, unknown>, id: string, now: number = Date.now()): PendingSignup[] {
  return [...list, { id, savedAt: now, body }].slice(-OFFLINE_MAX);
}
