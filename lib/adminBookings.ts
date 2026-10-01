import { nassauToday } from "./futprepTerms";
import { receivedDate } from "./growth";

// Admin -> Bookings and Payments (brief 08, 1.6 and 1.7): the shapes and
// the sums, with no database in them so they can be tested on their own.
// The queries are in db/adminBookings.ts and db/adminPayments.ts.
//
// The sums follow the same rules as a business's own screens (lib/growth.ts
// for Futprep), so a founder and the business never see two different
// numbers for the same thing.

export const BOOKING_KINDS = ["registration", "private_session", "wedding_lead", "shop_order"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

export const BOOKING_KIND_LABEL: Record<BookingKind, string> = {
  registration: "Registration",
  private_session: "Private session",
  wedding_lead: "Wedding lead",
  shop_order: "Shop order",
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
  // What the booking costs so far: nothing for a booking that can't owe
  // (see canOwe), and for a weekly payer one week's fee for each session
  // held since they joined.
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

// The ones the 90-day deletion removes. The emergency contact and who may
// collect the child are kept with the registration.
export const PURGED_HEALTH_COLUMNS: readonly string[] = ["allergies", "medical_conditions", "medications", "special_needs", "additional_notes"];

export const REVEAL_REASON_MIN = 10;
export const REVEAL_REASON_MAX = 300;
export const REVEALS_PER_HOUR = 10;

// A booking that can't owe anything, whatever its price says: cancelled,
// waitlisted, declined or passed on, a released shop hold, a waived fee,
// a refunded order. A registration still waiting for the parent's details
// ("pending_details") is a child in the class and does owe.
const NOTHING_OWED_STATUS = new Set(["cancelled", "waitlist", "declined", "referred", "released"]);

export function canOwe(status: string, paymentStatus: string | null): boolean {
  return !NOTHING_OWED_STATUS.has(status) && paymentStatus !== "waived" && paymentStatus !== "refunded";
}

export function owingCents(booking: Pick<AdminBooking, "status" | "paymentStatus" | "dueCents" | "paidCents">): number {
  if (booking.dueCents === null || !canOwe(booking.status, booking.paymentStatus)) return 0;
  return Math.max(0, booking.dueCents - (booking.paidCents ?? 0));
}

// A weekly payer owes one week's fee for each session held since they
// joined (the rule in lib/growth.ts). Sessions before the term starts are
// the free taster, and a cancelled session is not charged.
export type HeldSession = { programId: number; termId: number; date: string; status: string };

export function weeklyDueCents(weeklyFeeCents: number, registration: { programId: number; termId: number | null; joinedOn: string }, sessions: HeldSession[], today: string): number {
  const held = sessions.filter((s) => s.programId === registration.programId && s.termId === registration.termId && s.status !== "cancelled" && s.date <= today && s.date >= registration.joinedOn).length;
  return weeklyFeeCents * held;
}

// ---- Export ------------------------------------------------------------------

// A cell a spreadsheet would run as a formula is made plain text.
export function csvCell(value: string | number | null): string {
  let cell = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

const dollars = (value: number | null): string => (value === null ? "" : (value / 100).toFixed(2));

export const BOOKINGS_CSV_HEADER = ["Type", "Reference", "Business", "Booked by", "For", "Booked on", "Status", "Payment", "Due (BSD)", "Paid (BSD)", "Owing (BSD)", "Email", "Phone"];

// "Booked on" is the day in Nassau, the same day the screen shows.
export function bookingsCsv(bookings: AdminBooking[]): string {
  const lines = bookings.map((b) => [BOOKING_KIND_LABEL[b.kind], b.reference, b.organizationName, b.customer, b.detail, nassauToday(new Date(b.createdAt)), b.status, b.paymentStatus, dollars(b.dueCents), dollars(b.paidCents), b.dueCents === null ? "" : dollars(owingCents(b)), b.email, b.phone].map(csvCell).join(","));
  return [BOOKINGS_CSV_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}

// ---- Payments ------------------------------------------------------------------

// "other": a payment not tied to a registration or a private session (for
// example one recorded against a payment request).
export type PaymentKind = BookingKind | "other";
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { ...BOOKING_KIND_LABEL, other: "Other payment" };

export type AdminPayment = {
  // "payments" rows are recorded by staff; a shop order is marked paid on
  // the order itself, so it has no payments row.
  source: "payment" | "shop_order";
  id: number;
  kind: PaymentKind;
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

// The day a payment was received. Staff pick a date, which is stored as
// midnight UTC of that date: it is that calendar date, as typed. Anything
// else is a real moment, read in Nassau time. (The same rule as the
// business's growth report.)
export function paymentDay(iso: string): string {
  return receivedDate(iso);
}

export function paymentMonth(iso: string): string {
  return paymentDay(iso).slice(0, 7);
}

export const METHOD_LABEL: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", online_banking: "Online banking", kanoo_wallet_manual: "Kanoo wallet" };
export const methodLabel = (method: string): string => METHOD_LABEL[method] ?? (method ? method.replace(/_/g, " ") : "Not recorded");

// A transfer with no reference can't be matched to a bank statement line.
const NEEDS_REFERENCE = new Set(["bank_transfer", "online_banking"]);

export type ReconciliationLine = { month: string; organizationId: number | null; organizationName: string; method: string; count: number; receivedCents: number; missingReference: number; refundedCount: number; refundedCents: number; voidedCount: number; voidedCents: number };

// Money by the month it arrived, business and method, to check against a
// bank statement. A payment refunded later still arrived, so it stays in
// its month's "received" and is also shown as refunded; a voided payment
// was never money and is kept out.
export function reconcile(payments: AdminPayment[]): ReconciliationLine[] {
  const lines = new Map<string, ReconciliationLine>();
  for (const payment of payments) {
    const month = paymentMonth(payment.receivedAt);
    const key = `${month}|${payment.organizationId ?? 0}|${payment.method}`;
    const line = lines.get(key) ?? { month, organizationId: payment.organizationId, organizationName: payment.organizationName, method: payment.method, count: 0, receivedCents: 0, missingReference: 0, refundedCount: 0, refundedCents: 0, voidedCount: 0, voidedCents: 0 };
    if (payment.status === "voided") {
      line.voidedCount += 1;
      line.voidedCents += payment.amountCents;
    } else {
      line.count += 1;
      line.receivedCents += payment.amountCents;
      // A shop order's own reference is on the order, not a bank reference.
      if (payment.source === "payment" && NEEDS_REFERENCE.has(payment.method) && !payment.reference) line.missingReference += 1;
      if (payment.status === "refunded") {
        line.refundedCount += 1;
        line.refundedCents += payment.amountCents;
      }
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
