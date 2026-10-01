import { bookingsCsv, canOwe, HEALTH_FIELDS, owingCents, PURGED_HEALTH_COLUMNS, REVEAL_REASON_MAX, REVEAL_REASON_MIN, REVEALS_PER_HOUR, weeklyDueCents, type AdminBooking, type BookingKind, type HeldSession } from "@/lib/adminBookings";
import { nassauToday } from "@/lib/futprepTerms";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Admin -> Bookings, registrations and leads across every business
// (brief 08, 1.6). Platform staff only: every caller is behind
// requireAdmin / requireAdminApi.
//
// The rule this file exists to keep: a child's medical, allergy,
// medication, special-needs and emergency details are never selected by a
// list or an export. Each query names its columns, and the only function
// that reads the hidden ones is revealRegistrationHealth(), which writes
// the audit log first and needs a reason.

const WEDDINGS_SLUG = "bahamas-weddings";
const PAGE = 1000;
// A ceiling on one export or one screen's worth of sums, far above today's
// numbers, so a runaway loop can't read the whole database.
const MAX_ROWS = 20_000;
const IN_CHUNK = 150;

type Row = Record<string, unknown>;
type Ranged = PromiseLike<{ data: unknown; error: { message?: string; details?: string; hint?: string; code?: string } | null }>;

// PostgREST returns at most 1,000 rows a request: read in pages.
async function readAll(build: (from: number, to: number) => Ranged, max: number, label: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; rows.length < max; from += PAGE) {
    const to = Math.min(from + PAGE, max) - 1;
    const { data, error } = await build(from, to);
    throwIfSupabaseError(error, label);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  return rows;
}

// Money received against a set of bookings, by the payments column that
// points at them. Voided and refunded payments don't count.
async function receivedBy(column: "registration_id" | "private_session_request_id", ids: number[]): Promise<Map<number, number>> {
  const paid = new Map<number, number>();
  const db = getSupabaseAdmin();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const rows = await readAll((from, to) => db.from("payments").select(`id,${column},amount_cents`).eq("status", "received").in(column, chunk).order("id", { ascending: true }).range(from, to), MAX_ROWS, "Could not load payments");
    for (const row of rows) paid.set(Number(row[column]), (paid.get(Number(row[column])) ?? 0) + Number(row.amount_cents));
  }
  return paid;
}

