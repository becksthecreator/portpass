import { env } from "cloudflare:workers";
import {
  CONSENT_VERSION,
  FUTPREP_PROGRAMS,
  FUTPREP_TERM,
  type FutprepProgramSlug,
} from "@/app/futprep/lil-kickers/config";

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

async function ensureSchema() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      main_location TEXT NOT NULL,
      player_count TEXT NOT NULL,
      help_needed TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      primary_contact TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      main_location TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      age_min INTEGER NOT NULL,
      age_max INTEGER NOT NULL,
      coed INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS program_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      break_dates TEXT NOT NULL,
      weekly_fee_cents INTEGER NOT NULL,
      term_fee_cents INTEGER NOT NULL,
      registration_fee_cents INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (program_id) REFERENCES programs(id),
      UNIQUE(program_id, name)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      map_label TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      UNIQUE(organization_id, name)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT,
      responsibilities TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      UNIQUE(organization_id, name, role)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL,
      FOREIGN KEY (program_id) REFERENCES programs(id),
      FOREIGN KEY (term_id) REFERENCES program_terms(id),
      UNIQUE(program_id, term_id, session_date)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_code TEXT NOT NULL UNIQUE,
      organization_id INTEGER,
      program_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      parent_name TEXT NOT NULL,
      parent_email TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      relationship TEXT NOT NULL,
      child_name TEXT NOT NULL,
      child_dob TEXT NOT NULL,
      gender TEXT NOT NULL,
      emergency_contact_name TEXT NOT NULL,
      emergency_contact_phone TEXT NOT NULL,
      allergies TEXT NOT NULL DEFAULT '',
      medical_conditions TEXT NOT NULL DEFAULT '',
      medications TEXT NOT NULL DEFAULT '',
      special_needs TEXT NOT NULL DEFAULT '',
      authorized_pickup TEXT NOT NULL,
      additional_notes TEXT NOT NULL DEFAULT '',
      photo_consent TEXT NOT NULL,
      payment_frequency TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount_due_cents INTEGER NOT NULL,
      registration_status TEXT NOT NULL DEFAULT 'pending',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      consent_version TEXT NOT NULL,
      consent_accepted INTEGER NOT NULL,
      consent_at TEXT NOT NULL,
      signature_name TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (program_id) REFERENCES programs(id),
      FOREIGN KEY (term_id) REFERENCES program_terms(id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      recorded_by TEXT,
      note TEXT NOT NULL DEFAULT '',
      received_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (registration_id) REFERENCES registrations(id)
    )`),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS registrations_program_term_idx ON registrations (program_id, term_id)"
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS registrations_parent_email_idx ON registrations (parent_email)"
    ),
  ]);

  await seedFutprepPilot();
}

async function seedFutprepPilot() {
  const now = new Date().toISOString();

  const organization = await env.DB.prepare(
    `SELECT id FROM organizations
     WHERE lower(name) LIKE '%futprep%' OR lower(name) LIKE '%footprep%'
     ORDER BY id ASC LIMIT 1`
  ).first<{ id: number }>();

  if (organization?.id) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO locations (
        organization_id, name, address, map_label, active, created_at
      ) VALUES (?, ?, ?, ?, 1, ?)`
    )
      .bind(
        organization.id,
        FUTPREP_TERM.location,
        "Lyford Cay Lower Campus, New Providence, The Bahamas",
        "Lyford Cay Lower Campus Soccer Field",
        now
      )
      .run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO staff_members (
        organization_id, name, role, email, responsibilities, active, created_at
      ) VALUES (?, 'Coach Bex', 'coach', NULL, ?, 1, ?)`
    )
      .bind(
        organization.id,
        "Runs Lil Kickers and Rookies; roster, attendance, and in-person cash collection.",
        now
      )
      .run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO staff_members (
        organization_id, name, role, email, responsibilities, active, created_at
      ) VALUES (?, 'Kiki', 'admin_registrar', NULL, ?, 1, ?)`
    )
      .bind(
        organization.id,
        "Registration administration, bank-transfer verification, and payment tracking.",
        now
      )
      .run();
  }

  for (const program of FUTPREP_PROGRAMS) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO programs (
        organization_id, slug, name, age_min, age_max, coed, location,
        day_of_week, start_time, capacity, active, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, ?)`
    )
      .bind(
        organization?.id ?? null,
        program.slug,
        program.name,
        program.ageMin,
        program.ageMax,
        FUTPREP_TERM.location,
        program.day,
        program.time,
        program.capacity,
        now
      )
      .run();

    if (organization?.id) {
      await env.DB.prepare(
        "UPDATE programs SET organization_id = ? WHERE slug = ? AND organization_id IS NULL"
      ).bind(organization.id, program.slug).run();
    }

    const storedProgram = await env.DB.prepare(
      "SELECT id FROM programs WHERE slug = ?"
    ).bind(program.slug).first<{ id: number }>();

    if (!storedProgram) continue;

    await env.DB.prepare(
      `INSERT OR IGNORE INTO program_terms (
        program_id, name, start_date, end_date, break_dates,
        weekly_fee_cents, term_fee_cents, registration_fee_cents, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`
    )
      .bind(
        storedProgram.id,
        FUTPREP_TERM.name,
        FUTPREP_TERM.startDate,
        FUTPREP_TERM.endDate,
        JSON.stringify(FUTPREP_TERM.breakDates),
        program.weeklyFeeCents,
        program.termFeeCents,
        now
      )
      .run();

    const term = await env.DB.prepare(
      "SELECT id FROM program_terms WHERE program_id = ? AND name = ?"
    )
      .bind(storedProgram.id, FUTPREP_TERM.name)
      .first<{ id: number }>();

    if (term) {
      const breaks = new Set<string>(FUTPREP_TERM.breakDates);
      const cursor = new Date(`${FUTPREP_TERM.startDate}T12:00:00Z`);
      const end = new Date(`${FUTPREP_TERM.endDate}T12:00:00Z`);
      const sessionStatements = [];

      while (cursor <= end) {
        const sessionDate = cursor.toISOString().slice(0, 10);
        if (!breaks.has(sessionDate)) {
          sessionStatements.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO sessions (
                program_id, term_id, session_date, start_time, location, status, created_at
              ) VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`
            ).bind(
              storedProgram.id,
              term.id,
              sessionDate,
              program.time,
              FUTPREP_TERM.location,
              now
            )
          );
        }
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }

      if (sessionStatements.length) {
        await env.DB.batch(sessionStatements);
      }
    }
  }
}

