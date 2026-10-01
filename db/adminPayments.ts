import { outstandingFrom, type AdminPayment, type BookingKind, type Outstanding } from "@/lib/adminBookings";
import { listAdminBookings } from "./adminBookings";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Admin -> Payments (brief 08, 1.7): every payment a business recorded
// from its customers (cash, bank transfer, online banking), what is still
// owed to each business, and a month-by-month view to check against bank
// statements. This is customers' money paid to businesses, recorded by
// them: PortPass never holds it. What businesses owe PortPass is Billing.

const PAGE = 1000;
const MAX_ROWS = 20_000;
const IN_CHUNK = 150;

type Row = Record<string, unknown>;

async function byIds(table: string, columns: string, ids: number[], label: string): Promise<Map<number, Row>> {
  const db = getSupabaseAdmin();
  const found = new Map<number, Row>();
  const unique = Array.from(new Set(ids));
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data, error } = await db.from(table).select(columns).in("id", unique.slice(i, i + IN_CHUNK));
    throwIfSupabaseError(error, label);
    for (const row of (data ?? []) as unknown as Row[]) found.set(Number(row.id), row);
  }
  return found;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function listAdminPayments(filter: { organizationId?: number | null } = {}): Promise<AdminPayment[]> {
  const db = getSupabaseAdmin();
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.from("payments").select("id,registration_id,private_session_request_id,event_ticket_id,amount_cents,method,status,reference,received_at,recorded_by").order("received_at", { ascending: false }).order("id", { ascending: false }).range(from, from + PAGE - 1);
    throwIfSupabaseError(error, "Could not load payments");
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) break;
  }

  const idsOf = (column: string) => rows.filter((row) => row[column] !== null && row[column] !== undefined).map((row) => Number(row[column]));
  const [registrations, sessions, tickets, { data: orgRows, error: orgError }, { data: eventRows, error: eventError }] = await Promise.all([
    byIds("registrations", "id,organization_id,reference_code,parent_name", idsOf("registration_id"), "Could not load registrations"),
    byIds("private_session_requests", "id,organization_id,reference_code,parent_name", idsOf("private_session_request_id"), "Could not load private session requests"),
    byIds("event_tickets", "id,event_id,ticket_code,full_name", idsOf("event_ticket_id"), "Could not load event tickets"),
    db.from("organizations").select("id,name"),
    db.from("events").select("id,organization_id"),
  ]);
  throwIfSupabaseError(orgError, "Could not load businesses");
  throwIfSupabaseError(eventError, "Could not load events");
  const orgNames = new Map((orgRows ?? []).map((row) => [Number(row.id), String(row.name)]));
  const eventOrg = new Map((eventRows ?? []).map((row) => [Number(row.id), row.organization_id === null ? null : Number(row.organization_id)]));
  const named = (id: number | null) => (id === null ? "" : orgNames.get(id) ?? `Business ${id}`);

  const payments: AdminPayment[] = rows.map((row) => {
    let kind: BookingKind = "registration";
    let organizationId: number | null = null;
    let payer = "";
    let bookingReference: string | null = null;
    if (row.registration_id !== null && row.registration_id !== undefined) {
      const booking = registrations.get(Number(row.registration_id));
      organizationId = booking ? Number(booking.organization_id) : null;
      payer = text(booking?.parent_name);
      bookingReference = text(booking?.reference_code) || null;
    } else if (row.private_session_request_id !== null && row.private_session_request_id !== undefined) {
      const booking = sessions.get(Number(row.private_session_request_id));
      kind = "private_session";
      organizationId = booking ? Number(booking.organization_id) : null;
      payer = text(booking?.parent_name);
      bookingReference = text(booking?.reference_code) || null;
    } else if (row.event_ticket_id !== null && row.event_ticket_id !== undefined) {
      const booking = tickets.get(Number(row.event_ticket_id));
      kind = "event_ticket";
      organizationId = booking ? eventOrg.get(Number(booking.event_id)) ?? null : null;
      payer = text(booking?.full_name);
      bookingReference = text(booking?.ticket_code) || null;
    }
    const status = row.status === "voided" || row.status === "refunded" ? row.status : "received";
    return { source: "payment", id: Number(row.id), kind, organizationId, organizationName: named(organizationId), payer, bookingReference, amountCents: Number(row.amount_cents), method: text(row.method), status, reference: text(row.reference) || null, receivedAt: String(row.received_at), recordedBy: text(row.recorded_by) || null };
  });

  // Shop orders marked paid.
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.from("reservations").select("id,organization_id,reference_code,buyer_name,total_cents,payment_method,payment_status,paid_at").in("payment_status", ["paid", "refunded"]).not("paid_at", "is", null).order("paid_at", { ascending: false }).order("id", { ascending: false }).range(from, from + PAGE - 1);
    throwIfSupabaseError(error, "Could not load shop orders");
    for (const row of (data ?? []) as Row[]) {
      const organizationId = Number(row.organization_id);
      payments.push({ source: "shop_order", id: Number(row.id), kind: "shop_order", organizationId, organizationName: named(organizationId), payer: text(row.buyer_name), bookingReference: text(row.reference_code) || null, amountCents: Number(row.total_cents ?? 0), method: text(row.payment_method), status: row.payment_status === "refunded" ? "refunded" : "received", reference: null, receivedAt: String(row.paid_at), recordedBy: null });
    }
    if ((data ?? []).length < PAGE) break;
  }

  const wanted = filter.organizationId ? payments.filter((payment) => payment.organizationId === filter.organizationId) : payments;
  return wanted.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : b.id - a.id));
}

// ---- Outstanding ---------------------------------------------------------------------

// What customers still owe each business, from the same list the Bookings
// screen shows.
export async function outstandingByBusiness(): Promise<Outstanding[]> {
  return outstandingFrom(await listAdminBookings({ owing: true, limit: MAX_ROWS }));
}
