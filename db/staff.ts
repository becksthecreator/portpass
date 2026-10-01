import { derivePaymentStatus } from "@/lib/payments";
import { ageOnDate } from "@/lib/scheduling";
import { effectiveCap } from "@/lib/futprepClasses";
import { effectiveCapForTerm, ensureFutprepPilotData, type PaymentFrequency, type PaymentMethod } from "./registrations";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type StaffRegistration = {
  id: number;
  reference_code: string;
  program_name: string;
  program_slug: string;
  // Part C: the term, for the "join the rest of the term" link after a trial.
  term_id: number;
  child_name: string;
  // Nullable: a pending_details registration (staff fast-add, parent hasn't
  // completed it yet) genuinely has none of these on file. null must render
  // as "not yet asked", never as an empty field that could be misread as
  // "asked, and the answer was none".
  child_dob: string | null;
  gender: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  medications: string | null;
  special_needs: string | null;
  authorized_pickup: string | null;
  photo_consent: string | null;
  signature_name: string | null;
  payment_frequency: string;
  payment_method: string | null;
  amount_due_cents: number;
  registration_status: string;
  payment_status: string;
  submitted_at: string;
  paid_cents: number;
};

export type StaffSession = {
  id: number;
  program_id: number;
  program_name: string;
  program_slug: string;
  // Brief 06 v2: camps and a second term sit beside Term 1, so the picker
  // shows program -> term -> day.
  program_type: "term" | "camp" | "contract";
  term_id: number;
  term_name: string;
  session_date: string;
  start_time: string;
  location: string;
  status: string;
  // Brief 12: coaches on duty (this session's own number, else the
  // program's default), the ratio, and whether the class is over its cap.
  coaches_on_duty: number;
  coaches_set: boolean;
  children_per_coach: number | null;
  capacity: number;
  effective_cap: number;
  registered: number;
  over_cap: boolean;
  // The pre-term free taster Saturday: its roster is the taster children.
  is_taster: boolean;
};

// All the roster screen needs from a registration to show and record a
// payment. The full StaffRegistration row (contact, emergency and health
// fields) must never be handed to that client component: it becomes page
// data in the browser of whoever is signed in, including a helper.
export type RosterPayment = Pick<StaffRegistration, "id" | "amount_due_cents" | "paid_cents" | "payment_method" | "payment_status">;

export type AttendanceRow = {
  registration_id: number;
  // For the "Join the term" link a taster child's parent gets (brief 12).
  reference_code?: string;
  registration_status: string;
  child_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  authorized_pickup: string | null;
  // null = not yet asked (pending_details); "" or text = asked and answered.
  allergies: string | null;
  medical_conditions: string | null;
  medications: string | null;
  special_needs: string | null;
  // The health details were deleted 90 days after the programme ended
  // (privacy policy): a blank then means "removed", not "none given".
  health_removed?: boolean;
  attendance_status: string | null;
  // A free-trial child (brief 06 v2, Part C): shown flagged "Trial".
  is_trial?: boolean;
  // true when this mark was entered after the session's date had already
  // passed -- see app/api/futprep/staff/attendance/route.ts, which
  // computes this server-side rather than trusting the client.
  is_backfill: boolean;
};

export async function listFutprepStaffRegistrations(): Promise<
  StaffRegistration[]
> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();

  // Any active Futprep program (the original Term 1 pilot, or one staff
  // added later, e.g. a second location) shows up here — not just the two
  // originally-hardcoded slugs.
  const { data: programs, error: programError } = await db
    .from("programs")
    .select("id,name,slug,start_time")
    .eq("organization_id", organizationId)
    // Brief 13: school-contract children have no family to register or
    // collect from, so they stay off the registration desk.
    .neq("program_type", "contract")
    .order("start_time", { ascending: true });
  throwIfSupabaseError(programError, "Could not load Futprep programs");

  const programRows = (programs ?? []) as Array<{
    id: number;
    name: string;
    slug: string;
    start_time: string;
  }>;
  if (!programRows.length) return [];

  const programById = new Map(programRows.map((row) => [row.id, row]));
  const programIds = programRows.map((row) => row.id);

  const [{ data: registrations, error }, { data: payments, error: paymentError }] =
    await Promise.all([
      db
        .from("registrations")
        .select("id,reference_code,program_id,term_id,child_name,child_dob,gender,parent_name,parent_email,parent_phone,emergency_contact_name,emergency_contact_phone,allergies,medical_conditions,medications,special_needs,authorized_pickup,photo_consent,signature_name,payment_frequency,payment_method,amount_due_cents,registration_status,payment_status,submitted_at")
        .in("program_id", programIds)
        .neq("registration_status", "cancelled")
        .order("child_name", { ascending: true }),
      db
        .from("payments")
        .select("registration_id,amount_cents,status")
        .eq("status", "received"),
    ]);
  throwIfSupabaseError(error, "Could not load Futprep registrations");
  throwIfSupabaseError(paymentError, "Could not load Futprep payments");

  const paidByRegistration = new Map<number, number>();
  for (const payment of (payments ?? []) as Array<{
    registration_id: number;
    amount_cents: number;
    status: string;
  }>) {
    paidByRegistration.set(
      payment.registration_id,
      (paidByRegistration.get(payment.registration_id) ?? 0) +
        Number(payment.amount_cents),
    );
  }

  const rows = (registrations ?? []) as Array<Record<string, unknown>>;
  return rows
    .map((row) => {
      const program = programById.get(Number(row.program_id));
      if (!program) return null;
      const asNullableString = (value: unknown): string | null =>
        value === null || value === undefined ? null : String(value);
      return {
        id: Number(row.id),
        reference_code: String(row.reference_code),
        program_name: program.name,
        program_slug: program.slug,
        term_id: Number(row.term_id),
        child_name: String(row.child_name),
        child_dob: asNullableString(row.child_dob),
        gender: asNullableString(row.gender),
        parent_name: asNullableString(row.parent_name),
        parent_email: asNullableString(row.parent_email),
        parent_phone: asNullableString(row.parent_phone),
        emergency_contact_name: asNullableString(row.emergency_contact_name),
        emergency_contact_phone: asNullableString(row.emergency_contact_phone),
        allergies: asNullableString(row.allergies),
        medical_conditions: asNullableString(row.medical_conditions),
        medications: asNullableString(row.medications),
        special_needs: asNullableString(row.special_needs),
        authorized_pickup: asNullableString(row.authorized_pickup),
        photo_consent: asNullableString(row.photo_consent),
        signature_name: asNullableString(row.signature_name),
        payment_frequency: String(row.payment_frequency),
        payment_method: asNullableString(row.payment_method),
        amount_due_cents: Number(row.amount_due_cents),
        registration_status: String(row.registration_status),
        payment_status: String(row.payment_status),
        submitted_at: String(row.submitted_at),
        paid_cents: paidByRegistration.get(Number(row.id)) ?? 0,
      } satisfies StaffRegistration;
    })
    .filter((row): row is StaffRegistration => Boolean(row))
    .sort((a, b) => {
      const aProgram = programById.get(
        programRows.find((program) => program.slug === a.program_slug)?.id ?? -1,
      );
      const bProgram = programById.get(
        programRows.find((program) => program.slug === b.program_slug)?.id ?? -1,
      );
      return String(aProgram?.start_time ?? "").localeCompare(
        String(bProgram?.start_time ?? ""),
      );
    });
}

