import { ensureFutprepPilotData } from "./registrations";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type OrganizationRecord = {
  id: number;
  // Nullable since the WhatsApp-first /apply and the owner setup wizard
  // (27 Sept): a business no longer has to arrive through an application
  // with every questionnaire answer filled in.
  application_id: number | null;
  name: string;
  primary_contact: string | null;
  email: string | null;
  phone: string | null;
  activity_type: string | null;
  main_location: string | null;
  created_at: string;
  slug: string | null;
  theme: Record<string, string>;
  registration_url: string | null;
  status: "draft" | "submitted" | "approved" | "live" | "suspended";
};

export type OrganizationStats = {
  totalPlayers: number;
  activePrograms: number;
  upcomingSessions: number;
  pendingPayments: number;
  newRegistrations: number;
};

export type ProgramSummary = {
  id: number;
  slug: string;
  name: string;
  age_min: number;
  age_max: number;
  location: string;
  day_of_week: string;
  start_time: string;
  capacity: number;
  term_name: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_fee_cents: number | null;
  term_fee_cents: number | null;
  registrations: number;
};

export type StaffSummary = {
  id: number;
  name: string;
  role: string;
  email: string | null;
  responsibilities: string;
};

export type LocationSummary = {
  id: number;
  name: string;
  address: string;
  map_label: string | null;
};

export type SessionSummary = {
  id: number;
  program_name: string;
  session_date: string;
  start_time: string;
  location: string;
  status: string;
};

export type RegistrationCounts = {
  program_name: string;
  capacity: number;
  registrations: number;
  pending_payments: number;
  paid: number;
};

export async function getOrganization(id: number) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load organization");
  return data as OrganizationRecord | null;
}

export async function getOrganizationBySlug(slug: string) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load organization");
  return data as OrganizationRecord | null;
}

export async function getOrganizationStats(
  id: number,
): Promise<OrganizationStats> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: programs, error: programError } = await db
    .from("programs")
    .select("id")
    .eq("organization_id", id)
    .eq("active", true);
  throwIfSupabaseError(programError, "Could not load organization programs");
  const programIds = (programs ?? []).map((row: { id: number }) => row.id);

  const totalPlayersQuery = db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", id)
    .neq("registration_status", "cancelled");

  const pendingPaymentsQuery = db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", id)
    .in("payment_status", ["pending", "partial", "overdue"])
    .neq("registration_status", "cancelled");

  const newRegistrationsQuery = db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", id)
    .gte("submitted_at", weekAgo);

  const upcomingSessionsQuery = programIds.length
    ? db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .in("program_id", programIds)
        .gte("session_date", today)
        .eq("status", "scheduled")
    : Promise.resolve({ count: 0, error: null } as {
        count: number | null;
        error: null;
      });

  const [playersResult, paymentsResult, registrationsResult, sessionsResult] =
    await Promise.all([
      totalPlayersQuery,
      pendingPaymentsQuery,
      newRegistrationsQuery,
      upcomingSessionsQuery,
    ]);

  throwIfSupabaseError(playersResult.error, "Could not count players");
  throwIfSupabaseError(paymentsResult.error, "Could not count payments");
  throwIfSupabaseError(
    registrationsResult.error,
    "Could not count new registrations",
  );
  throwIfSupabaseError(
    sessionsResult.error,
    "Could not count upcoming sessions",
  );

  return {
    totalPlayers: Number(playersResult.count ?? 0),
    activePrograms: programIds.length,
    upcomingSessions: Number(sessionsResult.count ?? 0),
    pendingPayments: Number(paymentsResult.count ?? 0),
    newRegistrations: Number(registrationsResult.count ?? 0),
  };
}

