import { createHash } from "node:crypto";
import { logAudit } from "./audit";
import { createDraftBusiness, getBusiness, updateBusinessDetails } from "./business";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import { normalizePhoneE164 } from "@/lib/phone";
import { PLACES_SEARCH_COST_MILLICENTS } from "@/lib/scout/places";
import {
  cleanUrl,
  dedupeKey,
  firstWhatsappNumber,
  isBookingMethod,
  isLeadStatus,
  leadsFunnel,
  normalizeInstagramHandle,
  scoreLead,
  type BookingMethod,
  type LeadDraft,
  type LeadsFunnel,
  type LeadStatusChange,
  type LeadSource,
  type LeadStatus,
  type ScoreReason,
  type ScoreSignalKey,
  type ScoreSignals,
} from "@/lib/scout/leads";

// PortPass Scout (brief 14): Admin -> Leads. Platform staff only; every
// caller is behind requireAdmin / requireAdminApi. Only details a business
// publishes itself are kept, and nothing here ever sends a message.

export type Lead = {
  id: number;
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
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  googleRating: number | null;
  googleRatingCount: number | null;
  whyFit: string | null;
  warmConnection: boolean;
  priority: number | null;
  score: number | null;
  scoreReasons: ScoreReason[];
  status: LeadStatus;
  source: LeadSource;
  sourceUrls: string[];
  referralCode: string | null;
  owner: string | null;
  nextStep: string | null;
  lastContactOn: string | null;
  notes: string | null;
  draftMessage: string | null;
  enrichedAt: string | null;
  enrichmentModel: string | null;
  organizationId: number | null;
  applicationId: number | null;
  createdAt: string;
  updatedAt: string;
};

const LEAD_COLUMNS =
  "id,business_name,section,subsection,island,area,what_they_do,booking_method,online_payment,prices_text,instagram_handle,phone,whatsapp_e164,email,website_url,address,google_place_id,google_maps_url,google_rating,google_rating_count,why_fit,warm_connection,priority,score,score_reasons,status,source,source_urls,referral_code,owner,next_step,last_contact_on,notes,draft_message,enriched_at,enrichment_model,organization_id,application_id,created_at,updated_at";

