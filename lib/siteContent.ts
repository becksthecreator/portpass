// Site content a founder can change from Admin -> Content with no deploy
// (brief 08, 1.9): the announcement bar and the order of the homepage's
// "Open now" cards. The shapes and the checks, with no database in them.

export type Announcement = {
  text: string;
  // An internal path ("/apply") or a full https link. null: no link.
  href: string | null;
  linkLabel: string | null;
  active: boolean;
  // The last day it shows, on Nassau's calendar (YYYY-MM-DD). null: until
  // it is switched off.
  until: string | null;
};

export const EMPTY_ANNOUNCEMENT: Announcement = { text: "", href: null, linkLabel: null, active: false, until: null };

export const ANNOUNCEMENT_MAX = 140;
export const LINK_LABEL_MAX = 30;

// Only a path on this site or an https address: never javascript:, data:
// or a protocol-relative "//" link.
export function cleanHref(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const href = value.trim();
  if (!href) return null;
  if (href.length > 300 || /[\s<>"'`\\]/.test(href)) return undefined;
  if (href.startsWith("/")) return href.startsWith("//") ? undefined : href;
  try {
    // Checked as it will be stored: an address with accents grows when it
    // is written out, and must still read back as valid.
    const url = new URL(href);
    const stored = url.toString();
    return url.protocol === "https:" && stored.length <= 300 ? stored : undefined;
  } catch {
    return undefined;
  }
}

function realDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function cleanAnnouncement(input: unknown): { ok: true; value: Announcement } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
  const raw = input as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.replace(/\s+/g, " ").trim() : "";
  const active = raw.active === true;
  if (text.length > ANNOUNCEMENT_MAX) return { ok: false, error: `Keep the announcement to ${ANNOUNCEMENT_MAX} characters.` };
  if (active && !text) return { ok: false, error: "Write the announcement before switching it on." };
  const href = cleanHref(raw.href);
  if (href === undefined) return { ok: false, error: "The link must be a page on this site (starting with /) or a full https address." };
  const label = typeof raw.linkLabel === "string" ? raw.linkLabel.replace(/\s+/g, " ").trim() : "";
  if (label.length > LINK_LABEL_MAX) return { ok: false, error: `Keep the link's words to ${LINK_LABEL_MAX} characters.` };
  const until = typeof raw.until === "string" && raw.until.trim() ? raw.until.trim() : null;
  if (until !== null && !realDay(until)) return { ok: false, error: "The last day isn't a real date." };
  return { ok: true, value: { text, href, linkLabel: href ? label || "See more" : null, active, until } };
}

// What is stored may be older than this code, or hand-edited: read it as
// carefully as what a form sends, and fall back to "off".
export function readAnnouncement(stored: unknown): Announcement {
  const cleaned = cleanAnnouncement(stored);
  return cleaned.ok ? cleaned.value : EMPTY_ANNOUNCEMENT;
}

export function announcementVisible(announcement: Announcement, today: string): boolean {
  return announcement.active && Boolean(announcement.text) && (announcement.until === null || today <= announcement.until);
}

// Today on Nassau's calendar, as YYYY-MM-DD.
export function nassauDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// ---- The homepage's card order -----------------------------------------------------

export const SPOTLIGHT_MAX = 50;

// Business slugs, first to last. Anything that isn't a slug is dropped.
export function cleanSpotlight(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 80) seen.add(value);
    if (seen.size >= SPOTLIGHT_MAX) break;
  }
  return Array.from(seen);
}

// The chosen businesses first, in the chosen order; everyone else after
// them in the order they already had. A slug that is no longer live is
// simply not there.
export function orderBySpotlight<T extends { slug: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const rank = new Map(order.map((slug, index) => [slug, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (rank.get(a.item.slug) ?? order.length + a.index) - (rank.get(b.item.slug) ?? order.length + b.index))
    .map((entry) => entry.item);
}

// The motion kill switch (brief 22, M1): one stored row, { enabled }. On
// unless it was switched off; anything odd in storage reads as on, since
// a page that moves is the site's normal state and a page that does not
// move is still a whole page either way.
export type MotionSetting = { enabled: boolean };

export function cleanMotion(input: unknown): { ok: true; value: MotionSetting } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || typeof (input as { enabled?: unknown }).enabled !== "boolean") return { ok: false, error: "The motion switch is on or off." };
  return { ok: true, value: { enabled: (input as { enabled: boolean }).enabled } };
}

export function readMotion(stored: unknown): boolean {
  const cleaned = cleanMotion(stored);
  return cleaned.ok ? cleaned.value.enabled : true;
}
