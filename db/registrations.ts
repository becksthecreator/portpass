import {
  CONSENT_VERSION,
  FUTPREP_PROGRAMS,
  FUTPREP_TERM,
} from "@/app/futprep/lil-kickers/config";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type RegistrationStatus = "pending" | "confirmed" | "cancelled";
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue" | "waived";
export type PaymentFrequency = "weekly" | "term";
export type PaymentMethod = "cash" | "bank_transfer" | "online_banking";

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
  programSlug: string;
  paymentFrequency: PaymentFrequency;
  paymentMethod: PaymentMethod;
  photoConsent: "yes" | "no";
  consentAccepted: boolean;
  signatureName: string;
};

export type FutprepAvailability = {
  slug: string;
  name: string;
  ageMin: number;
  ageMax: number;
  day: string;
  time: string;
  endTime: string;
  location: string;
  capacity: number;
  weeklyFeeCents: number;
  termFeeCents: number;
  termStartDate: string;
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
            "Runs Futprep Lil Kickers and Futprep Kickers; roster, attendance, and in-person cash collection.",
          active: true,
          created_at: now,
        },
        {
          organization_id: organization.id,
          name: "Kiki",
          role: "admin_registrar",
          email: null,
          responsibilities:
            "Registration administration, bank-transfer verification, payment tracking, and parent registration support.",
          active: true,
          created_at: now,
        },
        {
          organization_id: organization.id,
          name: "Coach Alex",
          role: "ceo",
          email: null,
          responsibilities:
            "CEO oversight with access to registrations, payments, coaching operations, session plans, and staff work logs.",
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

  // Dynamic: reads every active Futprep program (whether seeded from the
  // static Term 1 config or added later by staff, e.g. Futprep Out East)
  // rather than only the two originally-hardcoded programs.
  const { data: programs, error: programsError } = await db
    .from("programs")
    .select("id,slug,name,age_min,age_max,location,day_of_week,start_time,end_time,capacity,organization_id")
    .eq("active", true)
    .order("id", { ascending: true });
  throwIfSupabaseError(programsError, "Could not load class availability");

  const output: FutprepAvailability[] = [];

  for (const program of programs ?? []) {
    const { data: term, error: termError } = await db
      .from("program_terms")
      .select("id,start_date,weekly_fee_cents,term_fee_cents")
      .eq("program_id", program.id)
      .eq("active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(termError, "Could not load term availability");

    const capacity = Number(program.capacity);
    if (!term) {
      output.push({
        slug: program.slug,
        name: program.name,
        ageMin: Number(program.age_min),
        ageMax: Number(program.age_max),
        day: program.day_of_week,
        time: program.start_time,
        endTime: program.end_time ?? program.start_time,
        location: program.location,
        capacity,
        weeklyFeeCents: 0,
        termFeeCents: 0,
        termStartDate: new Date().toISOString().slice(0, 10),
        registered: 0,
        spotsRemaining: capacity,
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

    output.push({
      slug: program.slug,
      name: program.name,
      ageMin: Number(program.age_min),
      ageMax: Number(program.age_max),
      day: program.day_of_week,
      time: program.start_time,
      endTime: program.end_time ?? program.start_time,
      location: program.location,
      capacity,
      weeklyFeeCents: Number(term.weekly_fee_cents),
      termFeeCents: Number(term.term_fee_cents),
      termStartDate: term.start_date,
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

  const { data: program, error: programError } = await db
    .from("programs")
    .select("id,organization_id,capacity,name,age_min,age_max,location,day_of_week,start_time,end_time")
    .eq("slug", input.programSlug)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(programError, "Could not load selected program");
  if (!program) throw new Error("INVALID_PROGRAM");

  const { data: term, error: termError } = await db
    .from("program_terms")
    .select("id,name,start_date,end_date,break_dates,weekly_fee_cents,term_fee_cents")
    .eq("program_id", program.id)
    .eq("active", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfSupabaseError(termError, "Could not load selected term");
  if (!term) throw new Error("PROGRAM_NOT_AVAILABLE");

  const age = ageOnDate(input.childDob, term.start_date);
  if (age < Number(program.age_min) || age > Number(program.age_max)) {
    throw new Error("AGE_MISMATCH");
  }

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
    program: {
      slug: input.programSlug,
      name: program.name,
      ageMin: Number(program.age_min),
      ageMax: Number(program.age_max),
      day: program.day_of_week,
      time: program.start_time,
      endTime: program.end_time ?? program.start_time,
      capacity: Number(program.capacity),
      weeklyFeeCents: Number(term.weekly_fee_cents),
      termFeeCents: Number(term.term_fee_cents),
    },
    term: {
      name: term.name,
      startDate: term.start_date,
      endDate: term.end_date,
      breakDates: (term.break_dates ?? []) as string[],
      location: program.location,
    },
    amountDueCents,
    paymentStatus: "pending" as const,
    registrationStatus: "pending" as const,
  };
}