function toLead(row: Record<string, unknown>): Lead {
  const text = (key: string) => (row[key] as string | null) ?? null;
  const num = (key: string) => (row[key] === null || row[key] === undefined ? null : Number(row[key]));
  return {
    id: Number(row.id),
    businessName: row.business_name as string,
    section: text("section"),
    subsection: text("subsection"),
    island: text("island"),
    area: text("area"),
    whatTheyDo: text("what_they_do"),
    bookingMethod: isBookingMethod(row.booking_method) ? row.booking_method : "unknown",
    onlinePayment: text("online_payment"),
    pricesText: text("prices_text"),
    instagramHandle: text("instagram_handle"),
    phone: text("phone"),
    whatsappE164: text("whatsapp_e164"),
    email: text("email"),
    websiteUrl: text("website_url"),
    address: text("address"),
    googlePlaceId: text("google_place_id"),
    googleMapsUrl: text("google_maps_url"),
    googleRating: num("google_rating"),
    googleRatingCount: num("google_rating_count"),
    whyFit: text("why_fit"),
    warmConnection: Boolean(row.warm_connection),
    priority: num("priority"),
    score: num("score"),
    scoreReasons: Array.isArray(row.score_reasons) ? (row.score_reasons as ScoreReason[]) : [],
    status: isLeadStatus(row.status) ? row.status : "new",
    source: row.source as LeadSource,
    sourceUrls: Array.isArray(row.source_urls) ? (row.source_urls as string[]) : [],
    referralCode: text("referral_code"),
    owner: text("owner"),
    nextStep: text("next_step"),
    lastContactOn: text("last_contact_on"),
    notes: text("notes"),
    draftMessage: text("draft_message"),
    enrichedAt: text("enriched_at"),
    enrichmentModel: text("enrichment_model"),
    organizationId: num("organization_id"),
    applicationId: num("application_id"),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Today's date in Nassau (YYYY-MM-DD): a message sent at 8:30pm on the 3rd
// is a contact on the 3rd, not on the 4th as UTC would have it.
export function nassauToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Websites many businesses share: never a way to tell two of them apart.
const SHARED_HOSTS = [
  "instagram.com", "facebook.com", "fb.com", "linktr.ee", "wa.me", "whatsapp.com", "google.com", "business.site", "wixsite.com", "squarespace.com",
  "weebly.com", "tripadvisor.com", "weddingwire.com", "theknot.com", "bahamaslocal.com", "yelp.com", "tiktok.com", "x.com", "twitter.com", "youtube.com", "bahamas.com",
];

// Keys that outlive a "do not contact" wipe, so the same business can't
// come back under a slightly different name ("3Cs Party Rentals" for "3C's
// Party Rental & Supplies"): its phone numbers and its own website's host.
// Only a hash of each is stored, because the tombstone keeps no contact
// details.
export function matchKeys(input: { phones: Array<string | null | undefined>; websiteUrl?: string | null }): string[] {
  const keys = new Set<string>();
  const hash = (kind: string, value: string) => `${kind}:${createHash("sha256").update(`${kind}:${value}`).digest("hex").slice(0, 32)}`;
  for (const phone of input.phones) {
    const e164 = firstWhatsappNumber(phone);
    if (e164) keys.add(hash("p", e164));
  }
  const url = cleanUrl(input.websiteUrl);
  if (url) {
    const full = new URL(url).hostname.toLowerCase();
    const host = full.startsWith("www.") ? full.slice(4) : full;
    if (!SHARED_HOSTS.some((shared) => host === shared || host.endsWith(`.${shared}`))) keys.add(hash("w", host));
  }
  return Array.from(keys);
}

function clip(value: string | null | undefined, max: number): string | null {
  const text = value?.trim();
  return text ? text.slice(0, max) : null;
}

function rowFromDraft(draft: LeadDraft): Record<string, unknown> {
  return {
    business_name: draft.businessName.trim().slice(0, 160),
    section: clip(draft.section, 60),
    subsection: clip(draft.subsection, 80),
    island: clip(draft.island, 80),
    area: clip(draft.area, 80),
    what_they_do: clip(draft.whatTheyDo, 600),
    booking_method: draft.bookingMethod,
    online_payment: clip(draft.onlinePayment, 200),
    prices_text: clip(draft.pricesText, 600),
    instagram_handle: normalizeInstagramHandle(draft.instagramHandle),
    phone: clip(draft.phone, 60),
    whatsapp_e164: draft.whatsappE164 ? normalizePhoneE164(draft.whatsappE164) : null,
    email: clip(draft.email, 200),
    website_url: cleanUrl(draft.websiteUrl),
    address: clip(draft.address, 300),
    why_fit: clip(draft.whyFit, 600),
    priority: draft.priority,
    score: draft.score,
    status: draft.status,
    source: draft.source,
    source_urls: draft.sourceUrls.map((u) => cleanUrl(u)).filter((u): u is string => Boolean(u)).slice(0, 12),
    referral_code: clip(draft.referralCode, 40),
    owner: clip(draft.owner, 80),
    next_step: clip(draft.nextStep, 300),
    last_contact_on: draft.lastContactOn,
    notes: clip(draft.notes, 2000),
  };
}

// The tombstone a "do not contact" business becomes: its name and the keys
// that stop it being added again (the name key, the Instagram handle and
// the Google place id), and nothing else.
const DO_NOT_CONTACT_WIPE = {
  status: "do_not_contact",
  phone: null,
  whatsapp_e164: null,
  email: null,
  address: null,
  website_url: null,
  source_urls: [],
  google_maps_url: null,
  google_rating: null,
  google_rating_count: null,
  referral_code: null,
  last_contact_on: null,
  island: null,
  area: null,
  section: null,
  subsection: null,
  priority: null,
  warm_connection: false,
  booking_method: "unknown",
  what_they_do: null,
  online_payment: null,
  prices_text: null,
  why_fit: null,
  next_step: null,
  notes: null,
  draft_message: null,
  enrichment: null,
  score: null,
  score_reasons: [],
  owner: null,
};

const LIST_PAGE = 1000;
const LIST_MAX = 5000;

export type LeadFilters = { section?: string | null; area?: string | null; status?: LeadStatus | "all" | null; source?: LeadSource | null; minScore?: number | null; q?: string | null };

// "Do not contact" is hidden from every list; it can only be found by
// trying to add the same business again.
export async function listLeads(filters: LeadFilters = {}): Promise<Lead[]> {
  let query = getSupabaseAdmin().from("leads").select(LEAD_COLUMNS).neq("status", "do_not_contact");
  if (filters.section) query = query.eq("section", filters.section);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.source) query = query.eq("source", filters.source);
  if (typeof filters.minScore === "number") query = query.gte("score", filters.minScore);
  // Read in pages: the API returns at most 1,000 rows at a time, and a
  // lead must never drop out of the table or the search because of that.
  const rows: Record<string, unknown>[] = [];
  const ordered = query.order("score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).order("id", { ascending: true });
  for (let from = 0; from < LIST_MAX; from += LIST_PAGE) {
    const { data, error } = await ordered.range(from, from + LIST_PAGE - 1);
    throwIfSupabaseError(error, "Could not load leads");
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if ((data ?? []).length < LIST_PAGE) break;
  }
  let leads = rows.map(toLead);
  // Area and free-text search are matched here, on a list that is small by
  // design, so what a founder types never becomes a database pattern.
  const area = filters.area?.trim().toLowerCase();
  if (area) leads = leads.filter((l) => `${l.area ?? ""} ${l.island ?? ""} ${l.address ?? ""}`.toLowerCase().includes(area));
  const q = filters.q?.trim().toLowerCase();
  if (q) leads = leads.filter((l) => `${l.businessName} ${l.whatTheyDo ?? ""} ${l.instagramHandle ?? ""}`.toLowerCase().includes(q));
  return leads;
}

export async function getLead(id: number): Promise<Lead | null> {
  const { data, error } = await getSupabaseAdmin().from("leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the lead");
  return data ? toLead(data) : null;
}

// Is this business already in the catalogue (by name, Google place or
// Instagram handle)? Used before every add, so a "do not contact" business
// is refused rather than quietly re-created.
async function findExisting(draft: { businessName: string; instagramHandle?: string | null; googlePlaceId?: string | null; keys?: string[] }): Promise<{ id: number; status: LeadStatus } | null> {
  const db = getSupabaseAdmin();
  const found = (row: { id: unknown; status: unknown } | null) => (row ? { id: Number(row.id), status: isLeadStatus(row.status) ? row.status : ("new" as LeadStatus) } : null);

  const byName = await db.from("leads").select("id,status").eq("dedupe_key", dedupeKey(draft.businessName)).maybeSingle();
  throwIfSupabaseError(byName.error, "Could not check for an existing lead");
  if (byName.data) return found(byName.data);

  const handle = normalizeInstagramHandle(draft.instagramHandle);
  if (handle) {
    const byHandle = await db.from("leads").select("id,status").eq("instagram_handle", handle).maybeSingle();
    throwIfSupabaseError(byHandle.error, "Could not check for an existing lead");
    if (byHandle.data) return found(byHandle.data);
  }
  if (draft.googlePlaceId) {
    const byPlace = await db.from("leads").select("id,status").eq("google_place_id", draft.googlePlaceId).maybeSingle();
    throwIfSupabaseError(byPlace.error, "Could not check for an existing lead");
    if (byPlace.data) return found(byPlace.data);
  }
  // A business that asked not to be contacted, coming back under another
  // name: same phone number or same website. (Open leads are matched by
  // name, handle and place only: two real businesses can share a phone.)
  if (draft.keys && draft.keys.length > 0) {
    const byKey = await db.from("leads").select("id,status").eq("status", "do_not_contact").overlaps("match_keys", draft.keys).limit(1);
    throwIfSupabaseError(byKey.error, "Could not check for an existing lead");
    if (byKey.data && byKey.data[0]) return found(byKey.data[0]);
  }
  return null;
}

export type CreateLeadResult = { ok: true; lead: Lead } | { ok: false; reason: "duplicate" | "do_not_contact" | "no_name"; existingId?: number };

export async function createLead(
  draft: LeadDraft,
  extra: { actorUserId: string | null; googlePlaceId?: string | null; googleMapsUrl?: string | null; googleRating?: number | null; googleRatingCount?: number | null; applicationId?: number | null; warmConnection?: boolean },
): Promise<CreateLeadResult> {
  const key = dedupeKey(draft.businessName);
  if (!key) return { ok: false, reason: "no_name" };
  const keys = matchKeys({ phones: [draft.whatsappE164, draft.phone], websiteUrl: draft.websiteUrl });
  const existing = await findExisting({ businessName: draft.businessName, instagramHandle: draft.instagramHandle, googlePlaceId: extra.googlePlaceId, keys });
  if (existing) return { ok: false, reason: existing.status === "do_not_contact" ? "do_not_contact" : "duplicate", existingId: existing.id };

  const row: Record<string, unknown> = {
    ...rowFromDraft(draft),
    dedupe_key: key,
    match_keys: keys,
    google_place_id: extra.googlePlaceId ?? null,
    google_maps_url: cleanUrl(extra.googleMapsUrl),
    google_rating: extra.googleRating ?? null,
    google_rating_count: extra.googleRatingCount ?? null,
    application_id: extra.applicationId ?? null,
    warm_connection: extra.warmConnection ?? draft.warmConnection ?? false,
    created_by: extra.actorUserId,
  };
  if (draft.status === "do_not_contact") Object.assign(row, DO_NOT_CONTACT_WIPE);
  const { data, error } = await getSupabaseAdmin().from("leads").insert(row).select(LEAD_COLUMNS).single();
  // Two founders adding the same business at once: the unique index wins.
  if (error && (error as { code?: string }).code === "23505") return { ok: false, reason: "duplicate" };
  throwIfSupabaseError(error, "Could not add the lead");
  const lead = toLead(data!);
  if (extra.actorUserId) {
    await logAudit({ actorUserId: extra.actorUserId, action: "lead.created", targetTable: "leads", targetId: lead.id, after: { business: lead.businessName, source: lead.source } });
  }
  return { ok: true, lead };
}

export type LeadPatch = Partial<{
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

const PATCH_COLUMN: Record<keyof LeadPatch, string> = {
  section: "section", subsection: "subsection", island: "island", area: "area", whatTheyDo: "what_they_do", bookingMethod: "booking_method",
  onlinePayment: "online_payment", pricesText: "prices_text", instagramHandle: "instagram_handle", phone: "phone", whatsappE164: "whatsapp_e164",
  email: "email", websiteUrl: "website_url", whyFit: "why_fit", warmConnection: "warm_connection", status: "status", owner: "owner", nextStep: "next_step",
  lastContactOn: "last_contact_on", notes: "notes", draftMessage: "draft_message",
};

export async function updateLead(id: number, patch: LeadPatch, actorUserId: string): Promise<Lead> {
  const current = await getLead(id);
  if (!current) throw new Error("NOT_FOUND");
  // Permanent means permanent: a "do not contact" lead can't be reopened
  // or edited from the app.
  if (current.status === "do_not_contact") throw new Error("DO_NOT_CONTACT");

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of Object.keys(patch) as (keyof LeadPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === "instagramHandle") row.instagram_handle = normalizeInstagramHandle(value as string | null);
    else if (key === "whatsappE164") row.whatsapp_e164 = value ? normalizePhoneE164(value as string) : null;
    else if (key === "websiteUrl") row.website_url = cleanUrl(value as string | null);
    else if (key === "status" || key === "bookingMethod" || key === "lastContactOn") row[PATCH_COLUMN[key]] = value;
    else if (key === "warmConnection") row.warm_connection = Boolean(value);
    else row[PATCH_COLUMN[key]] = clip(value as string | null, key === "notes" || key === "draftMessage" ? 2000 : 600);
  }
  // The Handbook score follows the two facts a founder can change by hand:
  // a warm connection, and the section (is it one we're filling?). Only
  // for a lead whose score has its reasons, never for a tracker number.
  const warmChanged = patch.warmConnection !== undefined && patch.warmConnection !== current.warmConnection;
  const sectionChanged = patch.section !== undefined && patch.section !== current.section;
  const bookingChanged = patch.bookingMethod !== undefined && patch.bookingMethod !== current.bookingMethod && patch.bookingMethod !== "unknown";
  if ((warmChanged || sectionChanged || bookingChanged) && current.score !== null && current.scoreReasons.length > 0) {
    const signals: ScoreSignals = {};
    const why: Partial<Record<ScoreSignalKey, string>> = {};
    for (const reason of current.scoreReasons) {
      signals[reason.key] = true;
      if (reason.why) why[reason.key] = reason.why;
    }
    if (warmChanged) signals.warm_connection = Boolean(patch.warmConnection);
    if (sectionChanged) signals.section_we_fill = patch.section ? (await sectionsWeAreFilling([patch.section])).has(patch.section) : false;
    if (bookingChanged) {
      // "Books online already" takes 30 off and can't also be "DM or phone
      // only"; any other method is the +25.
      signals.online_booking = patch.bookingMethod === "website_booking";
      signals.books_by_dm = patch.bookingMethod !== "website_booking";
    }
    const rescored = scoreLead(signals, why);
    row.score = rescored.score;
    row.score_reasons = rescored.reasons;
  }
  // The matching keys follow the phone and website, and are (re)written
  // when the lead becomes a tombstone so they outlive the wipe below.
  if (patch.status === "do_not_contact" || patch.phone !== undefined || patch.whatsappE164 !== undefined || patch.websiteUrl !== undefined) {
    row.match_keys = matchKeys({
      phones: [patch.whatsappE164 !== undefined ? patch.whatsappE164 : current.whatsappE164, patch.phone !== undefined ? patch.phone : current.phone],
      websiteUrl: patch.websiteUrl !== undefined ? patch.websiteUrl : current.websiteUrl,
    });
  }
  if (patch.status === "do_not_contact") Object.assign(row, DO_NOT_CONTACT_WIPE);
  // Moving a lead forward is a contact: stamp today unless a date was given.
  if ((patch.status === "contacted" || patch.status === "replied") && patch.lastContactOn === undefined) row.last_contact_on = nassauToday();

  // The status condition is in the write itself: if another founder marked
  // the lead "do not contact" a moment ago, this changes nothing.
  const { data, error } = await getSupabaseAdmin().from("leads").update(row).eq("id", id).neq("status", "do_not_contact").select(LEAD_COLUMNS).maybeSingle();
  if (error && (error as { code?: string }).code === "23505") throw new Error("DUPLICATE");
  throwIfSupabaseError(error, "Could not save the lead");
  if (!data) throw new Error("DO_NOT_CONTACT");
  if (patch.status === "do_not_contact") await clearDraftPageContacts(current, actorUserId);
  if (patch.status && patch.status !== current.status) {
    await logAudit({ actorUserId, action: patch.status === "do_not_contact" ? "lead.do_not_contact" : "lead.status_changed", targetTable: "leads", targetId: id, before: { status: current.status }, after: { status: patch.status } });
  }
  return toLead(data);
}

// What the AI step and the lookups write back: facts, score and the draft
// message, with when and from what. Never changes status.
export async function saveLeadEnrichment(
  id: number,
  input: { section?: string | null; subsection?: string | null; island?: string | null; area?: string | null; bookingMethod?: BookingMethod; pricesText?: string | null; score: number; scoreReasons: ScoreReason[]; draftMessage: string | null; enrichment: unknown; model: string; sourceUrls: string[] },
): Promise<Lead> {
  const current = await getLead(id);
  if (!current) throw new Error("NOT_FOUND");
  if (current.status === "do_not_contact") throw new Error("DO_NOT_CONTACT");
  const row: Record<string, unknown> = {
    score: input.score,
    score_reasons: input.scoreReasons,
    enrichment: input.enrichment,
    enriched_at: new Date().toISOString(),
    enrichment_model: input.model,
    source_urls: Array.from(new Set([...current.sourceUrls, ...input.sourceUrls.map((u) => cleanUrl(u)).filter((u): u is string => Boolean(u))])).slice(0, 12),
    updated_at: new Date().toISOString(),
  };
  // Facts a founder already typed win over what the AI inferred.
  if (!current.section && input.section) row.section = clip(input.section, 60);
  const sectionKept = current.section ?? input.section ?? null;
  if (!current.subsection && input.subsection && sectionKept !== null && sectionKept === input.section) row.subsection = clip(input.subsection, 80);
  if (!current.island && input.island) row.island = clip(input.island, 80);
  if (!current.area && input.area) row.area = clip(input.area, 80);
  if (current.bookingMethod === "unknown" && input.bookingMethod) row.booking_method = input.bookingMethod;
  if (!current.pricesText && input.pricesText) row.prices_text = clip(input.pricesText, 600);
  // A new draft replaces the old one; no draft (it broke a rule and was
  // thrown away) leaves the message a founder may have written alone.
  if (input.draftMessage) row.draft_message = clip(input.draftMessage, 2000);
  const { data, error } = await getSupabaseAdmin().from("leads").update(row).eq("id", id).neq("status", "do_not_contact").select(LEAD_COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not save the enrichment");
  if (!data) throw new Error("DO_NOT_CONTACT");
  return toLead(data);
}

// The get listed form, sent by a business that is already a lead: the lead
// moves to "Replied" and points at the request. Its contact details are
// left as they are (what an anonymous form says never overwrites what a
// founder or Google recorded).
export async function noteInboundRequest(id: number, input: { applicationId: number; referralCode: string | null }): Promise<void> {
  const current = await getLead(id);
  if (!current || current.status === "do_not_contact") return;
  const row: Record<string, unknown> = { application_id: input.applicationId, next_step: "They asked to be listed: see Applications, then message them.", updated_at: new Date().toISOString() };
  if (input.referralCode && !current.referralCode) row.referral_code = clip(input.referralCode, 40);
  if (current.status === "new" || current.status === "contacted" || current.status === "not_now") {
    row.status = "replied";
    row.last_contact_on = nassauToday();
  }
  const { error } = await getSupabaseAdmin().from("leads").update(row).eq("id", id).neq("status", "do_not_contact");
  throwIfSupabaseError(error, "Could not note the request on the lead");
  // The funnel reads these lines: a reply through the form is a reply.
  if (row.status === "replied") await logAudit({ actorUserId: null, action: "lead.status_changed", targetTable: "leads", targetId: id, before: { status: current.status }, after: { status: "replied" } });
}

// Removes a lead that only ever came from the public get listed form and
// that no founder has worked on: a junk or mistaken request. It is deleted
// outright, without the "do not contact" tombstone, so a real business of
// the same name can still be added later. Anything a founder added, kept,
// imported or drafted a page for can't be removed this way.
export async function removeInboundLead(id: number, actorUserId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("leads").select("id,business_name,source,status,created_by,organization_id").eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the lead");
  if (!data) throw new Error("NOT_FOUND");
  const removable = (data.source === "inbound_form" || data.source === "referral") && data.created_by === null && data.organization_id === null && data.status !== "do_not_contact";
  if (!removable) throw new Error("NOT_REMOVABLE");
  const removed = await db.from("leads").delete().eq("id", id).is("created_by", null).is("organization_id", null).in("source", ["inbound_form", "referral"]);
  throwIfSupabaseError(removed.error, "Could not remove the lead");
  await logAudit({ actorUserId, action: "lead.removed", targetTable: "leads", targetId: id, before: { business: data.business_name, source: data.source } });
}

// ---- Import ----------------------------------------------------------------

export type ImportOutcome = { added: number; duplicates: string[]; doNotContact: string[]; failed: string[] };

export async function importLeads(drafts: LeadDraft[], actorUserId: string): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { added: 0, duplicates: [], doNotContact: [], failed: [] };
  for (const draft of drafts) {
    try {
      const result = await createLead(draft, { actorUserId: null });
      if (result.ok) outcome.added += 1;
      else if (result.reason === "duplicate" && draft.status === "do_not_contact" && result.existingId) {
        // The file says this business asked not to be contacted, and it is
        // already here as an open lead: the request wins.
        await updateLead(result.existingId, { status: "do_not_contact" }, actorUserId);
        outcome.doNotContact.push(draft.businessName);
      } else if (result.reason === "do_not_contact") outcome.doNotContact.push(draft.businessName);
      else if (result.reason === "duplicate") outcome.duplicates.push(draft.businessName);
      else outcome.failed.push(draft.businessName);
    } catch {
      outcome.failed.push(draft.businessName);
    }
  }
  await logAudit({ actorUserId, action: "lead.imported", targetTable: "leads", after: { added: outcome.added, duplicates: outcome.duplicates.length, do_not_contact: outcome.doNotContact.length, failed: outcome.failed.length } });
  return outcome;
}

// ---- Weekly digest -----------------------------------------------------------

export type LeadsDigest = { newBySection: Array<{ section: string | null; count: number }>; newThisWeek: number; topUncontacted: Lead[]; repliesWaiting: Lead[]; total: number };

export async function leadsDigest(now: Date = new Date(), all?: Lead[]): Promise<LeadsDigest> {
  const leads = all ?? (await listLeads());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fresh = leads.filter((l) => l.createdAt >= weekAgo);
  const counts = new Map<string | null, number>();
  for (const lead of fresh) counts.set(lead.section, (counts.get(lead.section) ?? 0) + 1);
  return {
    newBySection: Array.from(counts.entries()).map(([section, count]) => ({ section, count })).sort((a, b) => b.count - a.count),
    newThisWeek: fresh.length,
    topUncontacted: leads.filter((l) => l.status === "new" && l.score !== null).slice(0, 10),
    repliesWaiting: leads.filter((l) => l.status === "replied"),
    total: leads.length,
  };
}

// The funnel on the leads screen: this week and all time, from where each
// lead stands and the "status changed" lines in the audit log.
// Pass the leads when the caller already has the whole list, to read it once.
export async function getLeadsFunnel(now: Date = new Date(), all?: Lead[]): Promise<LeadsFunnel> {
  const leads = all ?? (await listLeads());
  const changes: LeadStatusChange[] = [];
  // Newest first, so if the history ever outgrows the cap it is the oldest
  // lines that are left out, not this week's.
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await getSupabaseAdmin().from("audit_log").select("target_id,before,after,created_at").eq("action", "lead.status_changed").eq("target_table", "leads").order("id", { ascending: false }).range(from, from + 999);
    throwIfSupabaseError(error, "Could not load lead history");
    for (const row of data ?? []) {
      const status = (row.after as { status?: unknown } | null)?.status;
      const before = (row.before as { status?: unknown } | null)?.status;
      if (typeof status === "string" && row.target_id) changes.push({ leadId: Number(row.target_id), status, from: typeof before === "string" ? before : null, at: String(row.created_at) });
    }
    if ((data ?? []).length < 1000) break;
  }
  return leadsFunnel(leads.map((lead) => ({ id: lead.id, status: lead.status, lastContactOn: lead.lastContactOn, createdAt: lead.createdAt })), changes, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
}

// ---- "Draft their page" -------------------------------------------------------

// When a lead becomes "do not contact" after its page was drafted: the
// draft keeps its name, but the contact details copied from the lead are
// removed. A page that was already submitted or is live belongs to its
// owner by then and is left alone.
async function clearDraftPageContacts(lead: { organizationId: number | null }, actorUserId: string): Promise<void> {
  if (!lead.organizationId) return;
  const business = await getBusiness(lead.organizationId);
  if (!business || business.status !== "draft") return;
  await updateBusinessDetails(lead.organizationId, { whatsappE164: null, publicEmail: null, websiteUrl: null, instagramHandle: null }, actorUserId);
}

// Creates an UNPUBLISHED draft business from what the lead publishes about
// itself. It goes live only after the owner agrees (Handbook §7) and the
// usual review; nothing here publishes anything.
export async function draftPageFromLead(id: number, actorUserId: string): Promise<{ lead: Lead; organizationId: number; slug: string | null }> {
  const lead = await getLead(id);
  if (!lead) throw new Error("NOT_FOUND");
  if (lead.status === "do_not_contact") throw new Error("DO_NOT_CONTACT");
  if (lead.organizationId) throw new Error("ALREADY_DRAFTED");
  if (!lead.section) throw new Error("SECTION_REQUIRED");

  const business = await createDraftBusiness({ name: lead.businessName, section: lead.section, subcategory: lead.subsection && /^[a-z0-9-]+$/.test(lead.subsection) ? lead.subsection : null, ownerUserId: null, createdByAdmin: true, actorUserId });
  // Link the lead to the draft first, and only then copy the details in.
  // If the lead was marked "do not contact", or drafted by someone else, in
  // the moment since the check above, the link fails and the new draft is
  // left as a bare name: nothing about the business was copied onto it.
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .update({ organization_id: business.id, status: lead.status === "live" ? "live" : "page_drafted", updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "do_not_contact")
    .is("organization_id", null)
    .select(LEAD_COLUMNS)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not link the draft to the lead");
  if (!data) throw new Error("ALREADY_DRAFTED");
  // A hiccup while copying the details must not undo the link (a retry
  // would make a second draft): the page exists, and the details can be
  // typed in on the business's own settings.
  try {
    await updateBusinessDetails(
      business.id,
      {
        island: lead.island,
        area: lead.area,
        oneLiner: lead.whatTheyDo ? lead.whatTheyDo.slice(0, 120) : null,
        whatsappE164: lead.whatsappE164,
        publicEmail: lead.email,
        websiteUrl: lead.websiteUrl,
        instagramHandle: lead.instagramHandle,
      },
      actorUserId,
    );
  } catch (fillError) {
    console.error("lead draft page: details not copied", fillError instanceof Error ? fillError.message : "");
  }
  await logAudit({ actorUserId, organizationId: business.id, action: "lead.page_drafted", targetTable: "leads", targetId: id, after: { organization_id: business.id, slug: business.slug } });
  // The funnel reads these lines: where the lead stood before its page was drafted.
  if (lead.status !== "live" && lead.status !== "page_drafted") await logAudit({ actorUserId, organizationId: business.id, action: "lead.status_changed", targetTable: "leads", targetId: id, before: { status: lead.status }, after: { status: "page_drafted" } });
  return { lead: toLead(data), organizationId: business.id, slug: business.slug };
}

// ---- Lookups: the daily cap and the spend shown in admin ---------------------

export type LookupProvider = "google_places" | "instagram" | "claude";

export const PLACES_DAILY_CAP = 200;

export async function recordLookup(input: { provider: LookupProvider; query: string; resultCount: number; costMillicents: number; ok: boolean; actorUserId: string | null }): Promise<void> {
  const { error } = await getSupabaseAdmin().from("scout_lookups").insert({
    provider: input.provider,
    query: input.query.slice(0, 200),
    result_count: input.resultCount,
    cost_millicents: Math.max(0, Math.round(input.costMillicents)),
    ok: input.ok,
    created_by: input.actorUserId,
  });
  throwIfSupabaseError(error, "Could not record the lookup");
}

export type LookupUsage = { placesToday: number; placesLeftToday: number; monthCostCents: Record<LookupProvider, number>; monthCount: Record<LookupProvider, number> };

// Midnight in Nassau, as a UTC instant: "a day" for the cap is a Bahamian
// day, not a UTC one.
export function nassauDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Nassau", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const sinceMidnight = ((part("hour") * 60 + part("minute")) * 60 + part("second")) * 1000 + now.getUTCMilliseconds();
  return new Date(now.getTime() - sinceMidnight);
}

// Counted in the database (a count is never cut short the way a list of
// rows is), so the cap holds however many lookups the month has had.
export async function lookupUsage(now: Date = new Date()): Promise<LookupUsage> {
  const db = getSupabaseAdmin();
  const dayStart = nassauDayStart(now).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const providers: LookupProvider[] = ["google_places", "instagram", "claude"];
  const countSince = (provider: LookupProvider, since: string) => db.from("scout_lookups").select("id", { count: "exact", head: true }).eq("provider", provider).gte("created_at", since);
  const [today, ...months] = await Promise.all([countSince("google_places", dayStart), ...providers.map((provider) => countSince(provider, monthStart))]);
  throwIfSupabaseError(today.error, "Could not load lookup usage");
  const usage: LookupUsage = { placesToday: today.count ?? 0, placesLeftToday: PLACES_DAILY_CAP, monthCostCents: { google_places: 0, instagram: 0, claude: 0 }, monthCount: { google_places: 0, instagram: 0, claude: 0 } };
  providers.forEach((provider, i) => {
    throwIfSupabaseError(months[i].error, "Could not load lookup usage");
    usage.monthCount[provider] = months[i].count ?? 0;
  });
  // Spend: every Places search costs the same published price. The other
  // two record no cost here: Instagram's API is free, and the AI step's
  // spend is on the Anthropic bill.
  usage.monthCostCents.google_places = Math.round((usage.monthCount.google_places * PLACES_SEARCH_COST_MILLICENTS) / 1000);
  usage.placesLeftToday = Math.max(0, PLACES_DAILY_CAP - usage.placesToday);
  return usage;
}

// "A section we're filling" (+10 on the Handbook score): a section with
// fewer than five live businesses. Density beats coverage, so the sections
// that are still thin are where a new business helps most.
export const SECTION_FILL_TARGET = 5;

export async function sectionsWeAreFilling(sectionSlugs: string[]): Promise<Set<string>> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("primary_category").eq("status", "live").eq("is_published", true);
  throwIfSupabaseError(error, "Could not count live businesses");
  const live = new Map<string, number>();
  for (const row of data ?? []) {
    const slug = row.primary_category as string | null;
    if (slug) live.set(slug, (live.get(slug) ?? 0) + 1);
  }
  return new Set(sectionSlugs.filter((slug) => (live.get(slug) ?? 0) < SECTION_FILL_TARGET));
}

// Which of these Google places are already in the catalogue (so the search
// screen can say "already a lead" or "do not contact" instead of offering
// them again).
export type PlaceToCheck = { placeId: string; name: string; phone: string | null; internationalPhone: string | null; websiteUrl: string | null };

export async function existingForPlaces(places: PlaceToCheck[]): Promise<Map<string, { id: number; status: LeadStatus }>> {
  const found = new Map<string, { id: number; status: LeadStatus }>();
  if (places.length === 0) return found;
  const db = getSupabaseAdmin();
  const placeIds = places.map((p) => p.placeId);
  const names = Array.from(new Set(places.map((p) => dedupeKey(p.name)).filter(Boolean)));
  const keysFor = new Map<string, string[]>(places.map((p): [string, string[]] => [p.placeId, matchKeys({ phones: [p.internationalPhone, p.phone], websiteUrl: p.websiteUrl })]));
  const allKeys = Array.from(new Set(Array.from(keysFor.values()).flat()));
  const none = Promise.resolve({ data: [] as unknown[], error: null });
  const [byPlace, byName, byKey] = await Promise.all([
    db.from("leads").select("id,status,google_place_id").in("google_place_id", placeIds),
    names.length ? db.from("leads").select("id,status,dedupe_key").in("dedupe_key", names) : none,
    allKeys.length ? db.from("leads").select("id,status,match_keys").eq("status", "do_not_contact").overlaps("match_keys", allKeys) : none,
  ]);
  throwIfSupabaseError(byPlace.error, "Could not check existing leads");
  throwIfSupabaseError(byName.error, "Could not check existing leads");
  throwIfSupabaseError(byKey.error, "Could not check existing leads");
  const answer = (row: { id: number; status: string }) => ({ id: Number(row.id), status: isLeadStatus(row.status) ? row.status : ("new" as LeadStatus) });
  const placeRows = (byPlace.data ?? []) as Array<{ id: number; status: string; google_place_id: string }>;
  const nameRows = (byName.data ?? []) as Array<{ id: number; status: string; dedupe_key: string }>;
  const keyRows = (byKey.data ?? []) as Array<{ id: number; status: string; match_keys: string[] | null }>;
  for (const place of places) {
    const keys = keysFor.get(place.placeId) ?? [];
    const match =
      placeRows.find((row) => row.google_place_id === place.placeId) ??
      nameRows.find((row) => row.dedupe_key === dedupeKey(place.name)) ??
      keyRows.find((row) => (row.match_keys ?? []).some((key) => keys.includes(key)));
    if (match) found.set(place.placeId, answer(match));
  }
  return found;
}