export async function listOrganizationPrograms(
  id: number,
): Promise<ProgramSummary[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: programs, error } = await db
    .from("programs")
    .select(
      "id,slug,name,age_min,age_max,location,day_of_week,start_time,capacity",
    )
    .eq("organization_id", id)
    .eq("active", true)
    .order("start_time", { ascending: true });
  throwIfSupabaseError(error, "Could not load programs");

  const rows = (programs ?? []) as Array<{
    id: number;
    slug: string;
    name: string;
    age_min: number;
    age_max: number;
    location: string;
    day_of_week: string;
    start_time: string;
    capacity: number;
  }>;
  if (!rows.length) return [];

  const programIds = rows.map((row) => row.id);

  const [{ data: terms, error: termError }, { data: registrations, error: registrationError }] =
    await Promise.all([
      db
        .from("program_terms")
        .select(
          "id,program_id,name,start_date,end_date,weekly_fee_cents,term_fee_cents",
        )
        .in("program_id", programIds)
        .eq("active", true),
      db
        .from("registrations")
        .select("id,program_id")
        .in("program_id", programIds)
        .neq("registration_status", "cancelled"),
    ]);
  throwIfSupabaseError(termError, "Could not load active terms");
  throwIfSupabaseError(registrationError, "Could not load program registrations");

  const termByProgram = new Map<number, {
    id: number;
    program_id: number;
    name: string;
    start_date: string;
    end_date: string;
    weekly_fee_cents: number;
    term_fee_cents: number;
  }>();
  for (const term of (terms ?? []) as Array<{
    id: number;
    program_id: number;
    name: string;
    start_date: string;
    end_date: string;
    weekly_fee_cents: number;
    term_fee_cents: number;
  }>) {
    if (!termByProgram.has(term.program_id)) termByProgram.set(term.program_id, term);
  }

  const countByProgram = new Map<number, number>();
  for (const registration of (registrations ?? []) as Array<{
    id: number;
    program_id: number;
  }>) {
    countByProgram.set(
      registration.program_id,
      (countByProgram.get(registration.program_id) ?? 0) + 1,
    );
  }

  return rows.map((program) => {
    const term = termByProgram.get(program.id);
    return {
      ...program,
      term_name: term?.name ?? null,
      start_date: term?.start_date ?? null,
      end_date: term?.end_date ?? null,
      weekly_fee_cents: term?.weekly_fee_cents ?? null,
      term_fee_cents: term?.term_fee_cents ?? null,
      registrations: countByProgram.get(program.id) ?? 0,
    };
  });
}

export async function listOrganizationStaff(
  id: number,
): Promise<StaffSummary[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("staff_members")
    .select("id,name,role,email,responsibilities")
    .eq("organization_id", id)
    .eq("active", true)
    .order("role", { ascending: true })
    .order("name", { ascending: true });
  throwIfSupabaseError(error, "Could not load organization staff");
  return (data ?? []) as StaffSummary[];
}

export async function listOrganizationLocations(
  id: number,
): Promise<LocationSummary[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("locations")
    .select("id,name,address,map_label")
    .eq("organization_id", id)
    .eq("active", true)
    .order("name", { ascending: true });
  throwIfSupabaseError(error, "Could not load organization locations");
  return (data ?? []) as LocationSummary[];
}

export async function listUpcomingSessions(
  id: number,
  limit = 12,
): Promise<SessionSummary[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: programs, error: programError } = await db
    .from("programs")
    .select("id,name")
    .eq("organization_id", id);
  throwIfSupabaseError(programError, "Could not load programs for schedule");

  const programRows = (programs ?? []) as Array<{ id: number; name: string }>;
  if (!programRows.length) return [];

  const nameByProgram = new Map(programRows.map((row) => [row.id, row.name]));
  const { data: sessions, error } = await db
    .from("sessions")
    .select("id,program_id,session_date,start_time,location,status")
    .in(
      "program_id",
      programRows.map((row) => row.id),
    )
    .gte("session_date", today)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(limit);
  throwIfSupabaseError(error, "Could not load upcoming sessions");

  return (sessions ?? []).map(
    (session: {
      id: number;
      program_id: number;
      session_date: string;
      start_time: string;
      location: string;
      status: string;
    }) => ({
      id: session.id,
      program_name: nameByProgram.get(session.program_id) ?? "Program",
      session_date: session.session_date,
      start_time: session.start_time,
      location: session.location,
      status: session.status,
    }),
  );
}

