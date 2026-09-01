import { env } from "cloudflare:workers";
import { ensureFutprepPilotSchema } from "./registrations";

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
  await ensureFutprepPilotSchema();
  return env.DB.prepare("SELECT * FROM organizations WHERE id = ?")
    .bind(id)
    .first<OrganizationRecord>();
}

export async function getOrganizationStats(id: number): Promise<OrganizationStats> {
  await ensureFutprepPilotSchema();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [players, programs, sessions, payments, newRegistrations] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM registrations
       WHERE organization_id = ? AND registration_status != 'cancelled'`
    ).bind(id).first<{ count: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM programs WHERE organization_id = ? AND active = 1"
    ).bind(id).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM sessions s
       JOIN programs p ON p.id = s.program_id
       WHERE p.organization_id = ? AND s.session_date >= ? AND s.status = 'scheduled'`
    ).bind(id, today).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM registrations
       WHERE organization_id = ?
         AND payment_status IN ('pending', 'partial', 'overdue')
         AND registration_status != 'cancelled'`
    ).bind(id).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM registrations
       WHERE organization_id = ? AND submitted_at >= ?`
    ).bind(id, weekAgo).first<{ count: number }>(),
  ]);

  return {
    totalPlayers: Number(players?.count ?? 0),
    activePrograms: Number(programs?.count ?? 0),
    upcomingSessions: Number(sessions?.count ?? 0),
    pendingPayments: Number(payments?.count ?? 0),
    newRegistrations: Number(newRegistrations?.count ?? 0),
  };
}

export async function listOrganizationPrograms(id: number): Promise<ProgramSummary[]> {
  await ensureFutprepPilotSchema();
  const result = await env.DB.prepare(
    `SELECT
       p.id, p.slug, p.name, p.age_min, p.age_max, p.location,
       p.day_of_week, p.start_time, p.capacity,
       pt.name AS term_name, pt.start_date, pt.end_date,
       pt.weekly_fee_cents, pt.term_fee_cents,
       COUNT(r.id) AS registrations
     FROM programs p
     LEFT JOIN program_terms pt ON pt.program_id = p.id AND pt.active = 1
     LEFT JOIN registrations r
       ON r.program_id = p.id
      AND r.term_id = pt.id
      AND r.registration_status != 'cancelled'
     WHERE p.organization_id = ? AND p.active = 1
     GROUP BY p.id, pt.id
     ORDER BY p.start_time ASC`
  ).bind(id).all<ProgramSummary>();
  return result.results;
}

export async function listOrganizationStaff(id: number): Promise<StaffSummary[]> {
  await ensureFutprepPilotSchema();
  const result = await env.DB.prepare(
    `SELECT id, name, role, email, responsibilities
     FROM staff_members
     WHERE organization_id = ? AND active = 1
     ORDER BY CASE role WHEN 'admin_registrar' THEN 1 WHEN 'coach' THEN 2 ELSE 3 END, name`
  ).bind(id).all<StaffSummary>();
  return result.results;
}

export async function listOrganizationLocations(id: number): Promise<LocationSummary[]> {
  await ensureFutprepPilotSchema();
  const result = await env.DB.prepare(
    `SELECT id, name, address, map_label
     FROM locations
     WHERE organization_id = ? AND active = 1
     ORDER BY name`
  ).bind(id).all<LocationSummary>();
  return result.results;
}

export async function listUpcomingSessions(id: number, limit = 12): Promise<SessionSummary[]> {
  await ensureFutprepPilotSchema();
  const today = new Date().toISOString().slice(0, 10);
  const result = await env.DB.prepare(
    `SELECT
       s.id, p.name AS program_name, s.session_date, s.start_time, s.location, s.status
     FROM sessions s
     JOIN programs p ON p.id = s.program_id
     WHERE p.organization_id = ? AND s.session_date >= ?
     ORDER BY s.session_date ASC, s.start_time ASC
     LIMIT ?`
  ).bind(id, today, limit).all<SessionSummary>();
  return result.results;
}

export async function getRegistrationCountsByProgram(id: number): Promise<RegistrationCounts[]> {
  await ensureFutprepPilotSchema();
  const result = await env.DB.prepare(
    `SELECT
       p.name AS program_name,
       p.capacity,
       COUNT(r.id) AS registrations,
       SUM(CASE WHEN r.payment_status IN ('pending','partial','overdue') THEN 1 ELSE 0 END) AS pending_payments,
       SUM(CASE WHEN r.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid
     FROM programs p
     LEFT JOIN registrations r
       ON r.program_id = p.id
      AND r.registration_status != 'cancelled'
     WHERE p.organization_id = ? AND p.active = 1
     GROUP BY p.id
     ORDER BY p.start_time`
  ).bind(id).all<RegistrationCounts>();
  return result.results;
}
