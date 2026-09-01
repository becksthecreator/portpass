import {
  CONSENT_VERSION,
  FUTPREP_PROGRAMS,
  FUTPREP_TERM,
  type FutprepProgramSlug,
} from "@/app/futprep/lil-kickers/config";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type RegistrationStatus = "pending" | "confirmed" | "cancelled";
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue" | "waived";
export type PaymentFrequency = "weekly" | "term";
export type PaymentMethod = "cash" | "bank_transfer";

export type FutprepRegistrationInput = {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  relationship: string;
  childName: string;
  childDob: string;
  gender: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string;
  medicalConditions: string;
  medications: string;
  specialNeeds: string;
  authorizedPickup: string;
  additionalNotes: string;
  programSlug: FutprepProgramSlug;
  paymentFrequency: PaymentFrequency;
  paymentMethod: PaymentMethod;
  photoConsent: "yes" | "no";
  consentAccepted: boolean;
  signatureName: string;
};

export type FutprepAvailability = {
  slug: FutprepProgramSlug;
  name: string;
  capacity: number;
  registered: number;
  spotsRemaining: number;
};

let lastSeedAt = 0;
let seedPromise: Promise<void> | null = null;

export async function ensureFutprepPilotData() {
  if (Date.now() - lastSeedAt < 60_000) return;
  if (!seedPromise) {
    seedPromise = seedFutprepPilot().finally(() => {
      seedPromise = null;
    });
  }
  await seedPromise;
  lastSeedAt = Date.now();
}

