import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export const WEDDING_LEAD_STATUSES = [
  "new",
  "pre_consultation",
  "consultation_requested",
  "planning",
  "ready_for_antonio",
  "antonio_review",
  "quoted",
  "booked",
  "closed",
] as const;
export type WeddingLeadStatus = (typeof WEDDING_LEAD_STATUSES)[number];

const LEAD_LIST_COLUMNS =
  "id,names,email,phone,ceremony_type,package_id,preferred_wedding_date,guest_count,travel_origin,status,created_at,updated_at,wedding_packages(name)";

export type WeddingLeadListItem = {
  id: number;
  names: string;
  email: string | null;
  phone: string | null;
  ceremonyType: string | null;
  packageName: string | null;
  preferredWeddingDate: string | null;
  guestCount: number | null;
  travelOrigin: string | null;
  status: WeddingLeadStatus;
  createdAt: string;
  updatedAt: string;
  unanswered: boolean;
};

function isStale(status: string, updatedAt: string) {
  if (status !== "new") return false;
  return Date.now() - new Date(updatedAt).getTime() > 24 * 60 * 60 * 1000;
}

export async function listWeddingLeads(): Promise<WeddingLeadListItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_leads")
    .select(LEAD_LIST_COLUMNS)
    .order("created_at", { ascending: false });
  throwIfSupabaseError(error, "Could not load wedding enquiries");
  return (data ?? []).map((row) => {
    const updatedAt = row.updated_at as string;
    const status = row.status as WeddingLeadStatus;
    const pkg = row.wedding_packages as { name: string } | { name: string }[] | null;
    return {
      id: Number(row.id),
      names: row.names as string,
      email: row.email as string | null,
      phone: row.phone as string | null,
      ceremonyType: row.ceremony_type as string | null,
      packageName: Array.isArray(pkg) ? pkg[0]?.name ?? null : pkg?.name ?? null,
      preferredWeddingDate: row.preferred_wedding_date as string | null,
      guestCount: row.guest_count as number | null,
      travelOrigin: row.travel_origin as string | null,
      status,
      createdAt: row.created_at as string,
      updatedAt,
      unanswered: isStale(status, updatedAt),
    };
  });
}

const LEAD_DETAIL_COLUMNS =
  "id,public_token,names,email,phone,travel_origin,ceremony_type,package_id,preferred_wedding_date,arrival_date,guest_count,location_idea,venue_id,venue_preference,requested_services,consultation_method,consultation_preferred_date,consultation_preferred_time,consultation_time_zone,notes,contact_consent,marketing_consent,status,created_at,updated_at,wedding_packages(name)";

export type WeddingLeadNote = {
  id: number;
  author: string;
  note: string;
  createdAt: string;
};

export type WeddingLeadDetail = Omit<WeddingLeadListItem, "packageName"> & {
  publicToken: string;
  arrivalDate: string | null;
  locationIdea: string | null;
  venuePreference: string | null;
  requestedServices: string[];
  consultationMethod: string | null;
  consultationPreferredDate: string | null;
  consultationPreferredTime: string | null;
  consultationTimeZone: string | null;
  notes: string | null;
  contactConsent: boolean;
  marketingConsent: boolean;
  packageName: string | null;
  internalNotes: WeddingLeadNote[];
};

export async function getWeddingLeadDetail(id: number): Promise<WeddingLeadDetail | null> {
  const supabase = getSupabaseAdmin();
  const [leadResult, notesResult] = await Promise.all([
    supabase.from("wedding_leads").select(LEAD_DETAIL_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("wedding_lead_notes").select("id,author,note,created_at").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);
  throwIfSupabaseError(leadResult.error, "Could not load the enquiry");
  throwIfSupabaseError(notesResult.error, "Could not load internal notes");
  const row = leadResult.data;
  if (!row) return null;

  const pkg = row.wedding_packages as { name: string } | { name: string }[] | null;
  const updatedAt = row.updated_at as string;
  const status = row.status as WeddingLeadStatus;

  return {
    id: Number(row.id),
    publicToken: row.public_token as string,
    names: row.names as string,
    email: row.email as string | null,
    phone: row.phone as string | null,
    ceremonyType: row.ceremony_type as string | null,
    packageName: Array.isArray(pkg) ? pkg[0]?.name ?? null : pkg?.name ?? null,
    preferredWeddingDate: row.preferred_wedding_date as string | null,
    arrivalDate: row.arrival_date as string | null,
    guestCount: row.guest_count as number | null,
    locationIdea: row.location_idea as string | null,
    venuePreference: row.venue_preference as string | null,
    requestedServices: Array.isArray(row.requested_services) ? row.requested_services.filter((v): v is string => typeof v === "string") : [],
    consultationMethod: row.consultation_method as string | null,
    consultationPreferredDate: row.consultation_preferred_date as string | null,
    consultationPreferredTime: row.consultation_preferred_time as string | null,
    consultationTimeZone: row.consultation_time_zone as string | null,
    notes: row.notes as string | null,
    contactConsent: Boolean(row.contact_consent),
    marketingConsent: Boolean(row.marketing_consent),
    travelOrigin: row.travel_origin as string | null,
    status,
    createdAt: row.created_at as string,
    updatedAt,
    unanswered: isStale(status, updatedAt),
    internalNotes: (notesResult.data ?? []).map((n) => ({ id: Number(n.id), author: n.author as string, note: n.note as string, createdAt: n.created_at as string })),
  };
}

export async function updateWeddingLeadStatus(id: number, status: WeddingLeadStatus) {
  if (!WEDDING_LEAD_STATUSES.includes(status)) throw new Error("INVALID_STATUS");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("wedding_leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  throwIfSupabaseError(error, "Could not update the enquiry status");
}

export async function addWeddingLeadNote(leadId: number, author: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("NOTE_REQUIRED");
  const supabase = getSupabaseAdmin();
  const { error: insertError } = await supabase.from("wedding_lead_notes").insert({ lead_id: leadId, author, note: trimmed });
  throwIfSupabaseError(insertError, "Could not save the note");
  const { error: touchError } = await supabase.from("wedding_leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
  throwIfSupabaseError(touchError, "Could not update the enquiry");
}