async function namesOf(table: "organizations" | "drops", column: "name" | "title"): Promise<Map<number, string>> {
  const db = getSupabaseAdmin();
  const rows = await readAll((from, to) => db.from(table).select(`id,${column}`).order("id", { ascending: true }).range(from, to), MAX_ROWS, `Could not load ${table}`);
  return new Map(rows.map((row) => [Number(row.id), String(row[column] ?? "")]));
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const textOrNull = (value: unknown): string | null => text(value) || null;

// ---- What a registration costs so far ----------------------------------------------

// The columns a registration's "due" is worked out from. None is a health
// or emergency field.
const REGISTRATION_MONEY_COLUMNS = "id,program_id,term_id,registration_status,payment_status,payment_frequency,amount_due_cents,submitted_at,created_at";

type RegistrationDue = { dueCents: number; weekly: boolean; programName: string };

// A term payer owes the term fee. A weekly payer in a class owes one
// week's fee for each session held since they joined, so the stored
// amount (one week) is multiplied out, as the business's own report does.
// A registration that can't owe (cancelled, waitlisted, waived) owes 0.
async function registrationDues(rows: Row[]): Promise<Map<number, RegistrationDue>> {
  const dues = new Map<number, RegistrationDue>();
  if (!rows.length) return dues;
  const db = getSupabaseAdmin();
  const programRows = await readAll((from, to) => db.from("programs").select("id,name,program_type").order("id", { ascending: true }).range(from, to), MAX_ROWS, "Could not load programmes");
  const programs = new Map(programRows.map((p) => [Number(p.id), { name: String(p.name ?? ""), isClass: p.program_type === "term" }]));
  const isWeekly = (row: Row) => row.payment_frequency === "weekly" && Boolean(programs.get(Number(row.program_id))?.isClass) && row.term_id !== null && row.term_id !== undefined;

  const termIds = Array.from(new Set(rows.filter(isWeekly).map((row) => Number(row.term_id))));
  const sessions: HeldSession[] = [];
  for (let i = 0; i < termIds.length; i += IN_CHUNK) {
    const chunk = termIds.slice(i, i + IN_CHUNK);
    const { data: terms, error: termError } = await db.from("program_terms").select("id,start_date").in("id", chunk);
    throwIfSupabaseError(termError, "Could not load terms");
    const startOf = new Map((terms ?? []).map((t) => [Number(t.id), String(t.start_date)]));
    const sessionRows = await readAll((from, to) => db.from("sessions").select("id,program_id,term_id,session_date,status").in("term_id", chunk).order("id", { ascending: true }).range(from, to), MAX_ROWS, "Could not load sessions");
    for (const s of sessionRows) {
      const date = String(s.session_date);
      // A session dated before its term starts is the free taster.
      if (date >= (startOf.get(Number(s.term_id)) ?? date)) sessions.push({ programId: Number(s.program_id), termId: Number(s.term_id), date, status: String(s.status) });
    }
  }

  const today = nassauToday();
  for (const row of rows) {
    const stored = Number(row.amount_due_cents ?? 0);
    const weekly = isWeekly(row);
    const owes = canOwe(text(row.registration_status), textOrNull(row.payment_status));
    const dueCents = !owes ? 0 : weekly ? weeklyDueCents(stored, { programId: Number(row.program_id), termId: Number(row.term_id), joinedOn: nassauToday(new Date(String(row.submitted_at ?? row.created_at))) }, sessions, today) : stored;
    dues.set(Number(row.id), { dueCents, weekly, programName: programs.get(Number(row.program_id))?.name ?? "" });
  }
  return dues;
}

// ---- The list ---------------------------------------------------------------------

export type BookingFilter = {
  organizationId?: number | null;
  kind?: BookingKind | null;
  // Only bookings that still owe money.
  owing?: boolean;
  // Rows to return. The screen shows the newest; an export reads them all.
  limit?: number;
};

export const BOOKINGS_ON_SCREEN = 200;

export async function listAdminBookings(filter: BookingFilter = {}): Promise<AdminBooking[]> {
  const db = getSupabaseAdmin();
  const limit = Math.min(filter.limit ?? BOOKINGS_ON_SCREEN, MAX_ROWS);
  // "Still owing" is worked out here, not in the database, so every row is
  // read before the filter: the unpaid bookings are often the old ones.
  const read = filter.owing ? MAX_ROWS : limit;
  const orgId = filter.organizationId ?? null;
  const wants = (kind: BookingKind) => !filter.kind || filter.kind === kind;
  const orgNames = await namesOf("organizations", "name");
  const orgName = (id: number | null) => (id === null ? "" : orgNames.get(id) ?? `Business ${id}`);
  const bookings: AdminBooking[] = [];

  if (wants("registration")) {
    const rows = await readAll((from, to) => {
      let query = db.from("registrations").select(`${REGISTRATION_MONEY_COLUMNS},reference_code,organization_id,parent_name,parent_email,parent_phone,child_name`).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (orgId) query = query.eq("organization_id", orgId);
      return query.range(from, to);
    }, read, "Could not load registrations");
    const [dues, paid] = await Promise.all([registrationDues(rows), receivedBy("registration_id", rows.map((row) => Number(row.id)))]);
    for (const row of rows) {
      const organizationId = Number(row.organization_id);
      const due = dues.get(Number(row.id));
      bookings.push({
        kind: "registration", id: Number(row.id), reference: textOrNull(row.reference_code), organizationId, organizationName: orgName(organizationId),
        customer: text(row.parent_name) || "Entered by staff", detail: [text(row.child_name), due?.programName ?? "", due?.weekly ? "pays weekly" : ""].filter(Boolean).join(" · "),
        createdAt: String(row.created_at), status: text(row.registration_status), paymentStatus: textOrNull(row.payment_status),
        dueCents: due?.dueCents ?? 0, paidCents: paid.get(Number(row.id)) ?? 0, email: textOrNull(row.parent_email), phone: textOrNull(row.parent_phone),
      });
    }
  }

  if (wants("private_session")) {
    const rows = await readAll((from, to) => {
      let query = db.from("private_session_requests").select("id,reference_code,organization_id,parent_name,parent_email,parent_phone,child_name,requested_date,status,payment_status,price_cents,created_at").order("created_at", { ascending: false }).order("id", { ascending: false });
      if (orgId) query = query.eq("organization_id", orgId);
      return query.range(from, to);
    }, read, "Could not load private session requests");
    const paid = await receivedBy("private_session_request_id", rows.map((row) => Number(row.id)));
    for (const row of rows) {
      const organizationId = Number(row.organization_id);
      // A request owes its price only once a coach has accepted it.
      const payable = (row.status === "accepted" || row.status === "completed") && canOwe(text(row.status), textOrNull(row.payment_status));
      bookings.push({
        kind: "private_session", id: Number(row.id), reference: textOrNull(row.reference_code), organizationId, organizationName: orgName(organizationId),
        customer: text(row.parent_name), detail: [text(row.child_name), text(row.requested_date)].filter(Boolean).join(" · "),
        createdAt: String(row.created_at), status: text(row.status), paymentStatus: textOrNull(row.payment_status),
        dueCents: row.price_cents === null || row.price_cents === undefined ? null : payable ? Number(row.price_cents) : 0, paidCents: paid.get(Number(row.id)) ?? 0, email: textOrNull(row.parent_email), phone: textOrNull(row.parent_phone),
      });
    }
  }

  if (wants("wedding_lead")) {
    // Wedding leads belong to the one wedding business; they carry no
    // organization of their own.
    const { data: weddings, error } = await db.from("organizations").select("id").eq("slug", WEDDINGS_SLUG).maybeSingle();
    throwIfSupabaseError(error, "Could not load the wedding business");
    const weddingsId = weddings ? Number(weddings.id) : null;
    if (!orgId || orgId === weddingsId) {
      const rows = await readAll((from, to) => db.from("wedding_leads").select("id,names,email,phone,status,preferred_wedding_date,created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), read, "Could not load wedding leads");
      for (const row of rows) {
        bookings.push({
          kind: "wedding_lead", id: Number(row.id), reference: null, organizationId: weddingsId, organizationName: orgName(weddingsId) || "Weddings",
          customer: text(row.names), detail: row.preferred_wedding_date ? `Wedding on ${text(row.preferred_wedding_date)}` : "Date not chosen",
          createdAt: String(row.created_at), status: text(row.status), paymentStatus: null, dueCents: null, paidCents: null, email: textOrNull(row.email), phone: textOrNull(row.phone),
        });
      }
    }
  }

  if (wants("shop_order")) {
    const rows = await readAll((from, to) => {
      let query = db.from("reservations").select("id,reference_code,organization_id,drop_id,buyer_name,buyer_phone,buyer_email,total_cents,payment_status,status,created_at").order("created_at", { ascending: false }).order("id", { ascending: false });
      if (orgId) query = query.eq("organization_id", orgId);
      return query.range(from, to);
    }, read, "Could not load shop orders");
    const drops = rows.length ? await namesOf("drops", "title") : new Map<number, string>();
    for (const row of rows) {
      const organizationId = Number(row.organization_id);
      const total = Number(row.total_cents ?? 0);
      bookings.push({
        kind: "shop_order", id: Number(row.id), reference: textOrNull(row.reference_code), organizationId, organizationName: orgName(organizationId),
        customer: text(row.buyer_name), detail: drops.get(Number(row.drop_id)) ?? "",
        createdAt: String(row.created_at), status: text(row.status), paymentStatus: textOrNull(row.payment_status),
        // A cancelled, released or refunded order owes nothing.
        dueCents: canOwe(text(row.status), textOrNull(row.payment_status)) ? total : 0, paidCents: row.payment_status === "paid" ? total : 0, email: textOrNull(row.buyer_email), phone: textOrNull(row.buyer_phone),
      });
    }
  }

  const listed = filter.owing ? bookings.filter((booking) => owingCents(booking) > 0) : bookings;
  return listed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id)).slice(0, limit);
}

// One business's bookings as a spreadsheet: no medical, allergy,
// medication, special-needs or emergency column exists in it. Logged.
export async function exportBookings(organizationId: number, actorUserId: string): Promise<{ csv: string; rows: number }> {
  const bookings = await listAdminBookings({ organizationId, limit: MAX_ROWS });
  await logAudit({ actorUserId, organizationId, action: "bookings.exported", targetTable: "organizations", targetId: organizationId, after: { rows: bookings.length } });
  return { csv: bookingsCsv(bookings), rows: bookings.length };
}

// ---- One registration, and the reveal ----------------------------------------------

export type AdminRegistration = {
  id: number;
  reference: string;
  organizationId: number;
  organizationName: string;
  programName: string;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  relationship: string | null;
  childName: string;
  childDob: string | null;
  registrationStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  paysWeekly: boolean;
  dueCents: number;
  paidCents: number;
  photoConsent: string | null;
  enteredByStaff: string | null;
  createdAt: string;
  // Set once the health details were deleted after the programme ended.
  healthPurgedAt: string | null;
};

export async function getAdminRegistration(id: number): Promise<AdminRegistration | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("registrations").select(`${REGISTRATION_MONEY_COLUMNS},reference_code,organization_id,parent_name,parent_email,parent_phone,relationship,child_name,child_dob,payment_method,photo_consent,entered_by_staff,health_purged_at`).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the registration");
  if (!data) return null;
  const row = data as unknown as Row;
  const [{ data: org, error: orgError }, dues, paid] = await Promise.all([db.from("organizations").select("name").eq("id", Number(row.organization_id)).maybeSingle(), registrationDues([row]), receivedBy("registration_id", [Number(row.id)])]);
  throwIfSupabaseError(orgError, "Could not load the business");
  const due = dues.get(Number(row.id));
  return {
    id: Number(row.id), reference: String(row.reference_code), organizationId: Number(row.organization_id), organizationName: org ? String(org.name) : "", programName: due?.programName ?? "",
    parentName: textOrNull(row.parent_name), parentEmail: textOrNull(row.parent_email), parentPhone: textOrNull(row.parent_phone), relationship: textOrNull(row.relationship),
    childName: String(row.child_name), childDob: (row.child_dob as string | null) ?? null, registrationStatus: String(row.registration_status), paymentStatus: String(row.payment_status), paymentMethod: textOrNull(row.payment_method),
    paysWeekly: Boolean(due?.weekly), dueCents: due?.dueCents ?? 0, paidCents: paid.get(Number(row.id)) ?? 0, photoConsent: textOrNull(row.photo_consent), enteredByStaff: textOrNull(row.entered_by_staff),
    createdAt: String(row.created_at), healthPurgedAt: (row.health_purged_at as string | null) ?? null,
  };
}

