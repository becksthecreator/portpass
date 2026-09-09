import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type FutprepProgramInput = {
  name: string;
  ageMin: number;
  ageMax: number;
  coed: boolean;
  locationName: string;
  locationAddress: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  capacity: number;
  termName: string;
  termStartDate: string;
  termEndDate: string;
  breakDates: string[];
  weeklyFeeCents: number;
  termFeeCents: number;
  registrationFeeCents: number;
};

export type FutprepProgramSummary = {
  id: number;
  slug: string;
  name: string;
  ageMin: number;
  ageMax: number;
  coed: boolean;
  location: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string | null;
  capacity: number;
  active: boolean;
  term: {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    breakDates: string[];
    weeklyFeeCents: number;
    termFeeCents: number;
    registrationFeeCents: number;
  } | null;
  registered: number;
  spotsRemaining: number | null;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "program";
}

async function uniqueSlug(base: string) {
  const db = getSupabaseAdmin();
  let candidate = base;
  let attempt = 1;
  while (attempt < 50) {
    const { data, error } = await db
      .from("programs")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    throwIfSupabaseError(error, "Could not verify program slug");
    if (!data) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  throw new Error("Could not generate a unique program slug");
}

export async function futprepOrganizationId(): Promise<number> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .or("name.ilike.%futprep%,name.ilike.%footprep%")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not locate Futprep organization");
  if (!data) throw new Error("FUTPREP_ORG_NOT_FOUND");
  return Number(data.id);
}

function nextWeekdayOnOrAfter(dateIso: string, dayOfWeek: string) {
  const targetIndex = WEEKDAYS.indexOf(dayOfWeek);
  const cursor = new Date(`${dateIso}T12:00:00Z`);
  if (targetIndex < 0 || Number.isNaN(cursor.valueOf())) return cursor;
  while (cursor.getUTCDay() !== targetIndex) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor;
}

export async function listFutprepPrograms(): Promise<FutprepProgramSummary[]> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();

  const { data: programs, error: programsError } = await db
    .from("programs")
    .select("id,slug,name,age_min,age_max,coed,location,day_of_week,start_time,end_time,capacity,active")
    .eq("organization_id", organizationId)
    .order("id", { ascending: true });
  throwIfSupabaseError(programsError, "Could not load Futprep programs");

  const output: FutprepProgramSummary[] = [];

  for (const program of programs ?? []) {
    const { data: term, error: termError } = await db
      .from("program_terms")
      .select("id,name,start_date,end_date,break_dates,weekly_fee_cents,term_fee_cents,registration_fee_cents")
      .eq("program_id", program.id)
      .eq("active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(termError, "Could not load program term");

    let registered = 0;
    let spotsRemaining: number | null = null;
    if (term) {
      const { count, error: countError } = await db
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("program_id", program.id)
        .eq("term_id", term.id)
        .in("registration_status", ["pending", "confirmed"]);
      throwIfSupabaseError(countError, "Could not count registrations");
      registered = Number(count ?? 0);
      spotsRemaining = Math.max(0, Number(program.capacity) - registered);
    }

    output.push({
      id: Number(program.id),
      slug: program.slug,
      name: program.name,
      ageMin: Number(program.age_min),
      ageMax: Number(program.age_max),
      coed: Boolean(program.coed),
      location: program.location,
      dayOfWeek: program.day_of_week,
      startTime: program.start_time,
      endTime: program.end_time ?? null,
      capacity: Number(program.capacity),
      active: Boolean(program.active),
      term: term
        ? {
            id: Number(term.id),
            name: term.name,
            startDate: term.start_date,
            endDate: term.end_date,
            breakDates: (term.break_dates ?? []) as string[],
            weeklyFeeCents: Number(term.weekly_fee_cents),
            termFeeCents: Number(term.term_fee_cents),
            registrationFeeCents: Number(term.registration_fee_cents),
          }
        : null,
      registered,
      spotsRemaining,
    });
  }

  return output;
}

export async function setFutprepProgramActive(id: number, active: boolean) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("programs").update({ active }).eq("id", id);
  throwIfSupabaseError(error, "Could not update the program.");
}

export async function createFutprepProgram(input: FutprepProgramInput) {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const organizationId = await futprepOrganizationId();

  if (input.ageMin < 0 || input.ageMax < input.ageMin) throw new Error("INVALID_AGE_RANGE");
  if (input.capacity <= 0) throw new Error("INVALID_CAPACITY");
  if (!WEEKDAYS.includes(input.dayOfWeek)) throw new Error("INVALID_DAY");
  if (new Date(`${input.termEndDate}T12:00:00Z`) < new Date(`${input.termStartDate}T12:00:00Z`)) {
    throw new Error("INVALID_TERM_DATES");
  }

  const { error: locationError } = await db.from("locations").upsert(
    {
      organization_id: organizationId,
      name: input.locationName,
      address: input.locationAddress || input.locationName,
      map_label: input.locationName,
      active: true,
      created_at: now,
    },
    { onConflict: "organization_id,name" },
  );
  throwIfSupabaseError(locationError, "Could not save the program location");

  const slug = await uniqueSlug(slugify(input.name));

  const { data: program, error: programError } = await db
    .from("programs")
    .insert({
      organization_id: organizationId,
      slug,
      name: input.name.trim(),
      age_min: input.ageMin,
      age_max: input.ageMax,
      coed: input.coed,
      location: input.locationName,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime || null,
      capacity: input.capacity,
      active: true,
      created_at: now,
    })
    .select("id")
    .single();
  throwIfSupabaseError(programError, "Could not create the program");
  if (!program) throw new Error("Could not create the program");

  const programId = Number(program.id);

  const { data: term, error: termError } = await db
    .from("program_terms")
    .insert({
      program_id: programId,
      name: input.termName.trim(),
      start_date: input.termStartDate,
      end_date: input.termEndDate,
      break_dates: input.breakDates,
      weekly_fee_cents: input.weeklyFeeCents,
      term_fee_cents: input.termFeeCents,
      registration_fee_cents: input.registrationFeeCents,
      active: true,
      created_at: now,
    })
    .select("id")
    .single();
  throwIfSupabaseError(termError, "Could not create the program term");
  if (!term) throw new Error("Could not create the program term");

  const termId = Number(term.id);
  const breaks = new Set<string>(input.breakDates);
  const cursor = nextWeekdayOnOrAfter(input.termStartDate, input.dayOfWeek);
  const end = new Date(`${input.termEndDate}T12:00:00Z`);
  const sessions: Array<Record<string, unknown>> = [];

  while (cursor <= end) {
    const sessionDate = cursor.toISOString().slice(0, 10);
    if (!breaks.has(sessionDate)) {
      sessions.push({
        program_id: programId,
        term_id: termId,
        session_date: sessionDate,
        start_time: input.startTime,
        location: input.locationName,
        status: "scheduled",
        created_at: now,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  if (sessions.length) {
    const { error: sessionError } = await db.from("sessions").upsert(sessions, {
      onConflict: "program_id,term_id,session_date",
    });
    throwIfSupabaseError(sessionError, "Could not schedule program sessions");
  }

  return { id: programId, slug, sessionsCreated: sessions.length };
}
