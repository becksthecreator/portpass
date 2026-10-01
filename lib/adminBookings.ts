// Admin -> Bookings and Payments (brief 08, 1.6 and 1.7): the shapes and
// the sums, with no database in them so they can be tested on their own.
// The queries are in db/adminBookings.ts and db/adminPayments.ts.

export const BOOKING_KINDS = ["registration", "private_session", "wedding_lead", "shop_order", "event_ticket"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

export const BOOKING_KIND_LABEL: Record<BookingKind, string> = {
  registration: "Registration",
  private_session: "Private session",
  wedding_lead: "Wedding lead",
  shop_order: "Shop order",
  event_ticket: "Event ticket",
};

export function isBookingKind(value: unknown): value is BookingKind {
  return typeof value === "string" && (BOOKING_KINDS as readonly string[]).includes(value);
}

export type AdminBooking = {
  kind: BookingKind;
  id: number;
  reference: string | null;
  organizationId: number | null;
  organizationName: string;
  // The adult who booked, and what the booking is for.
  customer: string;
  detail: string;
  createdAt: string;
  status: string;
  paymentStatus: string | null;
  dueCents: number | null;
  paidCents: number | null;
  email: string | null;
  phone: string | null;
};

// Hidden by default, everywhere in the Admin Control Center. Free-text
// notes and who may collect the child are kept with them: a parent writes
// health details in the notes box as often as in the allergy box.
export const HEALTH_FIELDS = [
  { column: "allergies", label: "Allergies" },
  { column: "medical_conditions", label: "Medical conditions" },
  { column: "medications", label: "Medications" },
  { column: "special_needs", label: "Special needs" },
  { column: "emergency_contact_name", label: "Emergency contact" },
  { column: "emergency_contact_phone", label: "Emergency contact phone" },
  { column: "authorized_pickup", label: "Who may collect the child" },
  { column: "additional_notes", label: "Notes from the parent" },
] as const;

export const REVEAL_REASON_MIN = 10;
export const REVEAL_REASON_MAX = 300;

// What a booking still owes. Cancelled, declined, waitlisted and waived
// bookings owe nothing, whatever their price says.
const NOTHING_OWED_STATUS = new Set(["cancelled", "waitlist", "declined", "referred", "released", "pending_details"]);

export function owingCents(booking: Pick<AdminBooking, "status" | "paymentStatus" | "dueCents" | "paidCents">): number {
  if (booking.dueCents === null) return 0;
  if (NOTHING_OWED_STATUS.has(booking.status) || booking.paymentStatus === "waived") return 0;
  return Math.max(0, booking.dueCents - (booking.paidCents ?? 0));
}

// ---- Export ------------------------------------------------------------------

// A cell a spreadsheet would run as a formula is made plain text.
export function csvCell(value: string | number | null): string {
  let cell = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

const dollars = (value: number | null): string => (value === null ? "" : (value / 100).toFixed(2));

export const BOOKINGS_CSV_HEADER = ["Type", "Reference", "Business", "Booked by", "For", "Booked on", "Status", "Payment", "Due (BSD)", "Paid (BSD)", "Email", "Phone"];

export function bookingsCsv(bookings: AdminBooking[]): string {
  const lines = bookings.map((b) => [BOOKING_KIND_LABEL[b.kind], b.reference, b.organizationName, b.customer, b.detail, b.createdAt.slice(0, 10), b.status, b.paymentStatus, dollars(b.dueCents), dollars(b.paidCents), b.email, b.phone].map(csvCell).join(","));
  return [BOOKINGS_CSV_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}

// ---- Payments ------------------------------------------------------------------

export type AdminPayment = {
  // "payments" rows are recorded by staff; a shop order is marked paid on
  // the order itself, so it has no payments row.
  source: "payment" | "shop_order";
  id: number;
  kind: BookingKind;
  organizationId: number | null;
  organizationName: string;
  payer: string;
  bookingReference: string | null;
  amountCents: number;
  method: string;
  status: "received" | "voided" | "refunded";
  reference: string | null;
  receivedAt: string;
  recordedBy: string | null;
};

// The month a payment landed in, on Nassau's calendar: a payment at 9pm on
// the 31st is still that month's.
export function nassauMonth(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Nassau", year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export const METHOD_LABEL: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", online_banking: "Online banking" };
export const methodLabel = (method: string): string => METHOD_LABEL[method] ?? (method || "Not recorded");

// A transfer with no reference can't be matched to a bank statement line.
const NEEDS_REFERENCE = new Set(["bank_transfer", "online_banking"]);

export type ReconciliationLine = { month: string; organizationId: number | null; organizationName: string; method: string; count: number; receivedCents: number; missingReference: number; reversedCount: number; reversedCents: number };

// Received money by month, business and method, with what was voided or
// refunded kept apart so the received column matches the bank.
export function reconcile(payments: AdminPayment[]): ReconciliationLine[] {
  const lines = new Map<string, ReconciliationLine>();
  for (const payment of payments) {
    const month = nassauMonth(payment.receivedAt);
    const key = `${month}|${payment.organizationId ?? 0}|${payment.method}`;
    const line = lines.get(key) ?? { month, organizationId: payment.organizationId, organizationName: payment.organizationName, method: payment.method, count: 0, receivedCents: 0, missingReference: 0, reversedCount: 0, reversedCents: 0 };
    if (payment.status === "received") {
      line.count += 1;
      line.receivedCents += payment.amountCents;
      // A shop order's own reference is on the order, not a bank reference.
      if (payment.source === "payment" && NEEDS_REFERENCE.has(payment.method) && !payment.reference) line.missingReference += 1;
    } else {
      line.reversedCount += 1;
      line.reversedCents += payment.amountCents;
    }
    lines.set(key, line);
  }
  return Array.from(lines.values()).sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.organizationName.localeCompare(b.organizationName) || a.method.localeCompare(b.method)));
}

export type Outstanding = { organizationId: number | null; organizationName: string; owingCents: number; bookingsOwing: number; byKind: Array<{ kind: BookingKind; label: string; owingCents: number; count: number }> };

// What customers still owe each business.
export function outstandingFrom(bookings: AdminBooking[]): Outstanding[] {
  const byOrg = new Map<number, Outstanding>();
  for (const booking of bookings) {
    const owing = owingCents(booking);
    if (owing <= 0) continue;
    const key = booking.organizationId ?? 0;
    const entry = byOrg.get(key) ?? { organizationId: booking.organizationId, organizationName: booking.organizationName, owingCents: 0, bookingsOwing: 0, byKind: [] };
    entry.owingCents += owing;
    entry.bookingsOwing += 1;
    const kind = entry.byKind.find((k) => k.kind === booking.kind);
    if (kind) {
      kind.owingCents += owing;
      kind.count += 1;
    } else entry.byKind.push({ kind: booking.kind, label: BOOKING_KIND_LABEL[booking.kind], owingCents: owing, count: 1 });
    byOrg.set(key, entry);
  }
  return Array.from(byOrg.values()).sort((a, b) => b.owingCents - a.owingCents);
}