export type RevealedHealth = { purgedAt: string | null; fields: Array<{ label: string; value: string; deleted: boolean }> };

// The one place the hidden fields are read. The audit log is written
// before the read, and a failed log write stops the reveal: nobody sees a
// child's health details without a record of who, when and why. The log
// holds the reason, never the details themselves. A person may reveal ten
// registrations an hour, counted from the log itself so the limit holds
// across every server.
export async function revealRegistrationHealth(id: number, reason: string, actorUserId: string): Promise<RevealedHealth> {
  const why = reason.replace(/\s+/g, " ").trim();
  if (why.length < REVEAL_REASON_MIN) throw new Error("REASON_REQUIRED");
  const db = getSupabaseAdmin();
  const { data: found, error: findError } = await db.from("registrations").select("id,organization_id").eq("id", id).maybeSingle();
  throwIfSupabaseError(findError, "Could not load the registration");
  if (!found) throw new Error("NOT_FOUND");

  const { count, error: countError } = await db.from("audit_log").select("id", { count: "exact", head: true }).eq("actor_user_id", actorUserId).eq("action", "registration.health_revealed").gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
  throwIfSupabaseError(countError, "Could not check the reveal limit");
  if ((count ?? 0) >= REVEALS_PER_HOUR) throw new Error("RATE_LIMITED");

  await logAudit({ actorUserId, organizationId: Number(found.organization_id), action: "registration.health_revealed", targetTable: "registrations", targetId: id, after: { reason: why.slice(0, REVEAL_REASON_MAX), shown: "health_and_emergency" } });

  const { data, error } = await db.from("registrations").select(`health_purged_at,${HEALTH_FIELDS.map((field) => field.column).join(",")}`).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the registration");
  if (!data) throw new Error("NOT_FOUND");
  const row = data as unknown as Row;
  const purgedAt = (row.health_purged_at as string | null) ?? null;
  return { purgedAt, fields: HEALTH_FIELDS.map((field) => ({ label: field.label, value: text(row[field.column]), deleted: Boolean(purgedAt) && PURGED_HEALTH_COLUMNS.includes(field.column) && !text(row[field.column]) })) };
}
