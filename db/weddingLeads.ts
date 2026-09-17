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
};

export type WeddingLead = {
  id: number;
  publicToken: string;
  names: string;
};

const UNIQUE_VIOLATION = "23505";

// Idempotent by design: a retried/double submit with the same idempotencyKey
// returns the row already created instead of inserting a second one.
export async function createWeddingLead(input: WeddingLeadInput): Promise<WeddingLead> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("wedding_leads")
    .insert({
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
      requested_services: input.requestedServices ?? [],
      consultation_method: input.consultationMethod ?? null,
      consultation_preferred_date: input.consultationPreferredDate || null,
      consultation_preferred_time: input.consultationPreferredTime || null,
      consultation_time_zone: input.consultationTimeZone || null,
      notes: input.notes || null,
      contact_consent: input.contactConsent,
      marketing_consent: input.marketingConsent,
      utm: input.utm ?? {},
    })
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
    return { id: existing.data.id, publicToken: existing.data.public_token, names: existing.data.names };
  }

  throwIfSupabaseError(error, "Could not save wedding lead");
  if (!data) throw new Error("Could not save wedding lead");
  return { id: data.id, publicToken: data.public_token, names: data.names };
}