export async function getRegistrationCountsByProgram(
  id: number,
): Promise<RegistrationCounts[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: programs, error: programError } = await db
    .from("programs")
    .select("id,name,capacity,start_time")
    .eq("organization_id", id)
    .eq("active", true)
    .order("start_time", { ascending: true });
  throwIfSupabaseError(programError, "Could not load registration programs");

  const programRows = (programs ?? []) as Array<{
    id: number;
    name: string;
    capacity: number;
    start_time: string;
  }>;
  if (!programRows.length) return [];

  const { data: registrations, error } = await db
    .from("registrations")
    .select("id,program_id,payment_status")
    .in(
      "program_id",
      programRows.map((row) => row.id),
    )
    .neq("registration_status", "cancelled");
  throwIfSupabaseError(error, "Could not load registration totals");

  const byProgram = new Map<
    number,
    { registrations: number; pending: number; paid: number }
  >();
  for (const row of (registrations ?? []) as Array<{
    id: number;
    program_id: number;
    payment_status: string;
  }>) {
    const totals = byProgram.get(row.program_id) ?? {
      registrations: 0,
      pending: 0,
      paid: 0,
    };
    totals.registrations += 1;
    if (["pending", "partial", "overdue"].includes(row.payment_status)) {
      totals.pending += 1;
    }
    if (row.payment_status === "paid") totals.paid += 1;
    byProgram.set(row.program_id, totals);
  }

  return programRows.map((program) => {
    const totals = byProgram.get(program.id) ?? {
      registrations: 0,
      pending: 0,
      paid: 0,
    };
    return {
      program_name: program.name,
      capacity: program.capacity,
      registrations: totals.registrations,
      pending_payments: totals.pending,
      paid: totals.paid,
    };
  });
}

// ============================================================
// Shared template system: the Organization + Offering listing
// content every public template page (Organization, Program,
// Event, Venue, Service) reads from. Separate from everything
// above, which is the internal org-admin dashboard's own data
// access -- this is the public marketing/listing layer built on
// the SAME organizations table (extended with listing columns in
// migration 202609211001) plus the new offerings/organization_images/
// organization_faqs tables.
// ============================================================

export type OfferingType = "program" | "event" | "venue" | "service";

export type Offering = {
  id: number;
  organizationId: number;
  type: OfferingType;
  slug: string;
  name: string;
  summary: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  inclusions: string[];
  scheduleText: string | null;
  ageMin: number | null;
  ageMax: number | null;
  termStart: string | null;
  termEnd: string | null;
  eventDate: string | null;
  doorsTime: string | null;
  ticketUrl: string | null;
  capacity: number | null;
  hourlyRateCents: number | null;
  dayRateCents: number | null;
  amenities: string[];
  leadTimeText: string | null;
  imageUrl: string | null;
  actionUrl: string | null;
  isFeatured: boolean;
};

export type OrganizationImage = { id: number; url: string; alt: string | null; consentConfirmed: boolean };
export type OrganizationFaq = { id: number; question: string; answer: string; linkUrl: string | null; linkLabel: string | null };

export type Organization = {
  id: number;
  slug: string;
  name: string;
  primaryCategory: string | null;
  island: string | null;
  area: string | null;
  oneLiner: string | null;
  description: string | null;
  yearsInBusiness: number | null;
  rating: number | null;
  reviewCount: number | null;
  awards: string[];
  ownerName: string | null;
  ownerBio: string | null;
  ownerImageUrl: string | null;
  websiteUrl: string | null;
  heroImageUrl: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  customDomain: string | null;
  identityLayout: "overlay" | "split" | null;
  reviewsUrl: string | null;
  reviewsPlatform: string | null;
  whatsappE164: string | null;
  subcategory: string | null;
  status: string;
  // This business's photos may include children: only images with
  // confirmed consent render publicly (see withPhotoConsent).
  photoConsentRequired: boolean;
};

// A directory entry is deliberately smaller than Organization -- it's what
// cross-category surfaces (the homepage carousel, category chips, feature
// cards) need to link to a business generically, whether or not that
// business's own detail page is built on the offerings/template system.
export type OrganizationDirectoryEntry = {
  slug: string;
  name: string;
  primaryCategory: string | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  oneLiner: string | null;
};

