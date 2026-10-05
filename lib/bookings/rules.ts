// Booking requests (brief 19, part A): the rules, with no database and no
// server imports, shared by the public form, the business's Bookings
// screen, the customer's page, the emails and the tests.
//
// A booking request is a question, not a sale: the customer asks for a
// date, the business confirms or declines, and money is asked for
// afterwards with a payment request (brief 17). Nothing is charged here.

export const BOOKING_STATUSES = ["new", "confirmed", "done", "declined", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

// What the business reads, and what the customer reads.
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  done: "Done",
  declined: "Declined",
  cancelled: "Cancelled by the customer",
};

export const CUSTOMER_STATUS_LABEL: Record<BookingStatus, string> = {
  new: "Waiting for a reply",
  confirmed: "Confirmed",
  done: "Completed",
  declined: "Not available",
  cancelled: "Cancelled",
};

// ---- which offerings can be asked for ----------------------------------------------

type OfferingLike = { priceCents: number | null; actionUrl: string | null };

// "Request to book" appears on an offering that has a price and no link of
// its own. An offering with a link keeps it: an outside one (a ticket
// site, a wa.me link) or a PortPass one (a registration form, the wedding
// planner) is already how that offering is booked.
export function isBookable(offering: OfferingLike): boolean {
  return offering.priceCents !== null && offering.priceCents >= 0 && !(offering.actionUrl ?? "").trim();
}

// An offering for under-18s: its ages stop below 18. The form then asks
// the adult to say they are the parent or guardian.
export function isForChildren(offering: { ageMin: number | null; ageMax: number | null }): boolean {
  return offering.ageMax !== null && offering.ageMax < 18;
}

// Futprep's private sessions and parties are requested through Futprep's
// own flow, which this brief leaves alone.
export const BOOKING_EXCLUDED_SLUGS: readonly string[] = ["futprep"];

export function bookPath(pageHref: string, offeringSlug: string): string {
  return `${pageHref}/book?offering=${encodeURIComponent(offeringSlug)}`;
}

// ---- how much, how long ---------------------------------------------------------------

// The question the form asks for "how many / how long", by how the
// offering is priced.
export function quantityQuestion(priceUnit: string | null): { label: string; placeholder: string } {
  switch (priceUnit) {
    case "per_hour":
      return { label: "How many hours?", placeholder: "3 hours" };
    case "per_day":
      return { label: "How many days?", placeholder: "1 day" };
    case "per_person":
      return { label: "How many people?", placeholder: "12 people" };
    case "per_child":
      return { label: "How many children?", placeholder: "8 children" };
    case "per_session":
      return { label: "How many sessions?", placeholder: "1 session" };
    default:
      return { label: "How many, or how long?", placeholder: "Optional" };
  }
}

// "3 hours" -> 3, "12 people" -> 12, "" or "a few" -> 1: the quantity a
// payment request starts from. The business can change it before sending.
export function quantityFrom(text: string): number {
  const match = /^\s*(\d{1,3})(?!\d)/.exec(text);
  const n = match ? Number(match[1]) : 1;
  return n >= 1 && n <= 999 ? n : 1;
}

// ---- dates and times ---------------------------------------------------------------

export const BOOKING_MAX_DAYS_AHEAD = 730;

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function plusDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function lastBookableDay(today: string): string {
  return plusDays(today, BOOKING_MAX_DAYS_AHEAD);
}

// "Sat 17 Oct 2026" and "2:30 pm": a booking's day and time as people say them.
export function formatBookingDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(",", "");
}

export function formatClockTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m === 0 ? "" : `:${String(m).padStart(2, "0")}`} ${h < 12 ? "am" : "pm"}`;
}

export function formatWhen(day: string, time: string | null): string {
  return time ? `${formatBookingDay(day)} at ${formatClockTime(time)}` : formatBookingDay(day);
}

// ---- what can happen next -----------------------------------------------------------

export const BOOKING_ACTIONS = ["confirm", "decline", "done", "reopen"] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

export function isBookingAction(value: unknown): value is BookingAction {
  return typeof value === "string" && (BOOKING_ACTIONS as readonly string[]).includes(value);
}

// The business's moves. A new request is confirmed or declined; a
// confirmed one is marked done, or declined after all (the date fell
// through); a declined one can be re-opened if that was a mistake. A
// request the customer cancelled is theirs to make again.
const NEXT: Record<BookingAction, { from: BookingStatus[]; to: BookingStatus }> = {
  confirm: { from: ["new"], to: "confirmed" },
  decline: { from: ["new", "confirmed"], to: "declined" },
  done: { from: ["confirmed"], to: "done" },
  reopen: { from: ["declined", "done"], to: "new" },
};

export function nextStatus(current: BookingStatus, action: BookingAction): BookingStatus | null {
  const move = NEXT[action];
  return move.from.includes(current) ? move.to : null;
}

export function actionsFor(status: BookingStatus): BookingAction[] {
  return BOOKING_ACTIONS.filter((action) => nextStatus(status, action) !== null);
}

// The customer can cancel only while the business hasn't answered.
export function customerCanCancel(status: BookingStatus): boolean {
  return status === "new";
}

export const DECLINE_REASON_MIN = 3;
export const DECLINE_REASON_MAX = 300;

export function cleanDeclineReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.replace(/\s+/g, " ").trim().slice(0, DECLINE_REASON_MAX);
  return reason.length >= DECLINE_REASON_MIN ? reason : null;
}

// ---- the business's lists ---------------------------------------------------------------

// The four lists on the Bookings screen. A request the customer cancelled
// sits with the declined ones: both are closed without a booking.
export const BOOKING_TABS = ["new", "confirmed", "done", "declined"] as const;
export type BookingTab = (typeof BOOKING_TABS)[number];

export const BOOKING_TAB_LABEL: Record<BookingTab, string> = { new: "New", confirmed: "Confirmed", done: "Done", declined: "Declined" };

export function tabOf(status: BookingStatus): BookingTab {
  return status === "cancelled" ? "declined" : status;
}

export function isBookingTab(value: unknown): value is BookingTab {
  return typeof value === "string" && (BOOKING_TABS as readonly string[]).includes(value);
}

// New requests oldest first (answer the one that has waited longest);
// confirmed ones by the day they're for; the rest newest first.
type Sortable = { status: BookingStatus; createdAt: string; requestedDate: string; requestedTime: string | null };
export function sortForTab<T extends Sortable>(tab: BookingTab, rows: T[]): T[] {
  const mine = rows.filter((row) => tabOf(row.status) === tab);
  if (tab === "new") return mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (tab === "confirmed") return mine.sort((a, b) => `${a.requestedDate}${a.requestedTime ?? ""}`.localeCompare(`${b.requestedDate}${b.requestedTime ?? ""}`));
  return mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- WhatsApp, by hand -----------------------------------------------------------------

// The message a team member starts from when they press WhatsApp on a
// booking: the reference and what it's for, nothing else about the
// customer. It opens in their own WhatsApp; PortPass sends nothing.
export function bookingWhatsAppText(input: { businessName: string; customerName: string; referenceCode: string; offeringName: string; requestedDate: string; requestedTime: string | null }): string {
  const first = input.customerName.trim().split(/\s+/)[0] ?? "";
  return `Hi ${first}, this is ${input.businessName} about your booking request ${input.referenceCode} (${input.offeringName}, ${formatWhen(input.requestedDate, input.requestedTime)}).`;
}

export function whatsAppLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
