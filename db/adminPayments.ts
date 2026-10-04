import { outstandingFrom, type AdminPayment, type Outstanding, type PaymentKind } from "@/lib/adminBookings";
import { listAdminBookings } from "./adminBookings";
import { demoOrganizationIdOrNull } from "./demo";
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
const has = (value: unknown): boolean => value !== null && value !== undefined;

export async function listAdminPayments(filter: { organizationId?: number | null } = {}): Promise<AdminPayment[]> {
  const db = getSupabaseAdmin();
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.from("payments").select("id,registration_id,private_session_request_id,payment_request_id,amount_cents,method,status,reference,received_at,created_at,recorded_by").order("id", { ascending: false }).range(from, from + PAGE - 1);
    throwIfSupabaseError(error, "Could not load payments");
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) break;
  }

  const idsOf = (column: string) => rows.filter((row) => has(row[column])).map((row) => Number(row[column]));
  const [registrations, sessions, requests, { data: orgRows, error: orgError }] = await Promise.all([
    byIds("registrations", "id,organization_id,reference_code,parent_name", idsOf("registration_id"), "Could not load registrations"),
    byIds("private_session_requests", "id,organization_id,reference_code,parent_name", idsOf("private_session_request_id"), "Could not load private session requests"),
    byIds("payment_requests", "id,organization_id,reference_code,customer_name,reservation_id", idsOf("payment_request_id"), "Could not load payment requests"),
    db.from("organizations").select("id,name"),
  ]);
  throwIfSupabaseError(orgError, "Could not load businesses");
  const orgNames = new Map((orgRows ?? []).map((row) => [Number(row.id), String(row.name)]));
  const named = (id: number | null) => (id === null ? "" : orgNames.get(id) ?? `Business ${id}`);

  // Shop orders whose money is already in the list as a payment against a request.
  const requestPaidOrders = new Set<number>();
  const payments: AdminPayment[] = rows.map((row) => {
    // A payment tied to neither kind of booking is listed as it is, with
    // no business guessed for it.
    let kind: PaymentKind = "other";
    let organizationId: number | null = null;
    let payer = "";
    let bookingReference: string | null = null;
    const booking = has(row.registration_id) ? registrations.get(Number(row.registration_id)) : has(row.private_session_request_id) ? sessions.get(Number(row.private_session_request_id)) : undefined;
    if (has(row.registration_id)) kind = "registration";
    else if (has(row.private_session_request_id)) kind = "private_session";
    if (booking) {
      organizationId = Number(booking.organization_id);
      payer = text(booking.parent_name);
      bookingReference = text(booking.reference_code) || null;
    }
    // Paid against a payment request: the request says whose money it is,
    // and whether it was for a shop order.
    const request = has(row.payment_request_id) ? requests.get(Number(row.payment_request_id)) : undefined;
    if (request) {
      organizationId = organizationId ?? Number(request.organization_id);
      payer = payer || text(request.customer_name);
      bookingReference = bookingReference ?? (text(request.reference_code) || null);
      if (kind === "other") kind = has(request.reservation_id) ? "shop_order" : "payment_request";
      if (has(request.reservation_id) && row.status !== "voided") requestPaidOrders.add(Number(request.reservation_id));
    }
    const status = row.status === "voided" || row.status === "refunded" ? row.status : "received";
    // A payment with no received date counts from when it was recorded.
    return { source: "payment", id: Number(row.id), kind, organizationId, organizationName: named(organizationId), payer, bookingReference, amountCents: Number(row.amount_cents), method: text(row.method), status, reference: text(row.reference) || null, receivedAt: String(row.received_at ?? row.created_at), recordedBy: text(row.recorded_by) || null };
  });

  // Shop orders marked paid on the order itself.
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.from("reservations").select("id,organization_id,reference_code,buyer_name,total_cents,payment_method,payment_status,paid_at").in("payment_status", ["paid", "refunded"]).not("paid_at", "is", null).order("id", { ascending: false }).range(from, from + PAGE - 1);
    throwIfSupabaseError(error, "Could not load shop orders");
    for (const row of (data ?? []) as Row[]) {
      // Paid through a payment request: counted there, not twice.
      if (requestPaidOrders.has(Number(row.id))) continue;
      const organizationId = Number(row.organization_id);
      payments.push({ source: "shop_order", id: Number(row.id), kind: "shop_order", organizationId, organizationName: named(organizationId), payer: text(row.buyer_name), bookingReference: text(row.reference_code) || null, amountCents: Number(row.total_cents ?? 0), method: text(row.payment_method), status: row.payment_status === "refunded" ? "refunded" : "received", reference: null, receivedAt: String(row.paid_at), recordedBy: null });
    }
    if ((data ?? []).length < PAGE) break;
  }

  // The demo business's example payments are not money anyone received.
  const demoId = await demoOrganizationIdOrNull();
  const real = demoId === null ? payments : payments.filter((payment) => payment.organizationId !== demoId);
  const wanted = filter.organizationId ? real.filter((payment) => payment.organizationId === filter.organizationId) : real;
  // Newest first by the moment stored, then by id.
  return wanted.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || b.id - a.id);
}

// ---- Outstanding ---------------------------------------------------------------------

// What customers still owe each business, from the same list the Bookings
// screen shows.
export async function outstandingByBusiness(): Promise<Outstanding[]> {
  return outstandingFrom(await listAdminBookings({ owing: true, limit: MAX_ROWS }));
}
