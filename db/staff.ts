import { env } from "cloudflare:workers";
import { ensureFutprepPilotSchema } from "./registrations";

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
  allergies: string;
  medical_conditions: string;
  medications: string;
  special_needs: string;
  authorized_pickup: string;
  additional_notes: string;
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
  allergies: string;
  medical_conditions: string;
  medications: string;
  special_needs: string;
  attendance_status: string | null;
};

async function ensureStaffSchema() {
  await ensureFutprepPilotSchema();
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      marked_by TEXT,
      marked_at TEXT NOT NULL,
      FOREIGN KEY (registration_id) REFERENCES registrations(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(registration_id, session_id)
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS attendance_session_idx ON attendance (session_id)"),
  ]);
}

export async function listFutprepStaffRegistrations(): Promise<StaffRegistration[]> {
  await ensureStaffSchema();
  const result = await env.DB.prepare(`SELECT
      r.id, r.reference_code,
      p.name AS program_name, p.slug AS program_slug,
      r.child_name, r.child_dob, r.gender,
      r.parent_name, r.parent_email, r.parent_phone,
      r.emergency_contact_name, r.emergency_contact_phone,
      r.allergies, r.medical_conditions, r.medications, r.special_needs,
      r.authorized_pickup, r.additional_notes, r.photo_consent,
      r.payment_frequency, r.payment_method, r.amount_due_cents,
      r.registration_status, r.payment_status, r.submitted_at,
      COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay
        WHERE pay.registration_id = r.id AND pay.status = 'received'), 0) AS paid_cents
    FROM registrations r
    JOIN programs p ON p.id = r.program_id
    WHERE p.slug IN ('lil-kickers','rookies')
      AND r.registration_status != 'cancelled'
    ORDER BY p.start_time ASC, r.child_name COLLATE NOCASE ASC`)
    .all<StaffRegistration>();
  return result.results;
}

export async function listFutprepStaffSessions(): Promise<StaffSession[]> {
  await ensureStaffSchema();
  const result = await env.DB.prepare(`SELECT
      s.id, s.program_id, p.name AS program_name, p.slug AS program_slug,
      s.session_date, s.start_time, s.location, s.status
    FROM sessions s
    JOIN programs p ON p.id = s.program_id
    WHERE p.slug IN ('lil-kickers','rookies')
    ORDER BY s.session_date ASC, s.start_time ASC`)
    .all<StaffSession>();
  return result.results;
}

export async function recordFutprepPayment(input: {
  registrationId: number;
  amountCents: number;
  method: "cash" | "bank_transfer";
  recordedBy: string;
  note?: string;
}) {
  await ensureStaffSchema();
  const registration = await env.DB.prepare(
    "SELECT id, amount_due_cents, payment_frequency FROM registrations WHERE id = ?"
  ).bind(input.registrationId).first<{ id:number; amount_due_cents:number; payment_frequency:string }>();
  if (!registration) throw new Error("REGISTRATION_NOT_FOUND");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("INVALID_AMOUNT");

  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO payments (
      registration_id, amount_cents, method, status, recorded_by, note, received_at, created_at
    ) VALUES (?, ?, ?, 'received', ?, ?, ?, ?)`)
    .bind(input.registrationId, input.amountCents, input.method, input.recordedBy, input.note ?? "", now, now)
    .run();

  const totals = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS total FROM payments WHERE registration_id = ? AND status = 'received'"
  ).bind(input.registrationId).first<{total:number}>();

  const paid = Number(totals?.total ?? 0);
  const nextStatus =
    registration.payment_frequency === "weekly"
      ? (paid > 0 ? "paid" : "pending")
      : paid >= registration.amount_due_cents
        ? "paid"
        : paid > 0
          ? "partial"
          : "pending";

  await env.DB.prepare("UPDATE registrations SET payment_status = ? WHERE id = ?")
    .bind(nextStatus, input.registrationId).run();

  return { paidCents: paid, paymentStatus: nextStatus };
}

export async function updateFutprepRegistration(input: {
  registrationId: number;
  registrationStatus?: "pending" | "confirmed" | "cancelled";
  paymentStatus?: "pending" | "partial" | "paid" | "overdue" | "waived";
}) {
  await ensureStaffSchema();
  const current = await env.DB.prepare("SELECT id FROM registrations WHERE id = ?")
    .bind(input.registrationId).first<{id:number}>();
  if (!current) throw new Error("REGISTRATION_NOT_FOUND");

  if (input.registrationStatus) {
    await env.DB.prepare("UPDATE registrations SET registration_status = ? WHERE id = ?")
      .bind(input.registrationStatus, input.registrationId).run();
  }
  if (input.paymentStatus) {
    await env.DB.prepare("UPDATE registrations SET payment_status = ? WHERE id = ?")
      .bind(input.paymentStatus, input.registrationId).run();
  }
}

export async function rosterForSession(sessionId: number): Promise<AttendanceRow[]> {
  await ensureStaffSchema();
  const session = await env.DB.prepare("SELECT program_id FROM sessions WHERE id = ?")
    .bind(sessionId).first<{program_id:number}>();
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const result = await env.DB.prepare(`SELECT
      r.id AS registration_id, r.child_name, r.parent_name, r.parent_phone,
      r.allergies, r.medical_conditions, r.medications, r.special_needs,
      a.status AS attendance_status
    FROM registrations r
    LEFT JOIN attendance a ON a.registration_id = r.id AND a.session_id = ?
    WHERE r.program_id = ?
      AND r.registration_status IN ('pending','confirmed')
    ORDER BY r.child_name COLLATE NOCASE ASC`)
    .bind(sessionId, session.program_id)
    .all<AttendanceRow>();
  return result.results;
}

export async function markFutprepAttendance(input: {
  sessionId: number;
  registrationId: number;
  status: "present" | "absent" | "excused";
  markedBy: string;
}) {
  await ensureStaffSchema();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO attendance (
      registration_id, session_id, status, marked_by, marked_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(registration_id, session_id)
    DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by, marked_at=excluded.marked_at`)
    .bind(input.registrationId, input.sessionId, input.status, input.markedBy, now)
    .run();
}
