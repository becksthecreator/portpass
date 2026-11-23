import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type WeddingLeadInput = {
  idempotencyKey: string;
  names: string;
  email?: string;
  phone?: string;
  travelOrigin?: string;
  ceremonyType?: string;
  preferredWeddingDate?: string;
  arrivalDate?: string;
  guestCount?: number | null;
  locationIdea?: string;
  venueId?: number | null;
  venuePreference?: string;
  requestedServices?: string[];
  consultationMethod?: "phone" | "whatsapp_video" | "guided_text" | null;
  consultationPreferredDate?: string;
  consultationPreferredTime?: string;
  consultationTimeZone?: string;
  notes?: string;
  contactConsent: boolean;
  marketingConsent: boolean;
  utm?: Record<string, string>;
  packageId?: number | null;
};

export type WeddingLead = {
  id: number;
  publicToken: string;
  names: string;
  // True only when this call created the row or completed a started one;
  // false when an earlier call already had (a retry or a replay). Emails go
  // out only when it's true, so a double tap never sends them twice.
  changed: boolean;
};

const UNIQUE_VIOLATION = "23505";

function leadRow(input: WeddingLeadInput) {
  return {
    idempotency_key: input.idempotencyKey,
    names: input.names,
    email: input.email || null,
    phone: input.phone || null,
    travel_origin: input.travelOrigin || null,
    ceremony_type: input.ceremonyType || null,
    preferred_wedding_date: input.preferredWeddingDate || null,
    arrival_date: input.arrivalDate || null,
    guest_count: input.guestCount ?? null,
    location_idea: input.locationIdea || null,
    venue_id: input.venueId ?? null,
    venue_preference: input.venuePreference || null,
    package_id: input.packageId ?? null,
    requested_services: input.requestedServices ?? [],
    consultation_method: input.consultationMethod ?? null,
    consultation_preferred_date: input.consultationPreferredDate || null,
    consultation_preferred_time: input.consultationPreferredTime || null,
    consultation_time_zone: input.consultationTimeZone || null,
    notes: input.notes || null,
    contact_consent: input.contactConsent,
    marketing_consent: input.marketingConsent,
    utm: input.utm ?? {},
  };
}

// The planner saves a couple's names and email as soon as they give them
// (utm.planner_stage "started"), so an enquiry that stops partway still
// reaches the Wedding Desk. Sending the full plan later with the same
// idempotency key fills in that same row. Only a row still marked
// "started" is filled (a submitted one is never touched); otherwise this
// returns null and the caller inserts as usual. No age limit: the key is
// made fresh in the couple's browser on each page load and never leaves
// it, and an age cut-off would drop a late plan on the floor (the insert
// would hit the started row's key and return it unfilled).
export async function completeStartedWeddingLead(input: WeddingLeadInput): Promise<WeddingLead | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_leads")
    .update({ ...leadRow(input), updated_at: new Date().toISOString() })
    .eq("idempotency_key", input.idempotencyKey)
    .eq("utm->>planner_stage", "started")
    .select("id, public_token, names");
  throwIfSupabaseError(error, "Could not complete wedding lead");
  const row = data?.[0];
  return row ? { id: row.id, publicToken: row.public_token, names: row.names, changed: true } : null;
}

// Whether this address already had an enquiry sent in the last 24 hours,
// other than the one just saved: the couple's instant reply goes out at
// most once a day per address, so the form can't be used to mail a
// stranger over and over.
export async function hadRecentSubmittedWeddingLead(email: string, exceptId: number): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("wedding_leads")
    .select("id", { count: "exact", head: true })
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .eq("utm->>planner_stage", "submitted")
    .gte("updated_at", since)
    .neq("id", exceptId);
  throwIfSupabaseError(error, "Could not check recent wedding enquiries");
  return Number(count ?? 0) > 0;
}

// Idempotent by design: a retried/double submit with the same idempotencyKey
// returns the row already created instead of inserting a second one.
export async function createWeddingLead(input: WeddingLeadInput): Promise<WeddingLead> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("wedding_leads")
    .insert(leadRow(input))
    .select("id, public_token, names")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    const existing = await supabase
      .from("wedding_leads")
      .select("id, public_token, names")
      .eq("idempotency_key", input.idempotencyKey)
      .single();
    throwIfSupabaseError(existing.error, "Could not load existing wedding lead");
    if (!existing.data) throw new Error("Could not load existing wedding lead");
    return { id: existing.data.id, publicToken: existing.data.public_token, names: existing.data.names, changed: false };
  }

  throwIfSupabaseError(error, "Could not save wedding lead");
  if (!data) throw new Error("Could not save wedding lead");
  return { id: data.id, publicToken: data.public_token, names: data.names, changed: true };
}
