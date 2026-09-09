import { ensureFutprepPilotData } from "./registrations";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type OrganizationRecord = {
  id: number;
  application_id: number;
  name: string;
  primary_contact: string;
  email: string;
  phone: string;
  activity_type: string;
  main_location: string;
  created_at: string;
  slug: string | null;
  theme: Record<string, string>;
  registration_url: string | null;
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