export async function listFutprepStaffSessions(): Promise<StaffSession[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();

  // Active programs only: a camp created switched off (awaiting its
  // details) keeps its generated days out of the coaches' picker.
  const { data: programs, error: programError } = await db
    .from("programs")
    .select("id,name,slug,program_type,capacity,children_per_coach,default_coaches")
    .eq("organization_id", organizationId)
    .eq("active", true);
  throwIfSupabaseError(programError, "Could not load Futprep session programs");

  const programRows = (programs ?? []) as Array<{
    id: number;
    name: string;
    slug: string;
    program_type: string;
    capacity: number;
    children_per_coach: number | null;
    default_coaches: number | null;
  }>;
  if (!programRows.length) return [];

  const programById = new Map(programRows.map((row) => [row.id, row]));
  const programIds = programRows.map((row) => row.id);
  const [{ data: sessions, error }, { data: terms, error: termsError }, { data: counted, error: countedError }] = await Promise.all([
    db
      .from("sessions")
      .select("id,program_id,term_id,session_date,start_time,location,status,coaches_on_duty")
      .in("program_id", programIds)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true }),
    db.from("program_terms").select("id,name,active,taster_date").in("program_id", programIds),
    db.from("registrations").select("term_id,registration_status,trial_session_id").in("program_id", programIds).in("registration_status", ["pending_details", "pending", "confirmed", "trial"]),
  ]);
  throwIfSupabaseError(error, "Could not load Futprep sessions");
  throwIfSupabaseError(termsError, "Could not load Futprep terms");
  throwIfSupabaseError(countedError, "Could not count Futprep registrations");
  const tasterDate = new Map((terms ?? []).map((t: { id: number; taster_date: string | null }) => [Number(t.id), t.taster_date]));
  const registeredByTerm = new Map<number, number>();
  const tastersBySession = new Map<number, number>();
  for (const row of (counted ?? []) as Array<{ term_id: number; registration_status: string; trial_session_id: number | null }>) {
    if (row.registration_status === "trial") {
      if (row.trial_session_id) tastersBySession.set(Number(row.trial_session_id), (tastersBySession.get(Number(row.trial_session_id)) ?? 0) + 1);
    } else {
      registeredByTerm.set(Number(row.term_id), (registeredByTerm.get(Number(row.term_id)) ?? 0) + 1);
    }
  }
  const termName = new Map((terms ?? []).map((t: { id: number; name: string }) => [Number(t.id), t.name]));
  // A term that is switched off (a placeholder Term 2, say) stays out of
  // the coaches' picker until it goes live.
  const activeTerms = new Set((terms ?? []).filter((t: { active: boolean }) => t.active).map((t: { id: number }) => Number(t.id)));

  return (sessions ?? []).filter((session: { term_id: number }) => activeTerms.has(Number(session.term_id))).map(
    (session: {
      id: number;
      program_id: number;
      term_id: number;
      session_date: string;
      start_time: string;
      location: string;
      status: string;
      coaches_on_duty: number | null;
    }) => {
      const program = programById.get(session.program_id);
      const isTaster = tasterDate.get(Number(session.term_id)) === session.session_date;
      const coaches = session.coaches_on_duty ?? Number(program?.default_coaches ?? 1);
      const childrenPerCoach = program?.children_per_coach === null || program?.children_per_coach === undefined ? null : Number(program.children_per_coach);
      const capacity = Number(program?.capacity ?? 0);
      const cap = effectiveCap({ capacity, childrenPerCoach, coachesOnDuty: session.coaches_on_duty, defaultCoaches: Number(program?.default_coaches ?? 1) });
      const registered = isTaster ? tastersBySession.get(Number(session.id)) ?? 0 : registeredByTerm.get(Number(session.term_id)) ?? 0;
      return {
        id: session.id,
        program_id: session.program_id,
        program_name: program?.name ?? "Program",
        program_slug: program?.slug ?? "",
        program_type: program?.program_type === "camp" ? ("camp" as const) : program?.program_type === "contract" ? ("contract" as const) : ("term" as const),
        term_id: Number(session.term_id),
        term_name: termName.get(Number(session.term_id)) ?? "",
        session_date: session.session_date,
        start_time: session.start_time,
        location: session.location,
        status: session.status,
        coaches_on_duty: coaches,
        coaches_set: session.coaches_on_duty !== null,
        children_per_coach: childrenPerCoach,
        capacity,
        effective_cap: cap,
        registered,
        over_cap: !isTaster && registered > cap,
        is_taster: isTaster,
      };
    },
  );
}

export async function recordFutprepPayment(input: {
  registrationId: number;
  amountCents: number;
  method: PaymentMethod;
  recordedBy: string;
  note?: string;
  receivedAt?: string;
  reference?: string;
}) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: registration, error } = await db
    .from("registrations")
    .select("id,amount_due_cents,payment_frequency,parent_name,parent_email,child_name")
    .eq("id", input.registrationId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load payment registration");
  if (!registration) throw new Error("REGISTRATION_NOT_FOUND");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const now = new Date().toISOString();
  let receivedAt = now;
  if (input.receivedAt) {
    const parsed = new Date(input.receivedAt);
    if (Number.isNaN(parsed.getTime())) throw new Error("INVALID_DATE");
    receivedAt = parsed.toISOString();
  }

  const { error: insertError } = await db.from("payments").insert({
    registration_id: input.registrationId,
    amount_cents: input.amountCents,
    method: input.method,
    status: "received",
    recorded_by: input.recordedBy,
    note: input.note ?? "",
    reference: input.reference?.trim() || null,
    received_at: receivedAt,
    created_at: now,
  });
  throwIfSupabaseError(insertError, "Could not record payment");

  const { data: payments, error: paymentError } = await db
    .from("payments")
    .select("amount_cents")
    .eq("registration_id", input.registrationId)
    .eq("status", "received");
  throwIfSupabaseError(paymentError, "Could not total payments");

  const paid = (payments ?? []).reduce(
    (sum: number, payment: { amount_cents: number }) =>
      sum + Number(payment.amount_cents),
    0,
  );

  const nextStatus = derivePaymentStatus({
    paymentFrequency: registration.payment_frequency,
    paidCents: paid,
    amountDueCents: Number(registration.amount_due_cents),
  });

  const { error: updateError } = await db
    .from("registrations")
    .update({ payment_status: nextStatus })
    .eq("id", input.registrationId);
  throwIfSupabaseError(updateError, "Could not update payment status");

  return {
    paidCents: paid,
    paymentStatus: nextStatus,
    parentName: registration.parent_name as string,
    parentEmail: registration.parent_email as string,
    childName: registration.child_name as string,
    amountDueCents: Number(registration.amount_due_cents),
  };
}

