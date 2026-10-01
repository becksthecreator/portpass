import { normalizePhoneE164 } from "@/lib/phone";
import { parseCsv } from "@/lib/teamsnapImport";

// PortPass Scout (brief 14): the rules of the lead catalogue with no
// database and no network in them, so they can be tested on their own.
// Handbook §8 is the source for the statuses, the score and the outreach
// rules ("one-to-one messages only", "do not contact is forever").

export const LEAD_STATUSES = ["new", "contacted", "replied", "page_drafted", "live", "not_now", "do_not_contact"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  page_drafted: "Page drafted",
  live: "Live",
  not_now: "Not now",
  do_not_contact: "Do not contact",
};

// New -> Contacted -> Replied -> Page drafted -> Live, with two exits.
export const LEAD_PIPELINE: LeadStatus[] = ["new", "contacted", "replied", "page_drafted", "live"];

export const LEAD_SOURCES = ["google_places", "instagram", "inbound_form", "referral", "founder", "tracker_import"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  google_places: "Google Places",
  instagram: "Instagram (handle typed by a founder)",
  inbound_form: "Get listed form",
  referral: "Referral",
  founder: "Added by a founder",
  tracker_import: "Prospect Tracker import",
};

export const BOOKING_METHODS = ["whatsapp_dm", "phone", "instagram_dm", "website_booking", "unknown"] as const;
export type BookingMethod = (typeof BOOKING_METHODS)[number];

export const BOOKING_METHOD_LABEL: Record<BookingMethod, string> = {
  whatsapp_dm: "WhatsApp",
  phone: "Phone",
  instagram_dm: "Instagram DM",
  website_booking: "Books online already",
  unknown: "Not known",
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === "string" && (LEAD_SOURCES as readonly string[]).includes(value);
}

export function isBookingMethod(value: unknown): value is BookingMethod {
  return typeof value === "string" && (BOOKING_METHODS as readonly string[]).includes(value);
}

