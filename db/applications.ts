import { env } from "cloudflare:workers";

export type ApplicationRecord = {
  id: number;
  organization_name: string;
  contact_person: string;
  email: string;
  phone: string;
  activity_type: string;
  main_location: string;
  player_count: string;
  help_needed: string;
  description: string;
  status: "submitted" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  organization_id?: number | null;
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
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS applications_status_idx ON applications (status)"
    ),
  ]);
}

export async function createApplication(values: Omit<ApplicationRecord, "id" | "status" | "submitted_at" | "reviewed_at">) {
  await ensureSchema();
  const now = new Date().toISOString();
  return env.DB.prepare(
    `INSERT INTO applications (
      organization_name, contact_person, email, phone, activity_type,
      main_location, player_count, help_needed, description, status, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`
  )
    .bind(
      values.organization_name,
      values.contact_person,
      values.email,
      values.phone,
      values.activity_type,
      values.main_location,
      values.player_count,
      values.help_needed,
      values.description,
      now
    )
    .run();
}

export async function listApplications() {
  await ensureSchema();
  const result = await env.DB.prepare(
    `SELECT a.*, o.id AS organization_id
     FROM applications a
     LEFT JOIN organizations o ON o.application_id = a.id
     ORDER BY a.submitted_at DESC`
  ).all<ApplicationRecord>();
  return result.results;
}

export async function reviewApplication(id: number, decision: "approved" | "rejected") {
  await ensureSchema();
  const application = await env.DB.prepare(
    "SELECT * FROM applications WHERE id = ?"
  )
    .bind(id)
    .first<ApplicationRecord>();

  if (!application) return { found: false };
  if (application.status !== "submitted") return { found: true, changed: false };

  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      "UPDATE applications SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'submitted'"
    ).bind(decision, now, id),
  ];

  if (decision === "approved") {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO organizations (
          application_id, name, primary_contact, email, phone,
          activity_type, main_location, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        application.organization_name,
        application.contact_person,
        application.email,
        application.phone,
        application.activity_type,
        application.main_location,
        now
      )
    );
  }

  await env.DB.batch(statements);
  return { found: true, changed: true };
}