export async function updateFutprepRegistration(input: {
  registrationId: number;
  registrationStatus?: "pending_details" | "pending" | "confirmed" | "cancelled" | "waitlist";
  paymentStatus?: "pending" | "partial" | "paid" | "overdue" | "waived";
}) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const updates: Record<string, string> = {};
  if (input.registrationStatus) {
    // Promoting from the waitlist (brief 06 v2, Part C) takes a class
    // spot, so it needs one free.
    if (input.registrationStatus !== "cancelled") {
      const { data: current, error: currentError } = await db.from("registrations").select("registration_status,program_id,term_id").eq("id", input.registrationId).maybeSingle();
      throwIfSupabaseError(currentError, "Could not load registration");
      if (current?.registration_status === "waitlist") {
        const [{ count }, cap] = await Promise.all([
          db.from("registrations").select("id", { count: "exact", head: true }).eq("program_id", current.program_id).eq("term_id", current.term_id).in("registration_status", ["pending_details", "pending", "confirmed"]),
          // Brief 12: the cap the coaches on duty allow at the next session.
          effectiveCapForTerm(Number(current.program_id), Number(current.term_id)),
        ]);
        if (Number(count ?? 0) >= cap) throw new Error("PROGRAM_FULL");
      }
    }
    updates.registration_status = input.registrationStatus;
  }
  if (input.paymentStatus) updates.payment_status = input.paymentStatus;
  if (!Object.keys(updates).length) return;

  const { data, error } = await db
    .from("registrations")
    .update(updates)
    .eq("id", input.registrationId)
    .select("id,program_id,parent_name,parent_email,child_name")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not update registration");
  if (!data) throw new Error("REGISTRATION_NOT_FOUND");

  if (input.registrationStatus === "confirmed") {
    const { data: program, error: programError } = await db
      .from("programs")
      .select("name")
      .eq("id", data.program_id)
      .maybeSingle();
    throwIfSupabaseError(programError, "Could not load confirmed registration's program");
    return {
      parentName: data.parent_name as string,
      parentEmail: data.parent_email as string,
      childName: data.child_name as string,
      programName: program?.name ?? "",
    };
  }
  return null;
}

// A roster row as read from the database: the safety columns are absent
// when the query did not select them.
type RosterRegistrationRow = {
  id: number;
  reference_code: string;
  registration_status: string;
  child_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  authorized_pickup?: string | null;
  allergies?: string | null;
  medical_conditions?: string | null;
  medications?: string | null;
  special_needs?: string | null;
  health_purged_at?: string | null;
};

// `includeSafety: false` is for the read-only helper login: the emergency
// contact, pickup and health columns are then never selected, so they
// cannot reach that person's browser (privacy policy v2, brief 16 D).
export async function rosterForSession(
  sessionId: number,
  options: { includeSafety?: boolean } = {},
): Promise<AttendanceRow[]> {
  const includeSafety = options.includeSafety ?? true;
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("program_id,term_id,session_date")
    .eq("id", sessionId)
    .maybeSingle();
  throwIfSupabaseError(sessionError, "Could not load session roster");
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const { data: term } = await db.from("program_terms").select("taster_date").eq("id", session.term_id).maybeSingle();
  // Brief 12: the pre-term taster Saturday is the taster children only;
  // families already registered for the term start with the term.
  const isTaster = term?.taster_date === session.session_date;
  const who = isTaster
    ? `and(registration_status.eq.trial,trial_session_id.eq.${Number(sessionId)})`
    : `registration_status.in.(pending_details,pending,confirmed),and(registration_status.eq.trial,trial_session_id.eq.${Number(sessionId)})`;

  // The session's own term only: once Term 2 runs on the same program, a
  // Term 1 child must not appear on a Term 2 Saturday (brief 06 v2). Term
  // children, plus taster children booked for this Saturday. Two literal
  // selects (not one built from a variable) so a helper's query can never
  // name the safety columns.
  const registrationsQuery = includeSafety
    ? db
        .from("registrations")
        .select("id,reference_code,registration_status,child_name,parent_name,parent_phone,emergency_contact_name,emergency_contact_phone,authorized_pickup,allergies,medical_conditions,medications,special_needs,health_purged_at")
        .eq("program_id", session.program_id)
        .eq("term_id", session.term_id)
        .or(who)
        .order("child_name", { ascending: true })
    : db
        .from("registrations")
        .select("id,reference_code,registration_status,child_name,parent_name,parent_phone")
        .eq("program_id", session.program_id)
        .eq("term_id", session.term_id)
        .or(who)
        .order("child_name", { ascending: true });
  const [registrationsResult, { data: attendance, error: attendanceError }] = await Promise.all([
    registrationsQuery,
    db.from("attendance").select("registration_id,status,is_backfill").eq("session_id", sessionId),
  ]);
  const error = registrationsResult.error;
  const registrations = (registrationsResult.data ?? []) as unknown as RosterRegistrationRow[];
  throwIfSupabaseError(error, "Could not load roster registrations");
  throwIfSupabaseError(attendanceError, "Could not load attendance");

  const attendanceByRegistration = new Map<number, { status: string; is_backfill: boolean }>(
    (attendance ?? []).map(
      (row: { registration_id: number; status: string; is_backfill: boolean }) => [
        row.registration_id,
        { status: row.status, is_backfill: row.is_backfill },
      ],
    ),
  );

  return registrations.map(
    (row) => ({
      registration_id: row.id,
      reference_code: row.reference_code,
      registration_status: row.registration_status,
      child_name: row.child_name,
      parent_name: row.parent_name,
      parent_phone: row.parent_phone,
      emergency_contact_name: row.emergency_contact_name ?? null,
      emergency_contact_phone: row.emergency_contact_phone ?? null,
      authorized_pickup: row.authorized_pickup ?? null,
      allergies: row.allergies ?? null,
      medical_conditions: row.medical_conditions ?? null,
      medications: row.medications ?? null,
      special_needs: row.special_needs ?? null,
      health_removed: Boolean(row.health_purged_at),
      is_trial: row.registration_status === "trial",
      attendance_status: attendanceByRegistration.get(row.id)?.status ?? null,
      is_backfill: attendanceByRegistration.get(row.id)?.is_backfill ?? false,
    }),
  );
}