// One row per business: "Bahamas National Sailing School", "bahamas
// national sailing school." and "BAHAMAS  NATIONAL SAILING-SCHOOL" are the
// same lead. Accents are folded and "&" reads as "and".
export function dedupeKey(businessName: string): string {
  return businessName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// "@Futprep_Athletics", "instagram.com/futprep_athletics/" and a full
// profile link all become "futprep_athletics"; anything that isn't a
// handle (a sentence, a hashtag, a post link) is null.
export function normalizeInstagramHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  let text = value.trim();
  const link = /instagram\.com\/([^/?#\s]+)/i.exec(text);
  if (link) text = link[1];
  text = text.replace(/^@/, "").replace(/\/$/, "").toLowerCase();
  if (text === "p" || text === "reel" || text === "explore") return null;
  return /^[a-z0-9._]{1,30}$/.test(text) ? text : null;
}

// Only http(s) links are ever stored or shown as links.
export function cleanUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// ---- The Handbook lead score (§8) ------------------------------------------

export const SCORE_SIGNALS = [
  { key: "books_by_dm", points: 25, label: "Books by WhatsApp, DM or phone only" },
  { key: "publishes_prices", points: 15, label: "Publishes prices" },
  { key: "high_value", points: 15, label: "High value ($300 or more)" },
  { key: "posted_recently", points: 10, label: "Posted in the last 30 days" },
  { key: "real_demand", points: 10, label: "Real demand" },
  { key: "limited_inventory", points: 10, label: "Limited inventory" },
  { key: "section_we_fill", points: 10, label: "A section we're filling" },
  { key: "warm_connection", points: 10, label: "Warm connection" },
  { key: "online_booking", points: -30, label: "Already uses online booking" },
] as const;

export type ScoreSignalKey = (typeof SCORE_SIGNALS)[number]["key"];
export type ScoreSignals = Partial<Record<ScoreSignalKey, boolean>>;
export type ScoreReason = { key: ScoreSignalKey; label: string; points: number; why?: string };

// The arithmetic is done here, never by the AI step: it only says which
// signals it saw and why. The result is kept between 0 and 100.
export function scoreLead(signals: ScoreSignals, why: Partial<Record<ScoreSignalKey, string>> = {}): { score: number; reasons: ScoreReason[] } {
  const reasons: ScoreReason[] = [];
  let total = 0;
  for (const signal of SCORE_SIGNALS) {
    if (!signals[signal.key]) continue;
    total += signal.points;
    const note = why[signal.key]?.trim();
    reasons.push({ key: signal.key, label: signal.label, points: signal.points, ...(note ? { why: note.slice(0, 240) } : {}) });
  }
  return { score: Math.max(0, Math.min(100, total)), reasons };
}

// "70+ call this week · 40–69 message · under 40 park."
export function scoreAction(score: number | null): "call" | "message" | "park" | "unscored" {
  if (score === null) return "unscored";
  if (score >= 70) return "call";
  if (score >= 40) return "message";
  return "park";
}

export const SCORE_ACTION_LABEL: Record<ReturnType<typeof scoreAction>, string> = {
  call: "Call this week",
  message: "Message",
  park: "Park",
  unscored: "Not scored",
};

// ---- Sending, by hand ------------------------------------------------------

// The founder opens WhatsApp with the draft and presses send themselves.
// Nothing in PortPass ever sends a message to a lead.
export function leadWhatsappLink(whatsappE164: string | null, message: string | null): string | null {
  if (!whatsappE164) return null;
  const digits = whatsappE164.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const text = message?.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ---- The Prospect Tracker import (one-off) -----------------------------------

export type LeadDraft = {
  businessName: string;
  section: string | null;
  subsection: string | null;
  island: string | null;
  area: string | null;
  whatTheyDo: string | null;
  bookingMethod: BookingMethod;
  onlinePayment: string | null;
  pricesText: string | null;
  instagramHandle: string | null;
  phone: string | null;
  whatsappE164: string | null;
  email: string | null;
  websiteUrl: string | null;
  address: string | null;
  whyFit: string | null;
  priority: number | null;
  score: number | null;
  status: LeadStatus;
  source: LeadSource;
  sourceUrls: string[];
  referralCode: string | null;
  owner: string | null;
  nextStep: string | null;
  lastContactOn: string | null;
  notes: string | null;
};

export function emptyLeadDraft(businessName: string, source: LeadSource): LeadDraft {
  return {
    businessName, section: null, subsection: null, island: null, area: null, whatTheyDo: null, bookingMethod: "unknown", onlinePayment: null,
    pricesText: null, instagramHandle: null, phone: null, whatsappE164: null, email: null, websiteUrl: null, address: null, whyFit: null,
    priority: null, score: null, status: "new", source, sourceUrls: [], referralCode: null, owner: null, nextStep: null, lastContactOn: null, notes: null,
  };
}

const TRACKER_COLUMNS: Record<string, string[]> = {
  section: ["section"],
  subsection: ["subcategory", "subsection"],
  businessName: ["business", "business name", "name"],
  whatTheyDo: ["what they do"],
  booking: ["how they book today", "how they book"],
  onlinePayment: ["online payment today", "online payment"],
  instagram: ["instagram"],
  phone: ["phone / whatsapp", "phone/whatsapp", "phone", "whatsapp"],
  email: ["email"],
  website: ["website"],
  whyFit: ["why a good fit", "why a good fit?"],
  priority: ["priority"],
  status: ["status"],
  owner: ["owner"],
  nextStep: ["next step"],
  lastContact: ["last contact"],
  notes: ["notes"],
  score: ["lead score (0-100)", "lead score", "score"],
  doNotContact: ["do not contact"],
};

function header(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// "Not contacted", "Contacted", "Meeting", "Page built", "Claim link sent",
// "Live", "Onboarding — needs price", "Not now" as the tracker writes them.
export function trackerStatus(value: string, doNotContact: string): LeadStatus {
  if (/^(y|yes|true|1)$/i.test(doNotContact.trim())) return "do_not_contact";
  const text = value.trim().toLowerCase();
  if (!text || text.startsWith("not contacted")) return "new";
  if (text.startsWith("do not contact")) return "do_not_contact";
  if (text.startsWith("live")) return "live";
  if (text.startsWith("page") || text.startsWith("claim") || text.startsWith("onboarding")) return "page_drafted";
  if (text.startsWith("meeting") || text.startsWith("replied") || text.startsWith("in conversation")) return "replied";
  if (text.startsWith("contacted")) return "contacted";
  if (text.startsWith("not now") || text.startsWith("parked") || text.startsWith("no")) return "not_now";
  return "new";
}

// The tracker's free text on how a business takes bookings today.
export function bookingMethodFrom(text: string): BookingMethod {
  const t = text.toLowerCase();
  if (!t.trim() || t.trim() === "—" || t.trim() === "-") return "unknown";
  if (/(book(s|ing)? online|online booking|booking (site|system|platform|engine|widget)|fareharbor|calendly|mindbody|eventbrite|book now button|checkout)/.test(t)) return "website_booking";
  if (/whatsapp/.test(t)) return "whatsapp_dm";
  if (/(instagram|\bdm\b|direct message)/.test(t)) return "instagram_dm";
  if (/(phone|call|tel\b)/.test(t)) return "phone";
  return "unknown";
}

function sectionSlug(name: string, sections: Array<{ slug: string; name: string; subcategories: Array<{ slug: string; name: string }> }>): { section: string | null; lookup: (sub: string) => string | null } {
  const key = dedupeKey(name);
  const match = sections.find((s) => dedupeKey(s.name) === key || s.slug === name.trim().toLowerCase()) ?? null;
  return {
    section: match?.slug ?? null,
    lookup: (sub: string) => {
      const subKey = dedupeKey(sub);
      if (!subKey || !match) return null;
      const found = match.subcategories.find((c) => dedupeKey(c.name) === subKey || dedupeKey(c.name).startsWith(subKey) || subKey.startsWith(dedupeKey(c.name).split(" ")[0] + " ") || c.slug === sub.trim().toLowerCase());
      return found?.slug ?? null;
    },
  };
}

export type TrackerParse = { drafts: LeadDraft[]; skipped: Array<{ row: number; reason: string }>; unmappedColumns: string[] };

// Reads the Prospects sheet saved as CSV. A phone becomes a WhatsApp number
// only when it parses as one; an Instagram cell becomes a handle only when
// it is one. Rows with no business name are skipped and counted.
export function parseTrackerCsv(text: string, sections: Array<{ slug: string; name: string; subcategories: Array<{ slug: string; name: string }> }>): TrackerParse {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return { drafts: [], skipped: [], unmappedColumns: [] };
  const headers = rows[0].map(header);
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(TRACKER_COLUMNS)) {
    const at = headers.findIndex((h) => names.includes(h));
    if (at >= 0) index[field] = at;
  }
  const used = new Set(Object.values(index));
  const unmappedColumns = rows[0].filter((_, i) => !used.has(i) && rows[0][i].trim() !== "" && rows[0][i].trim() !== "#");
  const cell = (row: string[], field: string): string => (index[field] === undefined ? "" : (row[index[field]] ?? "").trim());
  const orNull = (value: string): string | null => (value && value !== "—" && value !== "-" ? value : null);

  const drafts: LeadDraft[] = [];
  const skipped: TrackerParse["skipped"] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row, i) => {
    const businessName = cell(row, "businessName");
    const key = dedupeKey(businessName);
    if (!key) {
      skipped.push({ row: i + 2, reason: "No business name" });
      return;
    }
    if (seen.has(key)) {
      skipped.push({ row: i + 2, reason: `"${businessName}" appears twice in the file` });
      return;
    }
    seen.add(key);
    const { section, lookup } = sectionSlug(cell(row, "section"), sections);
    const phoneText = cell(row, "phone");
    const whatsapp = phoneText ? normalizePhoneE164(phoneText.split(/[,;/]| or /i)[0]) : null;
    const scoreText = cell(row, "score");
    const score = /^\d{1,3}$/.test(scoreText) ? Math.max(0, Math.min(100, Number(scoreText))) : null;
    const priorityText = cell(row, "priority");
    const website = cleanUrl(orNull(cell(row, "website")));
    const lastContact = cell(row, "lastContact");
    const draft = emptyLeadDraft(businessName, "tracker_import");
    draft.section = section;
    draft.subsection = lookup(cell(row, "subsection")) ?? orNull(cell(row, "subsection"));
    draft.whatTheyDo = orNull(cell(row, "whatTheyDo"));
    draft.bookingMethod = bookingMethodFrom(cell(row, "booking"));
    draft.onlinePayment = orNull(cell(row, "onlinePayment"));
    draft.instagramHandle = normalizeInstagramHandle(cell(row, "instagram"));
    draft.phone = orNull(phoneText);
    draft.whatsappE164 = whatsapp;
    draft.email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cell(row, "email")) ? cell(row, "email").toLowerCase() : null;
    draft.websiteUrl = website;
    draft.whyFit = orNull(cell(row, "whyFit"));
    draft.priority = /^[1-3]$/.test(priorityText) ? Number(priorityText) : null;
    draft.score = score;
    draft.status = trackerStatus(cell(row, "status"), cell(row, "doNotContact"));
    draft.owner = orNull(cell(row, "owner"));
    draft.nextStep = orNull(cell(row, "nextStep"));
    draft.lastContactOn = /^\d{4}-\d{2}-\d{2}$/.test(lastContact) ? lastContact : null;
    const bookingNote = orNull(cell(row, "booking"));
    draft.notes = [orNull(cell(row, "notes")), bookingNote ? `How they book today: ${bookingNote}` : null].filter(Boolean).join("\n") || null;
    draft.sourceUrls = [website, draft.instagramHandle ? `https://www.instagram.com/${draft.instagramHandle}/` : null].filter((u): u is string => Boolean(u));
    drafts.push(draft);
  });
  return { drafts, skipped, unmappedColumns };
}