export type OrganizationListing = {
  organization: Organization;
  offerings: Offering[];
  images: OrganizationImage[];
  faqs: OrganizationFaq[];
};

const LISTING_ORGANIZATION_COLUMNS = "id,slug,name,primary_category,island,area,one_liner,description,years_in_business,rating,review_count,awards,owner_name,owner_bio,owner_image_url,website_url,hero_image_url,brand_color,logo_url,custom_domain,identity_layout,reviews_url,reviews_platform,whatsapp_e164,subcategory,status,photo_consent_required";

const LISTING_OFFERING_COLUMNS = "id,organization_id,type,slug,name,summary,price_cents,price_unit,inclusions,schedule_text,age_min,age_max,term_start,term_end,event_date,doors_time,ticket_url,capacity,hourly_rate_cents,day_rate_cents,amenities,lead_time_text,image_url,action_url,is_featured";

function toListingOrganization(row: Record<string, unknown>): Organization {
  return {
    id: Number(row.id),
    slug: row.slug as string,
    name: row.name as string,
    primaryCategory: row.primary_category as string | null,
    island: row.island as string | null,
    area: row.area as string | null,
    oneLiner: row.one_liner as string | null,
    description: row.description as string | null,
    yearsInBusiness: row.years_in_business === null ? null : Number(row.years_in_business),
    rating: row.rating === null ? null : Number(row.rating),
    reviewCount: row.review_count === null ? null : Number(row.review_count),
    awards: Array.isArray(row.awards) ? row.awards.filter((v): v is string => typeof v === "string") : [],
    ownerName: row.owner_name as string | null,
    ownerBio: row.owner_bio as string | null,
    ownerImageUrl: row.owner_image_url as string | null,
    websiteUrl: row.website_url as string | null,
    heroImageUrl: row.hero_image_url as string | null,
    brandColor: row.brand_color as string | null,
    logoUrl: row.logo_url as string | null,
    customDomain: row.custom_domain as string | null,
    identityLayout: (row.identity_layout as "overlay" | "split" | null) ?? null,
    reviewsUrl: row.reviews_url as string | null,
    reviewsPlatform: row.reviews_platform as string | null,
    whatsappE164: (row.whatsapp_e164 as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    status: (row.status as string | null) ?? "draft",
    photoConsentRequired: Boolean(row.photo_consent_required),
  };
}

function toListingImage(row: Record<string, unknown>): OrganizationImage {
  return { id: Number(row.id), url: row.url as string, alt: (row.alt as string | null) ?? null, consentConfirmed: Boolean(row.consent_confirmed) };
}

// The children's-photo rule (no recognisable child's face until consent is
// confirmed, 16 Sept) applied at the data layer so every public surface --
// template, category cards, OG images, the owner's preview -- gets it for
// free. Where an organization's photos may include children, only images
// with confirmed consent survive, and the hero must be one of them or it
// goes; the template then falls back to the logo tile.
export function withPhotoConsent(listing: OrganizationListing): OrganizationListing {
  if (!listing.organization.photoConsentRequired) return listing;
  const images = listing.images.filter((image) => image.consentConfirmed);
  const hero = listing.organization.heroImageUrl;
  const heroAllowed = hero !== null && images.some((image) => image.url === hero);
  return {
    ...listing,
    organization: { ...listing.organization, heroImageUrl: heroAllowed ? hero : (images[0]?.url ?? null) },
    images,
  };
}

// Same rule for the light-weight list shapes (directory, section cards):
// one extra query for the organizations that need it, so a hero that
// hasn't been cleared never reaches a card.
async function gateHeroImages<T extends { id: number; heroImageUrl: string | null; photoConsentRequired: boolean }>(rows: T[]): Promise<T[]> {
  const gated = rows.filter((row) => row.photoConsentRequired);
  if (!gated.length) return rows;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organization_images")
    .select("organization_id,url,sort_order")
    .in("organization_id", gated.map((row) => row.id))
    .eq("consent_confirmed", true)
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load consented images");
  const allowed = new Map<number, string[]>();
  for (const row of data ?? []) {
    const list = allowed.get(Number(row.organization_id)) ?? [];
    list.push(row.url as string);
    allowed.set(Number(row.organization_id), list);
  }
  return rows.map((row) => {
    if (!row.photoConsentRequired) return row;
    const urls = allowed.get(row.id) ?? [];
    const hero = row.heroImageUrl && urls.includes(row.heroImageUrl) ? row.heroImageUrl : (urls[0] ?? null);
    return { ...row, heroImageUrl: hero };
  });
}

function toListingOffering(row: Record<string, unknown>): Offering {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    type: row.type as OfferingType,
    slug: row.slug as string,
    name: row.name as string,
    summary: row.summary as string | null,
    priceCents: row.price_cents === null || row.price_cents === undefined ? null : Number(row.price_cents),
    priceUnit: row.price_unit as string | null,
    inclusions: Array.isArray(row.inclusions) ? row.inclusions.filter((v): v is string => typeof v === "string") : [],
    scheduleText: row.schedule_text as string | null,
    ageMin: row.age_min === null || row.age_min === undefined ? null : Number(row.age_min),
    ageMax: row.age_max === null || row.age_max === undefined ? null : Number(row.age_max),
    termStart: row.term_start as string | null,
    termEnd: row.term_end as string | null,
    eventDate: row.event_date as string | null,
    doorsTime: row.doors_time as string | null,
    ticketUrl: row.ticket_url as string | null,
    capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
    hourlyRateCents: row.hourly_rate_cents === null || row.hourly_rate_cents === undefined ? null : Number(row.hourly_rate_cents),
    dayRateCents: row.day_rate_cents === null || row.day_rate_cents === undefined ? null : Number(row.day_rate_cents),
    amenities: Array.isArray(row.amenities) ? row.amenities.filter((v): v is string => typeof v === "string") : [],
    leadTimeText: row.lead_time_text as string | null,
    imageUrl: row.image_url as string | null,
    actionUrl: row.action_url as string | null,
    isFeatured: Boolean(row.is_featured),
  };
}