async function seedFutprepPilot() {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: organizations, error: organizationError } = await db
    .from("organizations")
    .select("id,name")
    .or("name.ilike.%futprep%,name.ilike.%footprep%")
    .order("id", { ascending: true })
    .limit(1);
  throwIfSupabaseError(
    organizationError,
    "Could not locate Futprep organization",
  );

  const organization = (organizations?.[0] ?? null) as
    | { id: number; name: string }
    | null;

  if (organization) {
    const { error: locationError } = await db.from("locations").upsert(
      {
        organization_id: organization.id,
        name: FUTPREP_TERM.location,
        address: "Lyford Cay Lower Campus, New Providence, The Bahamas",
        map_label: "Lyford Cay Lower Campus Soccer Field",
        active: true,
        created_at: now,
      },
      { onConflict: "organization_id,name" },
    );
    throwIfSupabaseError(locationError, "Could not seed Futprep location");

    const { error: staffError } = await db.from("staff_members").upsert(
      [
        {
          organization_id: organization.id,
          name: "Coach Bex",
          role: "coach",
          email: null,
          responsibilities:
            "Runs Lil Kickers and Rookies; roster, attendance, and in-person cash collection.",
          active: true,
          created_at: now,
        },
        {
          organization_id: organization.id,
          name: "Kiki",
          role: "admin_registrar",
          email: null,
          responsibilities:
            "Registration administration, bank-transfer verification, and payment tracking.",
          active: true,
          created_at: now,
        },
      ],
      { onConflict: "organization_id,name,role" },
    );
    throwIfSupabaseError(staffError, "Could not seed Futprep staff");
  }

  for (const configured of FUTPREP_PROGRAMS) {
    const { data: existingProgram, error: existingError } = await db
      .from("programs")
      .select("id,organization_id")
      .eq("slug", configured.slug)
      .maybeSingle();
    throwIfSupabaseError(existingError, "Could not load Futprep program");

    const programPayload = {
      organization_id:
        organization?.id ??
        (existingProgram as { organization_id?: number | null } | null)
          ?.organization_id ??
        null,
      slug: configured.slug,
      name: configured.name,
      age_min: configured.ageMin,
      age_max: configured.ageMax,
      coed: true,
      location: FUTPREP_TERM.location,
      day_of_week: configured.day,
      start_time: configured.time,
      capacity: configured.capacity,
      active: true,
      created_at: now,
    };

    const { data: storedProgram, error: programError } = await db
      .from("programs")
      .upsert(programPayload, { onConflict: "slug" })
      .select("id,organization_id")
      .single();
    throwIfSupabaseError(programError, "Could not seed Futprep program");
    if (!storedProgram) throw new Error("Could not seed Futprep program");

    const programId = Number(storedProgram.id);

    if (organization) {
      const { error: attachError } = await db
        .from("registrations")
        .update({ organization_id: organization.id })
        .eq("program_id", programId)
        .is("organization_id", null);
      throwIfSupabaseError(
        attachError,
        "Could not attach Futprep registrations to organization",
      );
    }

    const { data: term, error: termError } = await db
      .from("program_terms")
      .upsert(
        {
          program_id: programId,
          name: FUTPREP_TERM.name,
          start_date: FUTPREP_TERM.startDate,
          end_date: FUTPREP_TERM.endDate,
          break_dates: FUTPREP_TERM.breakDates,
          weekly_fee_cents: configured.weeklyFeeCents,
          term_fee_cents: configured.termFeeCents,
          registration_fee_cents: 0,
          active: true,
          created_at: now,
        },
        { onConflict: "program_id,name" },
      )
      .select("id")
      .single();
    throwIfSupabaseError(termError, "Could not seed Futprep term");
    if (!term) throw new Error("Could not seed Futprep term");

    const breaks = new Set<string>(FUTPREP_TERM.breakDates);
    const cursor = new Date(`${FUTPREP_TERM.startDate}T12:00:00Z`);
    const end = new Date(`${FUTPREP_TERM.endDate}T12:00:00Z`);
    const sessions: Array<Record<string, unknown>> = [];

    while (cursor <= end) {
      const sessionDate = cursor.toISOString().slice(0, 10);
      if (!breaks.has(sessionDate)) {
        sessions.push({
          program_id: programId,
          term_id: Number(term.id),
          session_date: sessionDate,
          start_time: configured.time,
          location: FUTPREP_TERM.location,
          status: "scheduled",
          created_at: now,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    if (sessions.length) {
      const { error: sessionError } = await db
        .from("sessions")
        .upsert(sessions, {
          onConflict: "program_id,term_id,session_date",
        });
      throwIfSupabaseError(sessionError, "Could not seed Futprep sessions");
    }
  }
}

function ageOnDate(dateOfBirth: string, onDate: string) {
  const dob = new Date(`${dateOfBirth}T12:00:00Z`);
  const date = new Date(`${onDate}T12:00:00Z`);
  if (Number.isNaN(dob.valueOf()) || Number.isNaN(date.valueOf())) return -1;

  let age = date.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = date.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && date.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

export async function getFutprepAvailability(): Promise<FutprepAvailability[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const output: FutprepAvailability[] = [];

  for (const configured of FUTPREP_PROGRAMS) {
    const { data: program, error: programError } = await db
      .from("programs")
      .select("id,capacity")
      .eq("slug", configured.slug)
      .eq("active", true)
      .maybeSingle();
    throwIfSupabaseError(programError, "Could not load class availability");

    if (!program) {
      output.push({
        slug: configured.slug,
        name: configured.name,
        capacity: configured.capacity,
        registered: 0,
        spotsRemaining: configured.capacity,
      });
      continue;
    }

    const { data: term, error: termError } = await db
      .from("program_terms")
      .select("id")
      .eq("program_id", program.id)
      .eq("name", FUTPREP_TERM.name)
      .eq("active", true)
      .maybeSingle();
    throwIfSupabaseError(termError, "Could not load term availability");

    if (!term) {
      output.push({
        slug: configured.slug,
        name: configured.name,
        capacity: Number(program.capacity),
        registered: 0,
        spotsRemaining: Number(program.capacity),
      });
      continue;
    }

    const { count, error: countError } = await db
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("term_id", term.id)
      .in("registration_status", ["pending", "confirmed"]);
    throwIfSupabaseError(countError, "Could not count registrations");

    const registered = Number(count ?? 0);
    const capacity = Number(program.capacity);

    output.push({
      slug: configured.slug,
      name: configured.name,
      capacity,
      registered,
      spotsRemaining: Math.max(0, capacity - registered),
    });
  }

  return output;
}

export async function createFutprepRegistration(
  input: FutprepRegistrationInput,
) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const configuredProgram = FUTPREP_PROGRAMS.find(
    (program) => program.slug === input.programSlug,
  );
  if (!configuredProgram) throw new Error("INVALID_PROGRAM");

  const age = ageOnDate(input.childDob, FUTPREP_TERM.startDate);
  if (age < configuredProgram.ageMin || age > configuredProgram.ageMax) {
    throw new Error("AGE_MISMATCH");
  }

  const { data: program, error: programError } = await db
    .from("programs")
    .select("id,organization_id,capacity")
    .eq("slug", input.programSlug)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(programError, "Could not load selected program");
  if (!program) throw new Error("PROGRAM_NOT_AVAILABLE");

  const { data: term, error: termError } = await db
    .from("program_terms")
    .select("id,weekly_fee_cents,term_fee_cents")
    .eq("program_id", program.id)
    .eq("name", FUTPREP_TERM.name)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(termError, "Could not load selected term");
  if (!term) throw new Error("PROGRAM_NOT_AVAILABLE");

  const { count, error: countError } = await db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("program_id", program.id)
    .eq("term_id", term.id)
    .in("registration_status", ["pending", "confirmed"]);
  throwIfSupabaseError(countError, "Could not check program capacity");

  if (Number(count ?? 0) >= Number(program.capacity)) {
    throw new Error("PROGRAM_FULL");
  }

  const normalizedEmail = input.parentEmail.trim().toLowerCase();
  const { data: duplicate, error: duplicateError } = await db
    .from("registrations")
    .select("reference_code")
    .eq("term_id", term.id)
    .eq("parent_email", normalizedEmail)
    .eq("child_dob", input.childDob)
    .ilike("child_name", input.childName.trim())
    .in("registration_status", ["pending", "confirmed"])
    .limit(1)
    .maybeSingle();
  throwIfSupabaseError(duplicateError, "Could not check duplicate registration");

  if (duplicate) {
    throw new Error(`DUPLICATE:${duplicate.reference_code}`);
  }

  const amountDueCents =
    input.paymentFrequency === "term"
      ? Number(term.term_fee_cents)
      : Number(term.weekly_fee_cents);

  const now = new Date().toISOString();
  const referenceCode = `FP-${new Date().getUTCFullYear()}-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase()}`;

  const { error: insertError } = await db.from("registrations").insert({
    reference_code: referenceCode,
    organization_id: program.organization_id,
    program_id: program.id,
    term_id: term.id,
    parent_name: input.parentName.trim(),
    parent_email: normalizedEmail,
    parent_phone: input.parentPhone.trim(),
    relationship: input.relationship.trim(),
    child_name: input.childName.trim(),
    child_dob: input.childDob,
    gender: input.gender,
    emergency_contact_name: input.emergencyContactName.trim(),
    emergency_contact_phone: input.emergencyContactPhone.trim(),
    allergies: input.allergies.trim(),
    medical_conditions: input.medicalConditions.trim(),
    medications: input.medications.trim(),
    special_needs: input.specialNeeds.trim(),
    authorized_pickup: input.authorizedPickup.trim(),
    additional_notes: input.additionalNotes.trim(),
    photo_consent: input.photoConsent,
    payment_frequency: input.paymentFrequency,
    payment_method: input.paymentMethod,
    amount_due_cents: amountDueCents,
    registration_status: "pending",
    payment_status: "pending",
    consent_version: CONSENT_VERSION,
    consent_accepted: true,
    consent_at: now,
    signature_name: input.signatureName.trim(),
    submitted_at: now,
  });
  throwIfSupabaseError(insertError, "Could not create Futprep registration");

  return {
    referenceCode,
    program: configuredProgram,
    term: FUTPREP_TERM,
    amountDueCents,
    paymentStatus: "pending" as const,
    registrationStatus: "pending" as const,
  };
}
