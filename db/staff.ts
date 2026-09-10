import { derivePaymentStatus } from "@/lib/payments";
import { ensureFutprepPilotData, type PaymentMethod } from "./registrations";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type StaffRegistration = {
  id: number;
  reference_code: string;
  program_name: string;
  program_slug: string;
  child_name: string;
  child_dob: string;
  gender: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  photo_consent: string;
  payment_frequency: string;
  payment_method: string;
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
  session_date: string;
  start_time: string;
  location: string;
  status: string;
};

export type AttendanceRow = {
  registration_id: number;
  child_name: string;
  parent_name: string;
  parent_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  authorized_pickup: string;
  allergies: string;
  medical_conditions: string;
  medications: string;
  special_needs: string;
  attendance_status: string | null;
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
        .select("id,reference_code,program_id,child_name,child_dob,gender,parent_name,parent_email,parent_phone,emergency_contact_name,emergency_contact_phone,photo_consent,payment_frequency,payment_method,amount_due_cents,registration_status,payment_status,submitted_at")
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
      return {
        id: Number(row.id),
        reference_code: String(row.reference_code),
        program_name: program.name,
        program_slug: program.slug,
        child_name: String(row.child_name),
        child_dob: String(row.child_dob),
        gender: String(row.gender),
        parent_name: String(row.parent_name),
        parent_email: String(row.parent_email),
        parent_phone: String(row.parent_phone),
        emergency_contact_name: String(row.emergency_contact_name),
        emergency_contact_phone: String(row.emergency_contact_phone),
        photo_consent: String(row.photo_consent),
        payment_frequency: String(row.payment_frequency),
        payment_method: String(row.payment_method),
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

  const { data: programs, error: programError } = await db
    .from("programs")
    .select("id,name,slug")
    .eq("organization_id", organizationId);
  throwIfSupabaseError(programError, "Could not load Futprep session programs");

  const programRows = (programs ?? []) as Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  if (!programRows.length) return [];

  const programById = new Map(programRows.map((row) => [row.id, row]));
  const { data: sessions, error } = await db
    .from("sessions")
    .select("id,program_id,session_date,start_time,location,status")
    .in(
      "program_id",
      programRows.map((row) => row.id),
    )
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  throwIfSupabaseError(error, "Could not load Futprep sessions");

  return (sessions ?? []).map(
    (session: {
      id: number;
      program_id: number;
      session_date: string;
      start_time: string;
      location: string;
      status: string;
    }) => {
      const program = programById.get(session.program_id);
      return {
        id: session.id,
        program_id: session.program_id,
        program_name: program?.name ?? "Program",
        program_slug: program?.slug ?? "",
        session_date: session.session_date,
        start_time: session.start_time,
        location: session.location,
        status: session.status,
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
  const { error: insertError } = await db.from("payments").insert({
    registration_id: input.registrationId,
    amount_cents: input.amountCents,
    method: input.method,
    status: "received",
    recorded_by: input.recordedBy,
    note: input.note ?? "",
    received_at: now,
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
  registrationStatus?: "pending" | "confirmed" | "cancelled";
  paymentStatus?: "pending" | "partial" | "paid" | "overdue" | "waived";
}) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const updates: Record<string, string> = {};
  if (input.registrationStatus) {
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

export async function rosterForSession(
  sessionId: number,
): Promise<AttendanceRow[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("program_id")
    .eq("id", sessionId)
    .maybeSingle();
  throwIfSupabaseError(sessionError, "Could not load session roster");
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const [{ data: registrations, error }, { data: attendance, error: attendanceError }] =
    await Promise.all([
      db
        .from("registrations")
        .select(
          "id,child_name,parent_name,parent_phone,emergency_contact_name,emergency_contact_phone,authorized_pickup,allergies,medical_conditions,medications,special_needs",
        )
        .eq("program_id", session.program_id)
        .in("registration_status", ["pending", "confirmed"])
        .order("child_name", { ascending: true }),
      db
        .from("attendance")
        .select("registration_id,status")
        .eq("session_id", sessionId),
    ]);
  throwIfSupabaseError(error, "Could not load roster registrations");
  throwIfSupabaseError(attendanceError, "Could not load attendance");

  const statusByRegistration = new Map<number, string>(
    (attendance ?? []).map(
      (row: { registration_id: number; status: string }) => [
        row.registration_id,
        row.status,
      ],
    ),
  );

  return (registrations ?? []).map(
    (row: {
      id: number;
      child_name: string;
      parent_name: string;
      parent_phone: string;
      emergency_contact_name: string;
      emergency_contact_phone: string;
      authorized_pickup: string;
      allergies: string;
      medical_conditions: string;
      medications: string;
      special_needs: string;
    }) => ({
      registration_id: row.id,
      child_name: row.child_name,
      parent_name: row.parent_name,
      parent_phone: row.parent_phone,
      emergency_contact_name: row.emergency_contact_name,
      emergency_contact_phone: row.emergency_contact_phone,
      authorized_pickup: row.authorized_pickup,
      allergies: row.allergies ?? "",
      medical_conditions: row.medical_conditions ?? "",
      medications: row.medications ?? "",
      special_needs: row.special_needs ?? "",
      attendance_status: statusByRegistration.get(row.id) ?? null,
    }),
  );
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

  const { error } = await db.from("attendance").upsert(
    {
      registration_id: input.registrationId,
      session_id: input.sessionId,
      status: input.status,
      marked_by: input.markedBy,
      marked_at: now,
    },
    { onConflict: "registration_id,session_id" },
  );
  throwIfSupabaseError(error, "Could not mark attendance");
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
