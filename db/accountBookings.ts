import { CUSTOMER_STATUS_LABEL, isBookingStatus } from "@/lib/bookings/rules";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// What /account shows a signed-in customer (brief 18, F2): the
// registrations and bookings made with their email address. The account's
// email is proven (a code sent to it, or Google), so whoever holds the
// account holds the inbox those confirmations went to.
//
// What is read is deliberately small: what was booked, with whom, when and
// where it stands. Never a health, allergy, medication, emergency-contact
// or pickup field, never a phone number or address, and of a child only
// the first name.

export type AccountRegistration = {
  reference: string;
  business: string;
  what: string;
  childFirstName: string;
  status: "confirmed" | "pending" | "waitlist" | "trial" | "cancelled";
  payment: "paid" | "part" | "due" | "none";
  submittedAt: string;
  // The business's own status page for this registration, when it has one.
  href: string | null;
};

export type AccountBooking = {
  key: string;
  kind: "Private session" | "Booking request" | "Order" | "Wedding enquiry" | "Payment request";
  business: string;
  what: string;
  status: string;
  when: string;
  href: string | null;
};

export type AccountBookings = { registrations: AccountRegistration[]; bookings: AccountBooking[] };

type Row = Record<string, unknown>;
const LIMIT = 50;

// An exact, case-insensitive match: the wildcard characters an address may
// contain are escaped, so "a_b@x.com" never matches "acb@x.com".
function exactEmail(email: string): string {
  return email.trim().toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`);
}

const firstName = (name: unknown): string => String(name ?? "").trim().split(/\s+/)[0] ?? "";
const text = (value: unknown): string => (typeof value === "string" ? value : "");

function registrationStatus(raw: unknown): AccountRegistration["status"] {
  const status = text(raw);
  if (status === "confirmed" || status === "waitlist" || status === "trial" || status === "cancelled") return status;
  return "pending";
}

function paymentState(raw: unknown): AccountRegistration["payment"] {
  const status = text(raw);
  if (status === "paid") return "paid";
  if (status === "partial") return "part";
  if (status === "waived") return "none";
  return "due";
}

export async function listAccountBookings(email: string | null): Promise<AccountBookings> {
  // "*" is a wildcard to the database API and can't be escaped there: an
  // address with one (almost never real) simply sees nothing here.
  if (!email || !email.includes("@") || /[*\s]/.test(email)) return { registrations: [], bookings: [] };
  const db = getSupabaseAdmin();
  const match = exactEmail(email);

  const [registrations, sessions, orders, weddings, requests, asked] = await Promise.all([
    db.from("registrations").select("reference_code,organization_id,program_id,term_id,child_name,registration_status,payment_status,submitted_at").ilike("parent_email", match).order("submitted_at", { ascending: false }).limit(LIMIT),
    db.from("private_session_requests").select("reference_code,organization_id,child_name,requested_date,status,created_at").ilike("parent_email", match).order("created_at", { ascending: false }).limit(LIMIT),
    db.from("reservations").select("reference_code,receipt_token,organization_id,total_cents,status,created_at").ilike("buyer_email", match).order("created_at", { ascending: false }).limit(LIMIT),
    db.from("wedding_leads").select("public_token,status,preferred_wedding_date,created_at").ilike("email", match).order("created_at", { ascending: false }).limit(LIMIT),
    db.from("payment_requests").select("reference_code,public_token,organization_id,total_cents,paid_cents,status,due_date,created_at").ilike("customer_email", match).eq("is_test", false).not("status", "in", "(draft,void)").order("created_at", { ascending: false }).limit(LIMIT),
    // Booking requests (brief 19, part A): what was asked for and where it stands.
    db.from("booking_requests").select("reference_code,public_token,organization_id,offering_name,requested_date,status,created_at").ilike("customer_email", match).order("created_at", { ascending: false }).limit(LIMIT),
  ]);
  throwIfSupabaseError(registrations.error, "Could not load your registrations");
  throwIfSupabaseError(sessions.error, "Could not load your private sessions");
  throwIfSupabaseError(orders.error, "Could not load your orders");
  throwIfSupabaseError(weddings.error, "Could not load your wedding enquiries");
  throwIfSupabaseError(requests.error, "Could not load your payment requests");
  throwIfSupabaseError(asked.error, "Could not load your booking requests");

  const regRows = (registrations.data ?? []) as Row[];
  const orgIds = new Set<number>();
  for (const rows of [regRows, (sessions.data ?? []) as Row[], (orders.data ?? []) as Row[], (requests.data ?? []) as Row[], (asked.data ?? []) as Row[]]) {
    for (const row of rows) if (row.organization_id) orgIds.add(Number(row.organization_id));
  }
  const programIds = [...new Set(regRows.map((row) => Number(row.program_id)).filter(Boolean))];
  const termIds = [...new Set(regRows.map((row) => Number(row.term_id)).filter(Boolean))];
  const [orgs, programs, terms] = await Promise.all([
    orgIds.size ? db.from("organizations").select("id,name,slug").in("id", [...orgIds]) : Promise.resolve({ data: [] as Row[], error: null }),
    programIds.length ? db.from("programs").select("id,name").in("id", programIds) : Promise.resolve({ data: [] as Row[], error: null }),
    termIds.length ? db.from("program_terms").select("id,name").in("id", termIds) : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  throwIfSupabaseError(orgs.error, "Could not load the businesses for your bookings");
  throwIfSupabaseError(programs.error, "Could not load the programmes for your registrations");
  throwIfSupabaseError(terms.error, "Could not load the terms for your registrations");
  const org = new Map(((orgs.data ?? []) as Row[]).map((row) => [Number(row.id), { name: text(row.name), slug: text(row.slug) }]));
  const program = new Map(((programs.data ?? []) as Row[]).map((row) => [Number(row.id), text(row.name)]));
  const term = new Map(((terms.data ?? []) as Row[]).map((row) => [Number(row.id), text(row.name)]));
  const businessName = (id: unknown) => org.get(Number(id))?.name ?? "A business on PortPass";

  const money = (cents: unknown) => `$${(Number(cents ?? 0) / 100).toFixed(2).replace(/\.00$/, "")}`;

  const bookings: AccountBooking[] = [
    ...((sessions.data ?? []) as Row[]).map((row) => ({
      key: `session:${text(row.reference_code)}`,
      kind: "Private session" as const,
      business: businessName(row.organization_id),
      what: [firstName(row.child_name), text(row.requested_date)].filter(Boolean).join(" · "),
      status: text(row.status).replace(/_/g, " "),
      when: text(row.created_at),
      href: null,
    })),
    ...((asked.data ?? []) as Row[]).map((row) => {
      const status = row.status;
      return {
        key: `booking:${text(row.reference_code)}:${text(row.public_token).slice(0, 8)}`,
        kind: "Booking request" as const,
        business: businessName(row.organization_id),
        what: [text(row.offering_name), text(row.requested_date)].filter(Boolean).join(" · "),
        status: isBookingStatus(status) ? CUSTOMER_STATUS_LABEL[status].toLowerCase() : text(status),
        when: text(row.created_at),
        href: row.public_token ? `/booking/${text(row.public_token)}` : null,
      };
    }),
    ...((orders.data ?? []) as Row[]).map((row) => {
      const slug = org.get(Number(row.organization_id))?.slug;
      return {
        key: `order:${text(row.reference_code)}`,
        kind: "Order" as const,
        business: businessName(row.organization_id),
        what: `${text(row.reference_code)} · ${money(row.total_cents)}`,
        status: text(row.status).replace(/_/g, " "),
        when: text(row.created_at),
        href: slug && row.receipt_token ? `/shop/${slug}/reservation/${text(row.receipt_token)}` : null,
      };
    }),
    ...((weddings.data ?? []) as Row[]).map((row) => ({
      key: `wedding:${text(row.public_token)}`,
      kind: "Wedding enquiry" as const,
      business: "Bahamas Weddings By The Sea",
      what: row.preferred_wedding_date ? `Preferred date ${text(row.preferred_wedding_date)}` : "Date to be decided",
      status: text(row.status).replace(/_/g, " "),
      when: text(row.created_at),
      href: null,
    })),
    ...((requests.data ?? []) as Row[]).map((row) => {
      const balance = Math.max(0, Number(row.total_cents ?? 0) - Number(row.paid_cents ?? 0));
      return {
        key: `request:${text(row.reference_code)}:${text(row.public_token).slice(0, 8)}`,
        kind: "Payment request" as const,
        business: businessName(row.organization_id),
        what: `${text(row.reference_code)} · ${balance > 0 ? `${money(balance)} to pay` : `${money(row.total_cents)} paid`}`,
        status: text(row.status).replace(/_/g, " "),
        when: text(row.created_at),
        href: row.public_token ? `/pay/${text(row.public_token)}` : null,
      };
    }),
  ].sort((a, b) => b.when.localeCompare(a.when));

  return {
    registrations: regRows.map((row) => ({
      reference: text(row.reference_code),
      business: businessName(row.organization_id),
      what: [program.get(Number(row.program_id)), term.get(Number(row.term_id))].filter(Boolean).join(" · "),
      childFirstName: firstName(row.child_name),
      status: registrationStatus(row.registration_status),
      payment: paymentState(row.payment_status),
      submittedAt: text(row.submitted_at),
      href: org.get(Number(row.organization_id))?.slug === "futprep" ? "/futprep/my" : null,
    })),
    bookings,
  };
}