// "Coaches today" on the roster (brief 12): null goes back to the
// program's default. Returns the session's cap with that many coaches.
export async function setSessionCoaches(sessionId: number, coaches: number | null): Promise<{ coaches: number; effectiveCap: number }> {
  if (coaches !== null && (!Number.isInteger(coaches) || coaches < 0 || coaches > 20)) throw new Error("INVALID_COACHES");
  const db = getSupabaseAdmin();
  const { data: session, error } = await db.from("sessions").update({ coaches_on_duty: coaches }).eq("id", sessionId).select("program_id").maybeSingle();
  throwIfSupabaseError(error, "Could not save the coaches on duty");
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const { data: program, error: programError } = await db.from("programs").select("capacity,children_per_coach,default_coaches").eq("id", session.program_id).maybeSingle();
  throwIfSupabaseError(programError, "Could not load the program");
  const defaultCoaches = Number(program?.default_coaches ?? 1);
  return {
    coaches: coaches ?? defaultCoaches,
    effectiveCap: effectiveCap({ capacity: Number(program?.capacity ?? 0), childrenPerCoach: program?.children_per_coach ?? null, coachesOnDuty: coaches, defaultCoaches }),
  };
}

export async function markFutprepAttendance(input: {
  sessionId: number;
  registrationId: number;
  status: "present" | "absent" | "excused" | "late";
  markedBy: string;
}) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  // is_backfill is computed here, from the session's own date, rather than
  // trusted from the client -- a coach marking today's session and a coach
  // catching up on 5 September should both get the right answer even if
  // one of them has a wrong device clock.
  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("session_date")
    .eq("id", input.sessionId)
    .maybeSingle();
  throwIfSupabaseError(sessionError, "Could not load session for attendance");
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const today = now.slice(0, 10);
  const isBackfill = (session.session_date as string) < today;

  const { error } = await db.from("attendance").upsert(
    {
      registration_id: input.registrationId,
      session_id: input.sessionId,
      status: input.status,
      marked_by: input.markedBy,
      marked_at: now,
      is_backfill: isBackfill,
    },
    { onConflict: "registration_id,session_id" },
  );
  throwIfSupabaseError(error, "Could not mark attendance");
}

// The "tap again to undo" interaction: since a real row is either
// present/absent/excused/late (the CHECK constraint has no "unmarked"
// value) or doesn't exist, undoing a mark means deleting the row, not
// writing a fifth status. rosterForSession already treats "no row" as
// null/unmarked, so the roster correctly reverts on its own.
export async function clearFutprepAttendance(input: { sessionId: number; registrationId: number }) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("attendance")
    .delete()
    .eq("session_id", input.sessionId)
    .eq("registration_id", input.registrationId);
  throwIfSupabaseError(error, "Could not clear attendance");
}


export type StaffSessionPlan = {
  session_id: number;
  title: string;
  plan_text: string;
  parent_note: string;
  attachment_url: string;
  updated_by: string;
  updated_at: string;
};

export type StaffWorkLog = {
  session_id: number;
  staff_name: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  notes: string;
  updated_at: string;
};

function optionalStaffToolsMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" ||
    error.code === "PGRST205" ||
    String(error.message ?? "").toLowerCase().includes("schema cache");
}

