import { normalizePhoneE164 } from "@/lib/phone";
import type { SectionOption } from "./enrich";
import { cleanUrl, emptyLeadDraft, isBookingMethod, isLeadStatus, normalizeInstagramHandle, type BookingMethod, type LeadDraft, type LeadSource, type LeadStatus } from "./leads";

// What the Leads screens may send to the server, checked field by field.
// Nothing typed in a form is trusted for its shape: a section must be one
// we have, a status one of the seven, a link a real http(s) link.

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function sectionOf(value: unknown, sections: SectionOption[]): SectionOption | null {
  return typeof value === "string" ? sections.find((s) => s.slug === value) ?? null : null;
}

// A founder may add a lead by hand ("after a conversation") or as a
// referral; the two lookups add their own (google_places, instagram).
const ADDABLE_SOURCES: LeadSource[] = ["founder", "referral", "google_places", "instagram"];

export function parseNewLead(body: unknown, sections: SectionOption[]): { ok: true; draft: LeadDraft; warmConnection: boolean } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Nothing to save." };
  const input = body as Record<string, unknown>;
  const businessName = text(input.businessName, 160);
  if (!businessName || businessName.length < 2) return { ok: false, error: "Enter the business name." };
  const source = ADDABLE_SOURCES.find((s) => s === input.source) ?? "founder";
  const draft = emptyLeadDraft(businessName, source);
  const section = sectionOf(input.section, sections);
  draft.section = section?.slug ?? null;
  draft.subsection = section?.subcategories.find((c) => c.slug === input.subsection)?.slug ?? null;
  draft.island = text(input.island, 80);
  draft.area = text(input.area, 80);
  draft.whatTheyDo = text(input.whatTheyDo, 600);
  draft.bookingMethod = isBookingMethod(input.bookingMethod) ? input.bookingMethod : "unknown";
  draft.pricesText = text(input.pricesText, 600);
  draft.instagramHandle = normalizeInstagramHandle(text(input.instagramHandle, 200));
  draft.phone = text(input.phone, 60);
  draft.whatsappE164 = draft.phone ? normalizePhoneE164(draft.phone) : null;
  const email = text(input.email, 200);
  draft.email = email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : null;
  draft.websiteUrl = cleanUrl(text(input.websiteUrl, 300));
  draft.address = text(input.address, 300);
  draft.whyFit = text(input.whyFit, 600);
  draft.referralCode = text(input.referralCode, 40);
  draft.owner = text(input.owner, 80);
  draft.notes = text(input.notes, 2000);
  draft.sourceUrls = [draft.websiteUrl, draft.instagramHandle ? `https://www.instagram.com/${draft.instagramHandle}/` : null, cleanUrl(text(input.mapsUrl, 400))].filter((u): u is string => Boolean(u));
  if (source === "referral" && !draft.referralCode && !draft.notes) return { ok: false, error: "For a referral, say who referred them (a code or a note)." };
  return { ok: true, draft, warmConnection: input.warmConnection === true };
}

export type ParsedPatch = Partial<{
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
  whyFit: string | null;
  warmConnection: boolean;
  status: LeadStatus;
  owner: string | null;
  nextStep: string | null;
  lastContactOn: string | null;
  notes: string | null;
  draftMessage: string | null;
}>;

export function parseLeadPatch(body: unknown, sections: SectionOption[]): { ok: true; patch: ParsedPatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Nothing to save." };
  const input = body as Record<string, unknown>;
  const patch: ParsedPatch = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  if (has("status")) {
    if (!isLeadStatus(input.status)) return { ok: false, error: "That isn't a lead status." };
    patch.status = input.status;
  }
  if (has("section")) {
    const section = sectionOf(input.section, sections);
    if (input.section !== null && input.section !== "" && !section) return { ok: false, error: "That isn't one of our sections." };
    patch.section = section?.slug ?? null;
    if (has("subsection") || !section) patch.subsection = section?.subcategories.find((c) => c.slug === input.subsection)?.slug ?? null;
  }
  if (has("bookingMethod")) {
    if (!isBookingMethod(input.bookingMethod)) return { ok: false, error: "That isn't a booking method we track." };
    patch.bookingMethod = input.bookingMethod;
  }
  if (has("lastContactOn")) {
    const value = input.lastContactOn;
    if (value !== null && value !== "" && !(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))) return { ok: false, error: "Use a date like 2026-10-03." };
    patch.lastContactOn = typeof value === "string" && value ? value : null;
  }
  if (has("email")) {
    const email = text(input.email, 200);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email address doesn't look right." };
    patch.email = email ? email.toLowerCase() : null;
  }
  if (has("phone")) {
    patch.phone = text(input.phone, 60);
    patch.whatsappE164 = patch.phone ? normalizePhoneE164(patch.phone) : null;
  }
  if (has("websiteUrl")) {
    const raw = text(input.websiteUrl, 300);
    const url = cleanUrl(raw);
    if (raw && !url) return { ok: false, error: "That website address doesn't look right." };
    patch.websiteUrl = url;
  }
  if (has("instagramHandle")) {
    const raw = text(input.instagramHandle, 200);
    const handle = normalizeInstagramHandle(raw);
    if (raw && !handle) return { ok: false, error: "That doesn't look like an Instagram handle." };
    patch.instagramHandle = handle;
  }
  if (has("warmConnection")) patch.warmConnection = input.warmConnection === true;
  const plain: Array<[keyof ParsedPatch, number]> = [["island", 80], ["area", 80], ["whatTheyDo", 600], ["onlinePayment", 200], ["pricesText", 600], ["whyFit", 600], ["owner", 80], ["nextStep", 300], ["notes", 2000], ["draftMessage", 2000]];
  for (const [key, max] of plain) {
    if (has(key)) (patch as Record<string, unknown>)[key] = text(input[key], max);
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to save." };
  return { ok: true, patch };
}
