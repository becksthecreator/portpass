import { logAudit } from "./audit";
import { createFutprepProgram, listFutprepPrograms, type FutprepProgramSummary } from "./programs";
import type { ProgramAudience } from "./registrations";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// A business's own Registrations screen (brief 18, D4): the same
// registrations table and the same programmes Futprep's staff desk reads,
// for any business, through the signed-in team's membership. Every
// function takes the business's id and reads or changes only its rows.
//
// Health, emergency and pickup details are never in the list. They are
// read for one registration only when the caller says the person may see
// them (the "can see medical details" permission on the team), and an
// adult's registration has none.

export type BusinessRegistration = {
  id: number;
  reference: string;
  participantName: string;
  participantIsAdult: boolean;
  programName: string;
  termName: string;
  status: string;
  paymentStatus: string;
  amountDueCents: number;
  paymentFrequency: string | null;
  submittedAt: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

export type BusinessRegistrationHealth = {
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  medications: string | null;
  specialNeeds: string | null;
  authorizedPickup: string | null;
};

export type BusinessRegistrationDetail = BusinessRegistration & {
  relationship: string | null;
  childDob: string | null;
  gender: string | null;
  paymentMethod: string | null;
  photoConsent: string | null;
  additionalNotes: string | null;
  heardAboutUs: string | null;
  // null: the person may not see them, or this is an adult's registration.
  health: BusinessRegistrationHealth | null;
};

type Row = Record<string, unknown>;
const LIST_COLUMNS = "id,reference_code,child_name,participant_is_adult,program_id,term_id,registration_status,payment_status,amount_due_cents,payment_frequency,submitted_at,parent_name,parent_email,parent_phone";
const HEALTH_COLUMNS = "emergency_contact_name,emergency_contact_phone,allergies,medical_conditions,medications,special_needs,authorized_pickup";
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

async function names(programIds: number[], termIds: number[]): Promise<{ program: Map<number, string>; term: Map<number, string> }> {
  const db = getSupabaseAdmin();
  const [programs, terms] = await Promise.all([
    programIds.length ? db.from("programs").select("id,name").in("id", programIds) : Promise.resolve({ data: [] as Row[], error: null }),
    termIds.length ? db.from("program_terms").select("id,name").in("id", termIds) : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  throwIfSupabaseError(programs.error, "Could not load programmes");
  throwIfSupabaseError(terms.error, "Could not load terms");
  return {
    program: new Map(((programs.data ?? []) as Row[]).map((row) => [Number(row.id), String(row.name)])),
    term: new Map(((terms.data ?? []) as Row[]).map((row) => [Number(row.id), String(row.name)])),
  };
}

function toRegistration(row: Row, lookup: { program: Map<number, string>; term: Map<number, string> }): BusinessRegistration {
  return {
    id: Number(row.id),
    reference: String(row.reference_code),
    participantName: String(row.child_name ?? ""),
    participantIsAdult: Boolean(row.participant_is_adult),
    programName: lookup.program.get(Number(row.program_id)) ?? "",
    termName: lookup.term.get(Number(row.term_id)) ?? "",
    status: String(row.registration_status),
    paymentStatus: String(row.payment_status),
    amountDueCents: Number(row.amount_due_cents ?? 0),
    paymentFrequency: text(row.payment_frequency),
    submittedAt: String(row.submitted_at ?? ""),
    contactName: String(row.parent_name ?? ""),
    contactEmail: text(row.parent_email),
    contactPhone: text(row.parent_phone),
  };
}

// The newest 500. No health field is selected.
export async function listBusinessRegistrations(organizationId: number): Promise<BusinessRegistration[]> {
  const { data, error } = await getSupabaseAdmin().from("registrations").select(LIST_COLUMNS).eq("organization_id", organizationId).order("submitted_at", { ascending: false }).limit(500);
  throwIfSupabaseError(error, "Could not load registrations");
  const rows = (data ?? []) as Row[];
  const lookup = await names([...new Set(rows.map((r) => Number(r.program_id)))], [...new Set(rows.map((r) => Number(r.term_id)).filter(Boolean))]);
  return rows.map((row) => toRegistration(row, lookup));
}

// One registration of this business. `mayViewHealth` decides whether the
// health columns are even read; an adult's registration has none to read.
export async function getBusinessRegistration(organizationId: number, id: number, options: { mayViewHealth: boolean }): Promise<BusinessRegistrationDetail | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("registrations")
    .select(`${LIST_COLUMNS},relationship,child_dob,gender,payment_method,photo_consent,additional_notes,heard_about_us`)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the registration");
  if (!data) return null;
  const row = data as Row;
  const lookup = await names([Number(row.program_id)], row.term_id ? [Number(row.term_id)] : []);
  let health: BusinessRegistrationHealth | null = null;
  if (options.mayViewHealth && !row.participant_is_adult) {
    const { data: healthRow, error: healthError } = await db.from("registrations").select(HEALTH_COLUMNS).eq("organization_id", organizationId).eq("id", id).maybeSingle();
    throwIfSupabaseError(healthError, "Could not load the health details");
    const h = (healthRow ?? {}) as Row;
    health = {
      emergencyContactName: text(h.emergency_contact_name),
      emergencyContactPhone: text(h.emergency_contact_phone),
      allergies: text(h.allergies),
      medicalConditions: text(h.medical_conditions),
      medications: text(h.medications),
      specialNeeds: text(h.special_needs),
      authorizedPickup: text(h.authorized_pickup),
    };
  }
  return {
    ...toRegistration(row, lookup),
    relationship: text(row.relationship),
    childDob: text(row.child_dob),
    gender: text(row.gender),
    paymentMethod: text(row.payment_method),
    photoConsent: text(row.photo_consent),
    additionalNotes: text(row.additional_notes),
    heardAboutUs: text(row.heard_about_us),
    health,
  };
}

export const REGISTRATION_STATUS_CHANGES = ["confirmed", "pending", "cancelled"] as const;
export type RegistrationStatusChange = (typeof REGISTRATION_STATUS_CHANGES)[number];

// Confirm a place, put it back to pending, or cancel it. Logged.
export async function setBusinessRegistrationStatus(organizationId: number, id: number, status: RegistrationStatusChange, actorUserId: string | null): Promise<BusinessRegistration> {
  const db = getSupabaseAdmin();
  const { data: before, error: beforeError } = await db.from("registrations").select("id,registration_status").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  throwIfSupabaseError(beforeError, "Could not load the registration");
  if (!before) throw new Error("NOT_FOUND");
  const { data, error } = await db.from("registrations").update({ registration_status: status }).eq("organization_id", organizationId).eq("id", id).select(LIST_COLUMNS).single();
  throwIfSupabaseError(error, "Could not change the registration");
  await logAudit({ actorUserId, organizationId, action: "registration.status_changed", targetTable: "registrations", targetId: id, before: { status: before.registration_status }, after: { status } });
  const row = data as Row;
  return toRegistration(row, await names([Number(row.program_id)], row.term_id ? [Number(row.term_id)] : []));
}

// ---- programmes -----------------------------------------------------------------------

export type BusinessProgram = FutprepProgramSummary;

export async function listBusinessPrograms(organizationId: number): Promise<BusinessProgram[]> {
  return listFutprepPrograms(organizationId);
}

export type BusinessProgramInput = {
  name: string;
  audience: ProgramAudience;
  programType: "term" | "camp";
  ageMin: number;
  ageMax: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  termName: string;
  termStartDate: string;
  termEndDate: string;
  weeklyFeeCents: number;
  termFeeCents: number;
  registrationClosesAt: string | null;
};

// A class (weekly, with a term) or a camp (every weekday between its
// dates), created with its first term. The same creation Futprep's desk
// uses, for this business, with who it is for.
export async function createBusinessProgram(organizationId: number, input: BusinessProgramInput, actorUserId: string): Promise<{ id: number; slug: string }> {
  const created = await createFutprepProgram(
    {
      name: input.name,
      ageMin: input.ageMin,
      ageMax: input.ageMax,
      coed: true,
      locationName: input.location,
      locationAddress: input.location,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      capacity: input.capacity,
      termName: input.termName,
      termStartDate: input.termStartDate,
      termEndDate: input.termEndDate,
      breakDates: [],
      weeklyFeeCents: input.weeklyFeeCents,
      termFeeCents: input.termFeeCents,
      registrationFeeCents: 0,
      programType: input.programType,
      registrationClosesAt: input.registrationClosesAt,
    },
    { organizationId, audience: input.audience },
  );
  await logAudit({ actorUserId, organizationId, action: "program.created", targetTable: "programs", targetId: created.id, after: { name: input.name, audience: input.audience, type: input.programType, term: input.termName } });
  return { id: created.id, slug: created.slug };
}

// Open or close a programme for registration. Only this business's own.
export async function setBusinessProgramActive(organizationId: number, programId: number, active: boolean, actorUserId: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin().from("programs").update({ active }).eq("organization_id", organizationId).eq("id", programId).select("id").maybeSingle();
  throwIfSupabaseError(error, "Could not change the programme");
  if (!data) throw new Error("NOT_FOUND");
  await logAudit({ actorUserId, organizationId, action: active ? "program.opened" : "program.closed", targetTable: "programs", targetId: programId });
}