async function assertFutprepSession(sessionId: number) {
  const db = getSupabaseAdmin();
  const { data: session, error } = await db
    .from("sessions")
    .select("id,program_id")
    .eq("id", sessionId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not validate Futprep session");
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const organizationId = await futprepOrganizationId();
  const { data: program, error: programError } = await db
    .from("programs")
    .select("slug")
    .eq("id", session.program_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  throwIfSupabaseError(programError, "Could not validate Futprep program");
  if (!program) throw new Error("SESSION_NOT_FOUND");
}

export async function getFutprepSessionPlan(sessionId: number): Promise<StaffSessionPlan | null> {
  await ensureFutprepPilotData();
  await assertFutprepSession(sessionId);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("session_plans")
    .select("session_id,title,plan_text,parent_note,attachment_url,updated_by,updated_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (optionalStaffToolsMissing(error)) return null;
  throwIfSupabaseError(error, "Could not load session plan");
  return data ? {
    session_id: Number(data.session_id),
    title: String(data.title ?? ""),
    plan_text: String(data.plan_text ?? ""),
    parent_note: String(data.parent_note ?? ""),
    attachment_url: String(data.attachment_url ?? ""),
    updated_by: String(data.updated_by ?? ""),
    updated_at: String(data.updated_at ?? ""),
  } : null;
}

export async function saveFutprepSessionPlan(input: {
  sessionId: number;
  title: string;
  planText: string;
  parentNote: string;
  attachmentUrl: string;
  updatedBy: string;
}) {
  await ensureFutprepPilotData();
  await assertFutprepSession(input.sessionId);
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("session_plans")
    .upsert({
      session_id: input.sessionId,
      title: input.title,
      plan_text: input.planText,
      parent_note: input.parentNote,
      attachment_url: input.attachmentUrl,
      updated_by: input.updatedBy,
      updated_at: now,
    }, { onConflict: "session_id" })
    .select("session_id,title,plan_text,parent_note,attachment_url,updated_by,updated_at")
    .single();
  if (optionalStaffToolsMissing(error)) throw new Error("STAFF_TOOLS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error, "Could not save session plan");
  return data;
}

export async function getFutprepWorkLog(
  sessionId: number,
  staffName: string,
): Promise<StaffWorkLog | null> {
  await ensureFutprepPilotData();
  await assertFutprepSession(sessionId);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("staff_work_logs")
    .select("session_id,staff_name,work_date,start_time,end_time,hours,notes,updated_at")
    .eq("session_id", sessionId)
    .eq("staff_name", staffName)
    .maybeSingle();
  if (optionalStaffToolsMissing(error)) return null;
  throwIfSupabaseError(error, "Could not load work log");
  return data ? {
    session_id: Number(data.session_id),
    staff_name: String(data.staff_name),
    work_date: String(data.work_date),
    start_time: String(data.start_time ?? ""),
    end_time: String(data.end_time ?? ""),
    hours: Number(data.hours ?? 0),
    notes: String(data.notes ?? ""),
    updated_at: String(data.updated_at ?? ""),
  } : null;
}

export async function saveFutprepWorkLog(input: {
  sessionId: number;
  staffName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  notes: string;
}) {
  await ensureFutprepPilotData();
  await assertFutprepSession(input.sessionId);
  if (!Number.isFinite(input.hours) || input.hours < 0 || input.hours > 24) {
    throw new Error("INVALID_HOURS");
  }
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("staff_work_logs")
    .upsert({
      session_id: input.sessionId,
      staff_name: input.staffName,
      work_date: input.workDate,
      start_time: input.startTime,
      end_time: input.endTime,
      hours: input.hours,
      notes: input.notes,
      updated_at: now,
    }, { onConflict: "session_id,staff_name" })
    .select("session_id,staff_name,work_date,start_time,end_time,hours,notes,updated_at")
    .single();
  if (optionalStaffToolsMissing(error)) throw new Error("STAFF_TOOLS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error, "Could not save work log");
  return data;
}

export async function listFutprepSessionPlans(): Promise<StaffSessionPlan[]> {
  const sessions = await listFutprepStaffSessions();
  if (!sessions.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("session_plans")
    .select("session_id,title,plan_text,parent_note,attachment_url,updated_by,updated_at")
    .in("session_id", sessions.map((item) => item.id));
  if (optionalStaffToolsMissing(error)) return [];
  throwIfSupabaseError(error, "Could not load Futprep session plans");
  return (data ?? []).map((row: Record<string, unknown>) => ({
    session_id: Number(row.session_id),
    title: String(row.title ?? ""),
    plan_text: String(row.plan_text ?? ""),
    parent_note: String(row.parent_note ?? ""),
    attachment_url: String(row.attachment_url ?? ""),
    updated_by: String(row.updated_by ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }));
}

export async function listFutprepWorkLogs(): Promise<StaffWorkLog[]> {
  const sessions = await listFutprepStaffSessions();
  if (!sessions.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("staff_work_logs")
    .select("session_id,staff_name,work_date,start_time,end_time,hours,notes,updated_at")
    .in("session_id", sessions.map((item) => item.id))
    .order("work_date", { ascending: true });
  if (optionalStaffToolsMissing(error)) return [];
  throwIfSupabaseError(error, "Could not load Futprep work logs");
  return (data ?? []).map((row: Record<string, unknown>) => ({
    session_id: Number(row.session_id),
    staff_name: String(row.staff_name ?? ""),
    work_date: String(row.work_date ?? ""),
    start_time: String(row.start_time ?? ""),
    end_time: String(row.end_time ?? ""),
    hours: Number(row.hours ?? 0),
    notes: String(row.notes ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }));
}

export type FutprepPaymentRecord = {
  id: number;
  amount_cents: number;
  method: string;
  status: string;
  recorded_by: string | null;
  note: string;
  reference: string | null;
  received_at: string | null;
  created_at: string;
};

export type FutprepRegistrationEdit = {
  id: number;
  changed_by: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
};

export type FutprepRegistrationDetail = {
  id: number;
  reference_code: string;
  program_id: number;
  term_id: number;
  program_name: string;
  program_slug: string;
  child_name: string;
  child_dob: string | null;
  gender: string | null;
  relationship: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  medications: string | null;
  special_needs: string | null;
  medical_info_source: "parent" | "staff" | null;
  // Set once the health details were deleted under the 90-day rule
  // (privacy policy v2): blank then means "removed", not "none given".
  health_purged_at: string | null;
  authorized_pickup: string | null;
  photo_consent: string | null;
  signature_name: string | null;
  consent_accepted: boolean;
  consent_at: string | null;
  payment_frequency: string;
  payment_method: string | null;
  amount_due_cents: number;
  registration_status: string;
  payment_status: string;
  additional_notes: string;
  submitted_at: string;
  paid_cents: number;
  payments: FutprepPaymentRecord[];
  edits: FutprepRegistrationEdit[];
};

const DETAIL_COLUMNS =
  "id,reference_code,program_id,term_id,child_name,child_dob,gender,relationship,parent_name,parent_email,parent_phone,emergency_contact_name,emergency_contact_phone,allergies,medical_conditions,medications,special_needs,medical_info_source,health_purged_at,authorized_pickup,photo_consent,signature_name,consent_accepted,consent_at,payment_frequency,payment_method,amount_due_cents,registration_status,payment_status,additional_notes,submitted_at";

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

// Full staff-editable record for the child detail view: every field on the
// registration, plus its payment history and edit audit trail, so the page
// can show "who changed what and when" without a second round trip.
export async function getFutprepRegistrationDetail(
  registrationId: number,
): Promise<FutprepRegistrationDetail | null> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: registration, error } = await db
    .from("registrations")
    .select(DETAIL_COLUMNS)
    .eq("id", registrationId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load registration");
  if (!registration) return null;

  const [
    { data: program, error: programError },
    { data: payments, error: paymentError },
    { data: edits, error: editError },
  ] = await Promise.all([
    db.from("programs").select("name,slug").eq("id", registration.program_id).maybeSingle(),
    db
      .from("payments")
      .select("id,amount_cents,method,status,recorded_by,note,reference,received_at,created_at")
      .eq("registration_id", registrationId)
      .order("received_at", { ascending: false }),
    db
      .from("registration_edits")
      .select("id,changed_by,changes,created_at")
      .eq("registration_id", registrationId)
      .order("created_at", { ascending: false }),
  ]);
  throwIfSupabaseError(programError, "Could not load registration program");
  throwIfSupabaseError(paymentError, "Could not load registration payments");
  throwIfSupabaseError(editError, "Could not load registration edit history");

  const paymentRows = (payments ?? []) as Array<Record<string, unknown>>;
  const paidCents = paymentRows
    .filter((row) => row.status === "received")
    .reduce((sum, row) => sum + Number(row.amount_cents), 0);

  return {
    id: Number(registration.id),
    reference_code: String(registration.reference_code),
    program_id: Number(registration.program_id),
    term_id: Number(registration.term_id),
    program_name: program?.name ?? "",
    program_slug: program?.slug ?? "",
    child_name: String(registration.child_name),
    child_dob: asNullableString(registration.child_dob),
    gender: asNullableString(registration.gender),
    relationship: asNullableString(registration.relationship),
    parent_name: asNullableString(registration.parent_name),
    parent_email: asNullableString(registration.parent_email),
    parent_phone: asNullableString(registration.parent_phone),
    emergency_contact_name: asNullableString(registration.emergency_contact_name),
    emergency_contact_phone: asNullableString(registration.emergency_contact_phone),
    allergies: asNullableString(registration.allergies),
    medical_conditions: asNullableString(registration.medical_conditions),
    medications: asNullableString(registration.medications),
    special_needs: asNullableString(registration.special_needs),
    medical_info_source: (registration.medical_info_source as "parent" | "staff" | null) ?? null,
    health_purged_at: asNullableString(registration.health_purged_at),
    authorized_pickup: asNullableString(registration.authorized_pickup),
    photo_consent: asNullableString(registration.photo_consent),
    signature_name: asNullableString(registration.signature_name),
    consent_accepted: Boolean(registration.consent_accepted),
    consent_at: asNullableString(registration.consent_at),
    payment_frequency: String(registration.payment_frequency),
    payment_method: asNullableString(registration.payment_method),
    amount_due_cents: Number(registration.amount_due_cents),
    registration_status: String(registration.registration_status),
    payment_status: String(registration.payment_status),
    additional_notes: String(registration.additional_notes ?? ""),
    submitted_at: String(registration.submitted_at),
    paid_cents: paidCents,
    payments: paymentRows.map((row) => ({
      id: Number(row.id),
      amount_cents: Number(row.amount_cents),
      method: String(row.method),
      status: String(row.status),
      recorded_by: asNullableString(row.recorded_by),
      note: String(row.note ?? ""),
      reference: asNullableString(row.reference),
      received_at: asNullableString(row.received_at),
      created_at: String(row.created_at),
    })),
    edits: ((edits ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      changed_by: String(row.changed_by),
      changes: (row.changes as Record<string, { from: unknown; to: unknown }>) ?? {},
      created_at: String(row.created_at),
    })),
  };
}

export type FutprepRegistrationDetailInput = {
  childName?: string;
  childDob?: string | null;
  gender?: string | null;
  programSlug?: string;
  relationship?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  authorizedPickup?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  medications?: string | null;
  specialNeeds?: string | null;
  photoConsent?: "yes" | "no" | null;
  paymentFrequency?: PaymentFrequency;
  paymentMethod?: PaymentMethod | null;
  // A staff override for an agreed one-off arrangement. Wins over whatever
  // the term recalculation above would otherwise have set.
  amountDueCentsOverride?: number | null;
  additionalNotes?: string;
};

const AUDIT_FIELD_LABELS: Record<string, string> = {
  child_name: "Child name",
  child_dob: "Date of birth",
  gender: "Gender",
  program_id: "Programme",
  relationship: "Relationship to child",
  parent_name: "Parent name",
  parent_email: "Parent email",
  parent_phone: "Parent phone",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_phone: "Emergency contact phone",
  authorized_pickup: "Authorized pickup",
  allergies: "Allergies",
  medical_conditions: "Medical conditions",
  medications: "Medications",
  special_needs: "Special needs",
  photo_consent: "Photo/video consent",
  payment_frequency: "Payment frequency",
  payment_method: "Payment method",
  amount_due_cents: "Amount due",
  additional_notes: "Notes",
};

// The full staff edit for a child's record. Deliberately never touches
// signature_name / consent_accepted / consent_at -- those stay
// parent-supplied only. A staff acknowledgement of, say, a verbal medical
// update is recorded as a plain audit-trail note (see registration_edits),
// never written into the consent columns themselves.
export async function updateFutprepRegistrationDetail(
  registrationId: number,
  input: FutprepRegistrationDetailInput,
  staffName: string,
) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: current, error } = await db
    .from("registrations")
    .select(
      "id,program_id,term_id,child_name,child_dob,gender,relationship,parent_name,parent_email,parent_phone,emergency_contact_name,emergency_contact_phone,allergies,medical_conditions,medications,special_needs,authorized_pickup,photo_consent,payment_frequency,payment_method,amount_due_cents,additional_notes",
    )
    .eq("id", registrationId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load registration to update");
  if (!current) throw new Error("REGISTRATION_NOT_FOUND");

  const updates: Record<string, unknown> = {};

  if (input.childName !== undefined) updates.child_name = input.childName.trim();
  if (input.childDob !== undefined) updates.child_dob = input.childDob || null;
  if (input.gender !== undefined) updates.gender = input.gender || null;
  if (input.relationship !== undefined) updates.relationship = input.relationship?.trim() || null;
  if (input.parentName !== undefined) updates.parent_name = input.parentName?.trim() || null;
  if (input.parentEmail !== undefined) updates.parent_email = input.parentEmail?.trim().toLowerCase() || null;
  if (input.parentPhone !== undefined) updates.parent_phone = input.parentPhone?.trim() || null;
  if (input.emergencyContactName !== undefined) updates.emergency_contact_name = input.emergencyContactName?.trim() || null;
  if (input.emergencyContactPhone !== undefined) updates.emergency_contact_phone = input.emergencyContactPhone?.trim() || null;
  if (input.authorizedPickup !== undefined) updates.authorized_pickup = input.authorizedPickup?.trim() || null;
  if (input.additionalNotes !== undefined) updates.additional_notes = input.additionalNotes;

  // Any medical field touched by staff (even to clear it) marks the whole
  // medical block as staff-entered -- shown as a clear label in the UI so a
  // coach knows this wasn't confirmed by the parent directly. The editor
  // always submits all four fields, so "touched" is decided by whether the
  // normalized value actually changed, not merely whether it was present in
  // the request -- otherwise every save (even one that never opens the
  // medical section) would relabel it as staff-entered.
  const normalizeMedical = (value: string | null | undefined) => value?.trim() || null;
  let medicalTouched = false;
  const applyMedicalField = (column: "allergies" | "medical_conditions" | "medications" | "special_needs", incoming: string | null | undefined, previous: string | null) => {
    if (incoming === undefined) return;
    const next = normalizeMedical(incoming);
    if (next === normalizeMedical(previous)) return;
    updates[column] = next;
    medicalTouched = true;
  };
  applyMedicalField("allergies", input.allergies, current.allergies);
  applyMedicalField("medical_conditions", input.medicalConditions, current.medical_conditions);
  applyMedicalField("medications", input.medications, current.medications);
  applyMedicalField("special_needs", input.specialNeeds, current.special_needs);
  if (medicalTouched) updates.medical_info_source = "staff";

  if (input.photoConsent !== undefined) updates.photo_consent = input.photoConsent;

  let newTermId = Number(current.term_id);
  let programChanged = false;
  let programNameChange: { from: string; to: string } | null = null;
  if (input.programSlug) {
    const { data: program, error: programError } = await db
      .from("programs")
      .select("id,name")
      .eq("slug", input.programSlug)
      .eq("active", true)
      .maybeSingle();
    throwIfSupabaseError(programError, "Could not load selected programme");
    if (!program) throw new Error("INVALID_PROGRAM");
    if (Number(program.id) !== Number(current.program_id)) {
      const [{ data: term, error: termError }, { data: previousProgram, error: previousProgramError }] = await Promise.all([
        db
          .from("program_terms")
          .select("id")
          .eq("program_id", program.id)
          .eq("active", true)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db.from("programs").select("name").eq("id", current.program_id).maybeSingle(),
      ]);
      throwIfSupabaseError(termError, "Could not load term for selected programme");
      throwIfSupabaseError(previousProgramError, "Could not load current programme");
      if (!term) throw new Error("PROGRAM_NOT_AVAILABLE");
      newTermId = Number(term.id);
      programChanged = true;
      updates.program_id = Number(program.id);
      updates.term_id = newTermId;
      programNameChange = { from: previousProgram?.name ?? String(current.program_id), to: program.name };
    }
  }

  const frequencyChanged = input.paymentFrequency !== undefined && input.paymentFrequency !== current.payment_frequency;
  if (input.paymentFrequency !== undefined) updates.payment_frequency = input.paymentFrequency;
  if (input.paymentMethod !== undefined) updates.payment_method = input.paymentMethod;

  // Moving a child between classes, or switching weekly/term billing,
  // changes which term fee amount_due_cents is based on -- recompute it
  // from the (possibly new) term rather than leaving a stale figure.
  if (programChanged || frequencyChanged) {
    const { data: term, error: termError } = await db
      .from("program_terms")
      .select("weekly_fee_cents,term_fee_cents")
      .eq("id", newTermId)
      .maybeSingle();
    throwIfSupabaseError(termError, "Could not load term fees");
    if (!term) throw new Error("PROGRAM_NOT_AVAILABLE");
    const frequency = input.paymentFrequency ?? (current.payment_frequency as PaymentFrequency);
    updates.amount_due_cents = frequency === "term" ? Number(term.term_fee_cents) : Number(term.weekly_fee_cents);
  }

  if (input.amountDueCentsOverride !== undefined && input.amountDueCentsOverride !== null) {
    if (!Number.isInteger(input.amountDueCentsOverride) || input.amountDueCentsOverride < 0) {
      throw new Error("INVALID_AMOUNT");
    }
    updates.amount_due_cents = input.amountDueCentsOverride;
  }

  if (!Object.keys(updates).length) return;

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [column, nextValue] of Object.entries(updates)) {
    // program_id / term_id are logged together as one readable "Programme"
    // entry (below) rather than raw ids.
    if (column === "term_id" || column === "program_id") continue;
    const previousValue = (current as Record<string, unknown>)[column] ?? null;
    if (previousValue !== nextValue) {
      changes[AUDIT_FIELD_LABELS[column] ?? column] = { from: previousValue, to: nextValue };
    }
  }
  if (programNameChange) changes.Programme = programNameChange;

  const { error: updateError } = await db.from("registrations").update(updates).eq("id", registrationId);
  throwIfSupabaseError(updateError, "Could not update registration");

  if (Object.keys(changes).length) {
    const { error: auditError } = await db.from("registration_edits").insert({
      registration_id: registrationId,
      changed_by: staffName,
      changes,
    });
    throwIfSupabaseError(auditError, "Could not record edit history");
  }

  // The amount due (or how it's billed) may have just changed underneath an
  // existing balance -- e.g. a family moved from an incorrect "weekly" flag
  // to "term" now needs their $210 re-evaluated against the real term fee,
  // not silently left "paid".
  if (updates.amount_due_cents !== undefined || updates.payment_frequency !== undefined) {
    const { data: payments, error: paymentError } = await db
      .from("payments")
      .select("amount_cents")
      .eq("registration_id", registrationId)
      .eq("status", "received");
    throwIfSupabaseError(paymentError, "Could not total payments");
    const paid = (payments ?? []).reduce((sum: number, row: { amount_cents: number }) => sum + Number(row.amount_cents), 0);
    const nextStatus = derivePaymentStatus({
      paymentFrequency: (updates.payment_frequency as PaymentFrequency | undefined) ?? (current.payment_frequency as PaymentFrequency),
      paidCents: paid,
      amountDueCents: Number(updates.amount_due_cents ?? current.amount_due_cents),
    });
    const { error: statusError } = await db
      .from("registrations")
      .update({ payment_status: nextStatus })
      .eq("id", registrationId);
    throwIfSupabaseError(statusError, "Could not update payment status");
  }
}

// Corrects a mistaken payment entry. Rather than editing amounts in place
// (which would make the audit trail ambiguous about what was actually
// received), a void removes the entry and recomputes the balance -- staff
// re-record the correct payment separately if one is still owed.
export async function voidFutprepPayment(input: {
  paymentId: number;
  voidedBy: string;
  reason?: string;
}) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: payment, error } = await db
    .from("payments")
    .select("id,registration_id,amount_cents,method,received_at")
    .eq("id", input.paymentId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load payment");
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");

  const { error: deleteError } = await db.from("payments").delete().eq("id", input.paymentId);
  throwIfSupabaseError(deleteError, "Could not remove payment");

  const { data: registration, error: registrationError } = await db
    .from("registrations")
    .select("payment_frequency,amount_due_cents")
    .eq("id", payment.registration_id)
    .maybeSingle();
  throwIfSupabaseError(registrationError, "Could not load registration for payment void");

  const { data: remaining, error: remainingError } = await db
    .from("payments")
    .select("amount_cents")
    .eq("registration_id", payment.registration_id)
    .eq("status", "received");
  throwIfSupabaseError(remainingError, "Could not total remaining payments");
  const paidCents = (remaining ?? []).reduce((sum: number, row: { amount_cents: number }) => sum + Number(row.amount_cents), 0);

  const paymentStatus = registration
    ? derivePaymentStatus({
        paymentFrequency: registration.payment_frequency,
        paidCents,
        amountDueCents: Number(registration.amount_due_cents),
      })
    : "pending";

  const { error: statusError } = await db
    .from("registrations")
    .update({ payment_status: paymentStatus })
    .eq("id", payment.registration_id);
  throwIfSupabaseError(statusError, "Could not update payment status after void");

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const { error: auditError } = await db.from("registration_edits").insert({
    registration_id: payment.registration_id,
    changed_by: input.voidedBy,
    changes: {
      Payment: {
        from: `${money(Number(payment.amount_cents))} recorded ${payment.received_at ? `on ${String(payment.received_at).slice(0, 10)}` : ""}`.trim(),
        to: `Voided${input.reason ? ` — ${input.reason}` : ""}`,
      },
    },
  });
  throwIfSupabaseError(auditError, "Could not record payment void");

  return { registrationId: Number(payment.registration_id), paidCents, paymentStatus };
}

export type FutprepMoneySummaryBucket = {
  programSlug: string;
  programName: string;
  expectedCents: number;
  collectedCents: number;
  outstandingCents: number;
  countWithBalance: number;
  count: number;
};

export type FutprepMoneySummary = {
  combined: FutprepMoneySummaryBucket;
  byProgram: FutprepMoneySummaryBucket[];
};

// Built directly from the same rows the roster shows (registrations +
// summed received payments) so the strip's totals can never drift from
// what a direct sum of those two tables would produce.
export async function getFutprepMoneySummary(): Promise<FutprepMoneySummary> {
  const registrations = await listFutprepStaffRegistrations();

  const byProgramMap = new Map<string, FutprepMoneySummaryBucket>();
  for (const registration of registrations) {
    const bucket = byProgramMap.get(registration.program_slug) ?? {
      programSlug: registration.program_slug,
      programName: registration.program_name,
      expectedCents: 0,
      collectedCents: 0,
      outstandingCents: 0,
      countWithBalance: 0,
      count: 0,
    };
    bucket.expectedCents += registration.amount_due_cents;
    bucket.collectedCents += registration.paid_cents;
    bucket.count += 1;
    if (registration.amount_due_cents - registration.paid_cents > 0) bucket.countWithBalance += 1;
    byProgramMap.set(registration.program_slug, bucket);
  }

  const byProgram = Array.from(byProgramMap.values()).map((bucket) => ({
    ...bucket,
    outstandingCents: Math.max(0, bucket.expectedCents - bucket.collectedCents),
  }));

  const combined = byProgram.reduce<FutprepMoneySummaryBucket>(
    (acc, bucket) => ({
      programSlug: "combined",
      programName: "All programmes",
      expectedCents: acc.expectedCents + bucket.expectedCents,
      collectedCents: acc.collectedCents + bucket.collectedCents,
      outstandingCents: acc.outstandingCents + bucket.outstandingCents,
      countWithBalance: acc.countWithBalance + bucket.countWithBalance,
      count: acc.count + bucket.count,
    }),
    { programSlug: "combined", programName: "All programmes", expectedCents: 0, collectedCents: 0, outstandingCents: 0, countWithBalance: 0, count: 0 },
  );

  return { combined, byProgram };
}

// ---- camp roster export (brief 06 v2, A1.7) --------------------------------

// Everything the camp roster spreadsheet needs for one program-in-a-term,
// and nothing more: the registrations select names only non-medical
// columns, and the row type (lib/rosterCsv.ts) has no medical field to
// put one in. Attendance comes per camp day.
export async function rosterExportForTerm(programId: number, termId: number): Promise<{ programName: string; termName: string; days: string[]; rows: import("@/lib/rosterCsv").RosterExportRow[] } | null> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();

  const [{ data: program, error: programError }, { data: term, error: termError }] = await Promise.all([
    db.from("programs").select("id,name,organization_id").eq("id", programId).maybeSingle(),
    db.from("program_terms").select("id,name,program_id,start_date").eq("id", termId).maybeSingle(),
  ]);
  throwIfSupabaseError(programError, "Could not load program");
  throwIfSupabaseError(termError, "Could not load term");
  if (!program || !term || Number(program.organization_id) !== organizationId || Number(term.program_id) !== programId) return null;

  const [{ data: registrations, error }, { data: sessions, error: sessionsError }] = await Promise.all([
    db
      .from("registrations")
      .select("id,reference_code,child_name,child_dob,parent_name,parent_phone,parent_email,authorized_pickup,photo_consent,registration_status,payment_status,amount_due_cents")
      .eq("program_id", programId)
      .eq("term_id", termId)
      .in("registration_status", ["pending_details", "pending", "confirmed"])
      .order("child_name", { ascending: true }),
    db.from("sessions").select("id,session_date,status").eq("program_id", programId).eq("term_id", termId).neq("status", "cancelled").order("session_date", { ascending: true }),
  ]);
  throwIfSupabaseError(error, "Could not load roster");
  throwIfSupabaseError(sessionsError, "Could not load camp days");

  const regRows = (registrations ?? []) as Array<Record<string, unknown>>;
  const sessionRows = (sessions ?? []) as Array<{ id: number; session_date: string }>;
  const ids = regRows.map((r) => Number(r.id));
  const [{ data: payments, error: paymentsError }, { data: attendance, error: attendanceError }] = ids.length
    ? await Promise.all([
        db.from("payments").select("registration_id,amount_cents").in("registration_id", ids).eq("status", "received"),
        sessionRows.length
          ? db.from("attendance").select("registration_id,session_id,status").in("registration_id", ids).in("session_id", sessionRows.map((s) => s.id))
          : Promise.resolve({ data: [], error: null }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  throwIfSupabaseError(paymentsError, "Could not load payments");
  throwIfSupabaseError(attendanceError, "Could not load attendance");

  const paid = new Map<number, number>();
  for (const p of (payments ?? []) as Array<{ registration_id: number; amount_cents: number }>) paid.set(Number(p.registration_id), (paid.get(Number(p.registration_id)) ?? 0) + Number(p.amount_cents));
  const dayBySession = new Map(sessionRows.map((s) => [Number(s.id), s.session_date]));
  const marks = new Map<number, Record<string, string>>();
  for (const a of (attendance ?? []) as Array<{ registration_id: number; session_id: number; status: string }>) {
    const day = dayBySession.get(Number(a.session_id));
    if (!day) continue;
    const entry = marks.get(Number(a.registration_id)) ?? {};
    entry[day] = a.status;
    marks.set(Number(a.registration_id), entry);
  }

  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    programName: String(program.name),
    termName: String(term.name),
    days: sessionRows.map((s) => s.session_date),
    rows: regRows.map((r) => {
      const dob = str(r.child_dob);
      return {
        referenceCode: String(r.reference_code),
        childName: String(r.child_name),
        childDob: dob,
        ageAtStart: dob ? ageOnDate(dob, String(term.start_date)) : null,
        parentName: str(r.parent_name),
        parentPhone: str(r.parent_phone),
        parentEmail: str(r.parent_email),
        authorizedPickup: str(r.authorized_pickup),
        photoConsent: str(r.photo_consent),
        registrationStatus: String(r.registration_status),
        paymentStatus: String(r.payment_status),
        amountDueCents: Number(r.amount_due_cents),
        paidCents: paid.get(Number(r.id)) ?? 0,
        attendance: marks.get(Number(r.id)) ?? {},
      };
    }),
  };
}
