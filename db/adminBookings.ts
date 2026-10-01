import { bookingsCsv, HEALTH_FIELDS, owingCents, REVEAL_REASON_MAX, REVEAL_REASON_MIN, type AdminBooking, type BookingKind } from "@/lib/adminBookings";
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

async function namesOf(table: "organizations" | "programs" | "drops", column: "name" | "title"): Promise<Map<number, string>> {
  const db = getSupabaseAdmin();
  const rows = await readAll((from, to) => db.from(table).select(`id,${column}`).order("id", { ascending: true }).range(from, to), MAX_ROWS, `Could not load ${table}`);
  return new Map(rows.map((row) => [Number(row.id), String(row[column] ?? "")]));
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const textOrNull = (value: unknown): string | null => text(value) || null;
const cents = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export type BookingFilter = {
  organizationId?: number | null;
  kind?: BookingKind | null;
  // Only bookings that still owe money.
  owing?: boolean;
  // Rows per source. The screen shows the newest; an export reads them all.
  limit?: number;
};

export const BOOKINGS_ON_SCREEN = 200;

export async function listAdminBookings(filter: BookingFilter = {}): Promise<AdminBooking[]> {
  const db = getSupabaseAdmin();
  const limit = Math.min(filter.limit ?? BOOKINGS_ON_SCREEN, MAX_ROWS);
  const orgId = filter.organizationId ?? null;
  const wants = (kind: BookingKind) => !filter.kind || filter.kind === kind;
  const orgNames = await namesOf("organizations", "name");
  const orgName = (id: number | null) => (id === null ? "" : orgNames.get(id) ?? `Business ${id}`);
  const bookings: AdminBooking[] = [];

  if (wants("registration")) {
    const rows = await readAll((from, to) => {
      let query = db.from("registrations").select("id,reference_code,organization_id,program_id,parent_name,parent_email,parent_phone,child_name,registration_status,payment_status,amount_due_cents,created_at").order("created_at", { ascending: false }).order("id", { ascending: false });
      if (orgId) query = query.eq("organization_id", orgId);
      return query.range(from, to);
    }, limit, "Could not load registrations");
    const [programs, paid] = await Promise.all([rows.length ? namesOf("programs", "name") : new Map<number, string>(), receivedBy("registration_id", rows.map((row) => Number(row.id)))]);
    for (const row of rows) {
      const organizationId = Number(row.organization_id);
      bookings.push({
        kind: "registration", id: Number(row.id), reference: textOrNull(row.reference_code), organizationId, organizationName: orgName(organizationId),
        customer: text(row.parent_name) || "Entered by staff", detail: [text(row.child_name), programs.get(Number(row.program_id)) ?? ""].filter(Boolean).join(" · "),
        createdAt: String(row.created_at), status: text(row.registration_status), paymentStatus: textOrNull(row.payment_status),
        dueCents: cents(row.amount_due_cents), paidCents: paid.get(Number(row.id)) ?? 0, email: textOrNull(row.parent_email), phone: textOrNull(row.parent_phone),
      });
    }
  }

  if (wants("private_session")) {
    const rows = await readAll((from, to) => {
      let query = db.from("private_session_requests").select("id,reference_code,organization_id,parent_name,parent_email,parent_phone,child_name,request_type,requested_date,status,payment_status,price_cents,created_at").order("created_at", { ascending: false }).order("id", { ascending: false });
      if (orgId) query = query.eq("organization_id", orgId);
      return query.range(from, to);
    }, limit, "Could not load private session requests");
    const paid = await receivedBy("private_session_request_id", rows.map((row) => Number(row.id)));
    for (const row of rows) {
      const organizationId = Number(row.organization_id);
      bookings.push({
        kind: "private_session", id: Number(row.id), reference: textOrNull(row.reference_code), organizationId, organizationName: orgName(organizationId),
        customer: text(row.parent_name), detail: [text(row.child_name), text(row.requested_date)].filter(Boolean).join(" · "),
        createdAt: String(row.created_at), status: text(row.status), paymentStatus: textOrNull(row.payment_status),
        dueCents: cents(row.price_cents), paidCents: paid.get(Number(row.id)) ?? 0, email: textOrNull(row.parent_email), phone: textOrNull(row.parent_phone),
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
      const rows = await readAll((from, to) => db.from("wedding_leads").select("id,names,email,phone,status,preferred_wedding_date,created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), limit, "Could not load wedding leads");
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
    }, limit, "Could not load shop orders");
    const drops = rows.length ? await namesOf("drops", "title") : new Map<number, string>();
    for (const row of rows) {
      const organizationId = Number(row.organization_id);
      const total = Number(row.total_cents ?? 0);
      bookings.push({
        kind: "shop_order", id: Number(row.id), reference: textOrNull(row.reference_code), organizationId, organizationName: orgName(organizationId),
        customer: text(row.buyer_name), detail: drops.get(Number(row.drop_id)) ?? "",
        createdAt: String(row.created_at), status: text(row.status), paymentStatus: textOrNull(row.payment_status),
        // A cancelled or released order owes nothing.
        dueCents: row.status === "active" ? total : 0, paidCents: row.payment_status === "paid" ? total : 0, email: textOrNull(row.buyer_email), phone: textOrNull(row.buyer_phone),
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
  const { data: row, error } = await db.from("registrations").select("id,reference_code,organization_id,program_id,parent_name,parent_email,parent_phone,relationship,child_name,child_dob,registration_status,payment_status,payment_method,amount_due_cents,photo_consent,entered_by_staff,created_at,health_purged_at").eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the registration");
  if (!row) return null;
  const [{ data: org, error: orgError }, { data: program, error: programError }, paid] = await Promise.all([
    db.from("organizations").select("name").eq("id", row.organization_id).maybeSingle(),
    db.from("programs").select("name").eq("id", row.program_id).maybeSingle(),
    receivedBy("registration_id", [Number(row.id)]),
  ]);
  throwIfSupabaseError(orgError, "Could not load the business");
  throwIfSupabaseError(programError, "Could not load the programme");
  return {
    id: Number(row.id), reference: String(row.reference_code), organizationId: Number(row.organization_id), organizationName: org ? String(org.name) : "", programName: program ? String(program.name) : "",
    parentName: textOrNull(row.parent_name), parentEmail: textOrNull(row.parent_email), parentPhone: textOrNull(row.parent_phone), relationship: textOrNull(row.relationship),
    childName: String(row.child_name), childDob: (row.child_dob as string | null) ?? null, registrationStatus: String(row.registration_status), paymentStatus: String(row.payment_status), paymentMethod: textOrNull(row.payment_method),
    dueCents: Number(row.amount_due_cents ?? 0), paidCents: paid.get(Number(row.id)) ?? 0, photoConsent: textOrNull(row.photo_consent), enteredByStaff: textOrNull(row.entered_by_staff),
    createdAt: String(row.created_at), healthPurgedAt: (row.health_purged_at as string | null) ?? null,
  };
}

export type RevealedHealth = { purgedAt: string | null; fields: Array<{ label: string; value: string }> };

// The one place the hidden fields are read. The audit log is written
// before the read, and a failed log write stops the reveal: nobody sees a
// child's health details without a record of who, when and why. The log
// holds the reason and the field names, never the details themselves.
export async function revealRegistrationHealth(id: number, reason: string, actorUserId: string): Promise<RevealedHealth> {
  const why = reason.replace(/\s+/g, " ").trim();
  if (why.length < REVEAL_REASON_MIN) throw new Error("REASON_REQUIRED");
  const db = getSupabaseAdmin();
  const { data: found, error: findError } = await db.from("registrations").select("id,organization_id").eq("id", id).maybeSingle();
  throwIfSupabaseError(findError, "Could not load the registration");
  if (!found) throw new Error("NOT_FOUND");

  await logAudit({ actorUserId, organizationId: Number(found.organization_id), action: "registration.health_revealed", targetTable: "registrations", targetId: id, after: { reason: why.slice(0, REVEAL_REASON_MAX), fields: HEALTH_FIELDS.map((field) => field.column) } });

  const { data, error } = await db.from("registrations").select(`health_purged_at,${HEALTH_FIELDS.map((field) => field.column).join(",")}`).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the registration");
  if (!data) throw new Error("NOT_FOUND");
  const row = data as unknown as Row;
  return { purgedAt: (row.health_purged_at as string | null) ?? null, fields: HEALTH_FIELDS.map((field) => ({ label: field.label, value: text(row[field.column]) })) };
}