export async function getOrganizationListingBySlug(slug: string): Promise<OrganizationListing | null> {
  const supabase = getSupabaseAdmin();
  const { data: orgRow, error: orgError } = await supabase
    .from("organizations")
    .select(LISTING_ORGANIZATION_COLUMNS)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  throwIfSupabaseError(orgError, "Could not load organization");
  if (!orgRow) return null;

  const organization = toListingOrganization(orgRow);

  const [offeringsResult, imagesResult, faqsResult] = await Promise.all([
    supabase.from("offerings").select(LISTING_OFFERING_COLUMNS).eq("organization_id", organization.id).eq("is_published", true).order("sort_order", { ascending: true }),
    supabase.from("organization_images").select("id,url,alt,consent_confirmed").eq("organization_id", organization.id).order("sort_order", { ascending: true }),
    supabase.from("organization_faqs").select("id,question,answer,link_url,link_label").eq("organization_id", organization.id).order("sort_order", { ascending: true }),
  ]);
  throwIfSupabaseError(offeringsResult.error, "Could not load offerings");
  throwIfSupabaseError(imagesResult.error, "Could not load organization images");
  throwIfSupabaseError(faqsResult.error, "Could not load organization FAQs");

  return withPhotoConsent({
    organization,
    offerings: (offeringsResult.data ?? []).map(toListingOffering),
    images: (imagesResult.data ?? []).map(toListingImage),
    faqs: (faqsResult.data ?? []).map((row) => ({
      id: Number(row.id),
      question: row.question as string,
      answer: row.answer as string,
      linkUrl: row.link_url as string | null,
      linkLabel: row.link_label as string | null,
    })),
  });
}

export type OrganizationExtras = {
  ownerName: string | null;
  ownerBio: string | null;
  ownerImageUrl: string | null;
  faqs: { question: string; answer: string; linkUrl: string | null; linkLabel: string | null }[];
};

