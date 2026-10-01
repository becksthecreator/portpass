import { logAudit } from "./audit";
import { createDraftBusiness, updateBusinessDetails } from "./business";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import { normalizePhoneE164 } from "@/lib/phone";
import {
  cleanUrl,
  dedupeKey,
  isBookingMethod,
  isLeadStatus,
  normalizeInstagramHandle,
  type BookingMethod,
  type LeadDraft,
  type LeadSource,
  type LeadStatus,
  type ScoreReason,
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
// that stop it being added again, and nothing else.
const DO_NOT_CONTACT_WIPE = {
  status: "do_not_contact",
  phone: null,
  whatsapp_e164: null,
  email: null,
  address: null,
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

export type LeadFilters = { section?: string | null; area?: string | null; status?: LeadStatus | "all" | null; source?: LeadSource | null; minScore?: number | null; q?: string | null };

// "Do not contact" is hidden from every list; it can only be found by
// trying to add the same business again.
export async function listLeads(filters: LeadFilters = {}): Promise<Lead[]> {
  let query = getSupabaseAdmin().from("leads").select(LEAD_COLUMNS).neq("status", "do_not_contact");
  if (filters.section) query = query.eq("section", filters.section);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.source) query = query.eq("source", filters.source);
  if (typeof filters.minScore === "number") query = query.gte("score", filters.minScore);
  const { data, error } = await query.order("score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  throwIfSupabaseError(error, "Could not load leads");
  let leads = (data ?? []).map(toLead);
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
async function findExisting(draft: { businessName: string; instagramHandle?: string | null; googlePlaceId?: string | null }): Promise<{ id: number; status: LeadStatus } | null> {
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
  return null;
}

export type CreateLeadResult = { ok: true; lead: Lead } | { ok: false; reason: "duplicate" | "do_not_contact" | "no_name"; existingId?: number };

export async function createLead(
  draft: LeadDraft,
  extra: { actorUserId: string | null; googlePlaceId?: string | null; googleMapsUrl?: string | null; googleRating?: number | null; googleRatingCount?: number | null; applicationId?: number | null; warmConnection?: boolean },
): Promise<CreateLeadResult> {
  const key = dedupeKey(draft.businessName);
  if (!key) return { ok: false, reason: "no_name" };
  const existing = await findExisting({ businessName: draft.businessName, instagramHandle: draft.instagramHandle, googlePlaceId: extra.googlePlaceId });
  if (existing) return { ok: false, reason: existing.status === "do_not_contact" ? "do_not_contact" : "duplicate", existingId: existing.id };

  const row: Record<string, unknown> = {
    ...rowFromDraft(draft),
    dedupe_key: key,
    google_place_id: extra.googlePlaceId ?? null,
    google_maps_url: cleanUrl(extra.googleMapsUrl),
    google_rating: extra.googleRating ?? null,
    google_rating_count: extra.googleRatingCount ?? null,
    application_id: extra.applicationId ?? null,
    warm_connection: extra.warmConnection ?? false,
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
  if (patch.status === "do_not_contact") Object.assign(row, DO_NOT_CONTACT_WIPE);
  // Moving a lead forward is a contact: stamp today unless a date was given.
  if ((patch.status === "contacted" || patch.status === "replied") && patch.lastContactOn === undefined) row.last_contact_on = new Date().toISOString().slice(0, 10);

  const { data, error } = await getSupabaseAdmin().from("leads").update(row).eq("id", id).select(LEAD_COLUMNS).single();
  throwIfSupabaseError(error, "Could not save the lead");
  if (patch.status && patch.status !== current.status) {
    await logAudit({ actorUserId, action: patch.status === "do_not_contact" ? "lead.do_not_contact" : "lead.status_changed", targetTable: "leads", targetId: id, before: { status: current.status }, after: { status: patch.status } });
  }
  return toLead(data!);
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
    draft_message: clip(input.draftMessage, 2000),
    enrichment: input.enrichment,
    enriched_at: new Date().toISOString(),
    enrichment_model: input.model,
    source_urls: Array.from(new Set([...current.sourceUrls, ...input.sourceUrls.map((u) => cleanUrl(u)).filter((u): u is string => Boolean(u))])).slice(0, 12),
    updated_at: new Date().toISOString(),
  };
  // Facts a founder already typed win over what the AI inferred.
  if (!current.section && input.section) row.section = clip(input.section, 60);
  if (!current.subsection && input.subsection) row.subsection = clip(input.subsection, 80);
  if (!current.island && input.island) row.island = clip(input.island, 80);
  if (!current.area && input.area) row.area = clip(input.area, 80);
  if (current.bookingMethod === "unknown" && input.bookingMethod) row.booking_method = input.bookingMethod;
  if (!current.pricesText && input.pricesText) row.prices_text = clip(input.pricesText, 600);
  const { data, error } = await getSupabaseAdmin().from("leads").update(row).eq("id", id).select(LEAD_COLUMNS).single();
  throwIfSupabaseError(error, "Could not save the enrichment");
  return toLead(data!);
}

// ---- Import ----------------------------------------------------------------

export type ImportOutcome = { added: number; duplicates: string[]; doNotContact: string[]; failed: string[] };

export async function importLeads(drafts: LeadDraft[], actorUserId: string): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { added: 0, duplicates: [], doNotContact: [], failed: [] };
  for (const draft of drafts) {
    try {
      const result = await createLead(draft, { actorUserId: null });
      if (result.ok) outcome.added += 1;
      else if (result.reason === "do_not_contact") outcome.doNotContact.push(draft.businessName);
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

export async function leadsDigest(now: Date = new Date()): Promise<LeadsDigest> {
  const leads = await listLeads();
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

// ---- "Draft their page" -------------------------------------------------------

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
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .update({ organization_id: business.id, status: lead.status === "live" ? "live" : "page_drafted", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(LEAD_COLUMNS)
    .single();
  throwIfSupabaseError(error, "Could not link the draft to the lead");
  await logAudit({ actorUserId, organizationId: business.id, action: "lead.page_drafted", targetTable: "leads", targetId: id, after: { organization_id: business.id, slug: business.slug } });
  return { lead: toLead(data!), organizationId: business.id, slug: business.slug };
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

export async function lookupUsage(now: Date = new Date()): Promise<LookupUsage> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await getSupabaseAdmin().from("scout_lookups").select("provider,cost_millicents,created_at").gte("created_at", monthStart).limit(20000);
  throwIfSupabaseError(error, "Could not load lookup usage");
  const usage: LookupUsage = { placesToday: 0, placesLeftToday: PLACES_DAILY_CAP, monthCostCents: { google_places: 0, instagram: 0, claude: 0 }, monthCount: { google_places: 0, instagram: 0, claude: 0 } };
  const millicents: Record<LookupProvider, number> = { google_places: 0, instagram: 0, claude: 0 };
  for (const row of data ?? []) {
    const provider = row.provider as LookupProvider;
    if (!(provider in millicents)) continue;
    millicents[provider] += Number(row.cost_millicents) || 0;
    usage.monthCount[provider] += 1;
    if (provider === "google_places" && (row.created_at as string) >= dayStart) usage.placesToday += 1;
  }
  usage.placesLeftToday = Math.max(0, PLACES_DAILY_CAP - usage.placesToday);
  for (const provider of Object.keys(millicents) as LookupProvider[]) usage.monthCostCents[provider] = Math.round(millicents[provider] / 1000);
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
export async function existingForPlaces(placeIds: string[], names: string[]): Promise<Map<string, { id: number; status: LeadStatus }>> {
  const found = new Map<string, { id: number; status: LeadStatus }>();
  if (placeIds.length === 0 && names.length === 0) return found;
  const db = getSupabaseAdmin();
  const keys = names.map((n) => dedupeKey(n)).filter(Boolean);
  const [byPlace, byName] = await Promise.all([
    placeIds.length ? db.from("leads").select("id,status,google_place_id").in("google_place_id", placeIds) : Promise.resolve({ data: [], error: null }),
    keys.length ? db.from("leads").select("id,status,dedupe_key").in("dedupe_key", keys) : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfSupabaseError(byPlace.error, "Could not check existing leads");
  throwIfSupabaseError(byName.error, "Could not check existing leads");
  for (const row of (byPlace.data ?? []) as Array<{ id: number; status: string; google_place_id: string }>) {
    found.set(`place:${row.google_place_id}`, { id: Number(row.id), status: isLeadStatus(row.status) ? row.status : "new" });
  }
  for (const row of (byName.data ?? []) as Array<{ id: number; status: string; dedupe_key: string }>) {
    found.set(`name:${row.dedupe_key}`, { id: Number(row.id), status: isLeadStatus(row.status) ? row.status : "new" });
  }
  return found;
}