export async function ensureFutprepPilotSchema() {
  await ensureSchema();
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
  await ensureSchema();

  const output: FutprepAvailability[] = [];
  for (const program of FUTPREP_PROGRAMS) {
    const row = await env.DB.prepare(
      `SELECT
         p.id AS program_id,
         pt.id AS term_id,
         COUNT(r.id) AS registered
       FROM programs p
       JOIN program_terms pt ON pt.program_id = p.id AND pt.name = ?
       LEFT JOIN registrations r
         ON r.program_id = p.id
        AND r.term_id = pt.id
        AND r.registration_status IN ('pending', 'confirmed')
       WHERE p.slug = ?
       GROUP BY p.id, pt.id`
    )
      .bind(FUTPREP_TERM.name, program.slug)
      .first<{ program_id: number; term_id: number; registered: number }>();

    const registered = Number(row?.registered ?? 0);
    output.push({
      slug: program.slug,
      name: program.name,
      capacity: program.capacity,
      registered,
      spotsRemaining: Math.max(0, program.capacity - registered),
    });
  }

  return output;
}

export async function createFutprepRegistration(input: FutprepRegistrationInput) {
  await ensureSchema();

  const configuredProgram = FUTPREP_PROGRAMS.find(
    (program) => program.slug === input.programSlug
  );
  if (!configuredProgram) throw new Error("INVALID_PROGRAM");

  const age = ageOnDate(input.childDob, FUTPREP_TERM.startDate);
  if (age < configuredProgram.ageMin || age > configuredProgram.ageMax) {
    throw new Error("AGE_MISMATCH");
  }

  const program = await env.DB.prepare(
    `SELECT
       p.id,
       p.organization_id,
       p.capacity,
       pt.id AS term_id,
       pt.weekly_fee_cents,
       pt.term_fee_cents
     FROM programs p
     JOIN program_terms pt ON pt.program_id = p.id
     WHERE p.slug = ? AND pt.name = ? AND p.active = 1 AND pt.active = 1
     LIMIT 1`
  )
    .bind(input.programSlug, FUTPREP_TERM.name)
    .first<{
      id: number;
      organization_id: number | null;
      capacity: number;
      term_id: number;
      weekly_fee_cents: number;
      term_fee_cents: number;
    }>();

  if (!program) throw new Error("PROGRAM_NOT_AVAILABLE");

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM registrations
     WHERE program_id = ? AND term_id = ?
       AND registration_status IN ('pending', 'confirmed')`
  )
    .bind(program.id, program.term_id)
    .first<{ count: number }>();

  if (Number(count?.count ?? 0) >= program.capacity) {
    throw new Error("PROGRAM_FULL");
  }

  const existing = await env.DB.prepare(
    `SELECT reference_code
     FROM registrations
     WHERE term_id = ?
       AND lower(parent_email) = lower(?)
       AND lower(child_name) = lower(?)
       AND child_dob = ?
       AND registration_status IN ('pending', 'confirmed')
     LIMIT 1`
  )
    .bind(
      program.term_id,
      input.parentEmail,
      input.childName,
      input.childDob
    )
    .first<{ reference_code: string }>();

  if (existing) {
    throw new Error(`DUPLICATE:${existing.reference_code}`);
  }

  const amountDueCents =
    input.paymentFrequency === "term"
      ? program.term_fee_cents
      : program.weekly_fee_cents;

  const now = new Date().toISOString();
  const referenceCode = `FP-${new Date().getUTCFullYear()}-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase()}`;

  await env.DB.prepare(
    `INSERT INTO registrations (
      reference_code, organization_id, program_id, term_id,
      parent_name, parent_email, parent_phone, relationship,
      child_name, child_dob, gender,
      emergency_contact_name, emergency_contact_phone,
      allergies, medical_conditions, medications, special_needs,
      authorized_pickup, additional_notes, photo_consent,
      payment_frequency, payment_method, amount_due_cents,
      registration_status, payment_status,
      consent_version, consent_accepted, consent_at, signature_name, submitted_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      'pending', 'pending',
      ?, 1, ?, ?, ?
    )`
  )
    .bind(
      referenceCode,
      program.organization_id,
      program.id,
      program.term_id,
      input.parentName,
      input.parentEmail,
      input.parentPhone,
      input.relationship,
      input.childName,
      input.childDob,
      input.gender,
      input.emergencyContactName,
      input.emergencyContactPhone,
      input.allergies,
      input.medicalConditions,
      input.medications,
      input.specialNeeds,
      input.authorizedPickup,
      input.additionalNotes,
      input.photoConsent,
      input.paymentFrequency,
      input.paymentMethod,
      amountDueCents,
      CONSENT_VERSION,
      now,
      input.signatureName,
      now
    )
    .run();

  return {
    referenceCode,
    program: configuredProgram,
    term: FUTPREP_TERM,
    amountDueCents,
    paymentStatus: "pending" as const,
    registrationStatus: "pending" as const,
  };
}