// A lighter-weight fetch than getOrganizationListingBySlug for pages that
// already have their own hero/offering/gallery data from elsewhere (e.g.
// the wedding_* tables) and just need this org's owner bio and FAQ content
// -- the bahamas-weddings-by-the-sea listing page, notably, which
// otherwise doesn't touch the organizations table at all.
export async function getOrganizationExtrasBySlug(slug: string): Promise<OrganizationExtras> {
  const empty: OrganizationExtras = { ownerName: null, ownerBio: null, ownerImageUrl: null, faqs: [] };
  const supabase = getSupabaseAdmin();
  const { data: orgRow, error: orgError } = await supabase
    .from("organizations")
    .select("id,owner_name,owner_bio,owner_image_url")
    .eq("slug", slug)
    .maybeSingle();
  throwIfSupabaseError(orgError, "Could not load organization");
  if (!orgRow) return empty;
  const { data, error } = await supabase
    .from("organization_faqs")
    .select("question,answer,link_url,link_label")
    .eq("organization_id", orgRow.id)
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load organization FAQs");
  return {
    ownerName: orgRow.owner_name as string | null,
    ownerBio: orgRow.owner_bio as string | null,
    ownerImageUrl: orgRow.owner_image_url as string | null,
    faqs: (data ?? []).map((row) => ({
      question: row.question as string,
      answer: row.answer as string,
      linkUrl: row.link_url as string | null,
      linkLabel: row.link_label as string | null,
    })),
  };
}

export type OfferingListing = OrganizationListing & { offering: Offering };

export async function getOfferingListingBySlug(organizationSlug: string, offeringSlug: string): Promise<OfferingListing | null> {
  const listing = await getOrganizationListingBySlug(organizationSlug);
  if (!listing) return null;
  const offering = listing.offerings.find((o) => o.slug === offeringSlug);
  if (!offering) return null;
  return { ...listing, offering };
}

// Every business the homepage carousel, category chips and feature cards
// can point at -- gated on is_directory_listed, not is_published, so a
// business like BWS (no offerings row, so it can never satisfy
// check_organization_publish_requires_priced_offering) can still appear
// here. Adding a row and setting this flag is the entire onboarding step;
// nothing else in this file needs to change for a new business to show up.
export async function listPublishedOrganizations(category?: string): Promise<OrganizationDirectoryEntry[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("organizations")
    .select("id,slug,name,primary_category,hero_image_url,logo_url,brand_color,one_liner,photo_consent_required")
    .eq("is_directory_listed", true);
  if (category) query = query.eq("primary_category", category);
  const { data, error } = await query.order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load organization directory");
  const gated = await gateHeroImages(
    (data ?? []).map((row) => ({
      id: Number(row.id),
      photoConsentRequired: Boolean(row.photo_consent_required),
      slug: row.slug as string,
      name: row.name as string,
      primaryCategory: row.primary_category as string | null,
      heroImageUrl: row.hero_image_url as string | null,
      logoUrl: row.logo_url as string | null,
      brandColor: row.brand_color as string | null,
      oneLiner: row.one_liner as string | null,
    })),
  );
  return gated.map((row) => ({
    slug: row.slug,
    name: row.name,
    primaryCategory: row.primaryCategory,
    heroImageUrl: row.heroImageUrl,
    logoUrl: row.logoUrl,
    brandColor: row.brandColor,
    oneLiner: row.oneLiner,
  }));
}

export type CategoryOrganizationEntry = {
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  isPublished: boolean;
};

// A category page shows every *approved* business in that category, live
// or not -- unlike listPublishedOrganizations (homepage carousel/chips),
// which only ever shows what's genuinely open. An approved row with
// is_published false renders as a Coming Soon card (see ComingSoonCard.tsx)
// rather than being invisible: a category with a business mid-onboarding
// should say so, not look empty. Drafts and submitted-but-unreviewed
// businesses (self-serve sign-ups) never appear here; a published row is
// always shown whatever its status says, so a status mix-up can't hide a
// live business. is_directory_listed plays no role in this query.
export async function listCategoryOrganizations(category: string): Promise<CategoryOrganizationEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organizations")
    .select("slug,name,logo_url,brand_color,is_published")
    .eq("primary_category", category)
    .or("status.in.(approved,live),is_published.eq.true")
    .order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load category organizations");
  return (data ?? []).map((row) => ({
    slug: row.slug as string,
    name: row.name as string,
    logoUrl: row.logo_url as string | null,
    brandColor: row.brand_color as string | null,
    isPublished: Boolean(row.is_published),
  }));
}

// The owner's own preview: the same shape the public page renders from,
// without the is_published gate, so a draft can be seen before it's live.
// Callers must have checked access (lib/auth/guards.ts) first.
export async function getOrganizationListingForPreview(organizationId: number): Promise<OrganizationListing | null> {
  const supabase = getSupabaseAdmin();
  const { data: orgRow, error: orgError } = await supabase.from("organizations").select(LISTING_ORGANIZATION_COLUMNS).eq("id", organizationId).maybeSingle();
  throwIfSupabaseError(orgError, "Could not load organization");
  if (!orgRow) return null;
  const organization = toListingOrganization(orgRow);
  const [offeringsResult, imagesResult, faqsResult] = await Promise.all([
    supabase.from("offerings").select(LISTING_OFFERING_COLUMNS).eq("organization_id", organization.id).order("sort_order", { ascending: true }),
    supabase.from("organization_images").select("id,url,alt,consent_confirmed").eq("organization_id", organization.id).order("sort_order", { ascending: true }),
    supabase.from("organization_faqs").select("id,question,answer,link_url,link_label").eq("organization_id", organization.id).order("sort_order", { ascending: true }),
  ]);
  throwIfSupabaseError(offeringsResult.error, "Could not load offerings");
  throwIfSupabaseError(imagesResult.error, "Could not load organization images");
  throwIfSupabaseError(faqsResult.error, "Could not load organization FAQs");
  return withPhotoConsent({
    organization,
    offerings: (offeringsResult.data ?? []).map(toListingOffering),
    images: (imagesResult.data ?? []).map(toListingImage),
    faqs: (faqsResult.data ?? []).map((row) => ({ id: Number(row.id), question: row.question as string, answer: row.answer as string, linkUrl: row.link_url as string | null, linkLabel: row.link_label as string | null })),
  });
}

export type SectionBusiness = {
  slug: string;
  name: string;
  primaryCategory: string | null;
  subcategory: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  heroImageUrl: string | null;
  oneLiner: string | null;
  isPublished: boolean;
};

// Businesses for a data-driven section or subcategory page: approved or
// live (or anything published, as a safety net), optionally narrowed to
// one subcategory. Same visibility rule as listCategoryOrganizations,
// with the fields the generic CategoryPage needs to render a card.
export async function listSectionBusinesses(section: string, subcategory?: string | null): Promise<SectionBusiness[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("organizations")
    .select("id,slug,name,primary_category,subcategory,logo_url,brand_color,hero_image_url,one_liner,is_published,photo_consent_required")
    .eq("primary_category", section)
    .or("status.in.(approved,live),is_published.eq.true");
  if (subcategory) query = query.eq("subcategory", subcategory);
  const { data, error } = await query.order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load section businesses");
  const gated = await gateHeroImages(
    (data ?? [])
      .filter((row) => typeof row.slug === "string" && row.slug)
      .map((row) => ({
        id: Number(row.id),
        photoConsentRequired: Boolean(row.photo_consent_required),
        slug: row.slug as string,
        name: row.name as string,
        primaryCategory: (row.primary_category as string | null) ?? null,
        subcategory: (row.subcategory as string | null) ?? null,
        logoUrl: (row.logo_url as string | null) ?? null,
        brandColor: (row.brand_color as string | null) ?? null,
        heroImageUrl: (row.hero_image_url as string | null) ?? null,
        oneLiner: (row.one_liner as string | null) ?? null,
        isPublished: Boolean(row.is_published),
      })),
  );
  return gated.map((row) => ({
    slug: row.slug,
    name: row.name,
    primaryCategory: row.primaryCategory,
    subcategory: row.subcategory,
    logoUrl: row.logoUrl,
    brandColor: row.brandColor,
    heroImageUrl: row.heroImageUrl,
    oneLiner: row.oneLiner,
    isPublished: row.isPublished,
  }));
}
