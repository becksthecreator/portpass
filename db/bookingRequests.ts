import { randomBytes } from "node:crypto";
import { resolveAttribution } from "@/lib/attribution";
import type { BookingInput } from "@/lib/bookings/input";
import { BOOKING_EXCLUDED_SLUGS, customerCanCancel, isBookable, isBookingStatus, isForChildren, nextStatus, quantityFrom, type BookingAction, type BookingStatus } from "@/lib/bookings/rules";
import { findPersonByEmail } from "./accounts";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Booking requests for any offering (brief 19, part A). One table,
// booking_requests, written three ways: a customer asks (createBooking),
// the business answers (changeBookingStatus) and the customer may cancel
// while nobody has answered (cancelBookingByCustomer).
//
// Who may call what is decided before this file: the business's functions
// take an organization id the caller's guard has already checked, and
// every query is scoped by it, so one business can never read or change
// another's request. The customer's functions go by the request's
// unguessable token and hand back only what the customer typed themselves.

type Row = Record<string, unknown>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN = /^[a-f0-9]{40}$/;

export function isBookingToken(value: string): boolean {
  return TOKEN.test(value);
}

// ---- the offering being asked for ------------------------------------------------------

export type BookableOffering = {
  business: {
    id: number;
    slug: string;
    name: string;
    primaryCategory: string | null;
    brandColor: string | null;
    logoUrl: string | null;
    theme: Record<string, unknown>;
  };
  offering: {
    id: number;
    slug: string;
    name: string;
    summary: string | null;
    priceCents: number;
    priceUnit: string | null;
    forChildren: boolean;
    leadTimeText: string | null;
  };
};

// Only a public business (published, live or approved) and only an
// offering that is published, priced and has no link of its own. Anything
// else is simply not found, whatever link was used.
export async function getBookableOffering(organizationSlug: string, offeringSlug: string): Promise<BookableOffering | null> {
  if (!SLUG.test(organizationSlug) || !SLUG.test(offeringSlug) || BOOKING_EXCLUDED_SLUGS.includes(organizationSlug)) return null;
  const db = getSupabaseAdmin();
  const { data: org, error: orgError } = await db
    .from("organizations")
    .select("id,slug,name,primary_category,brand_color,logo_url,theme")
    .eq("slug", organizationSlug)
    .eq("is_published", true)
    .in("status", ["live", "approved"])
    .maybeSingle();
  throwIfSupabaseError(orgError, "Could not load the business");
  if (!org) return null;
  const { data: row, error } = await db
    .from("offerings")
    .select("id,slug,name,summary,price_cents,price_unit,age_min,age_max,lead_time_text,action_url")
    .eq("organization_id", org.id)
    .eq("slug", offeringSlug)
    .eq("is_published", true)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the offering");
  if (!row) return null;
  const priceCents = row.price_cents === null || row.price_cents === undefined ? null : Number(row.price_cents);
  if (!isBookable({ priceCents, actionUrl: (row.action_url as string | null) ?? null })) return null;
  return {
    business: {
      id: Number(org.id),
      slug: String(org.slug),
      name: String(org.name),
      primaryCategory: (org.primary_category as string | null) ?? null,
      brandColor: (org.brand_color as string | null) ?? null,
      logoUrl: (org.logo_url as string | null) ?? null,
      theme: org.theme && typeof org.theme === "object" ? (org.theme as Record<string, unknown>) : {},
    },
    offering: {
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      summary: (row.summary as string | null) ?? null,
      priceCents: priceCents as number,
      priceUnit: (row.price_unit as string | null) ?? null,
      forChildren: isForChildren({ ageMin: row.age_min === null ? null : Number(row.age_min), ageMax: row.age_max === null || row.age_max === undefined ? null : Number(row.age_max) }),
      leadTimeText: (row.lead_time_text as string | null) ?? null,
    },
  };
}

// What an email about one of a business's bookings needs to know about
// the business: its name, where its Bookings screen is, and its colours.
export type BookingBusiness = { id: number; slug: string | null; name: string; brandColor: string | null; theme: Record<string, unknown> };

export async function getBookingBusiness(organizationId: number): Promise<BookingBusiness | null> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id,slug,name,brand_color,theme").eq("id", organizationId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the business");
  if (!data) return null;
  return {
    id: Number(data.id),
    slug: (data.slug as string | null) ?? null,
    name: String(data.name),
    brandColor: (data.brand_color as string | null) ?? null,
    theme: data.theme && typeof data.theme === "object" ? (data.theme as Record<string, unknown>) : {},
  };
}

// ---- one request ---------------------------------------------------------------------

export type BookingRequest = {
  id: number;
  organizationId: number;
  offeringId: number | null;
  offeringName: string;
  referenceCode: string;
  token: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  guardianConfirmed: boolean;
  childFirstName: string | null;
  requestedDate: string;
  requestedTime: string | null;
  durationOrQty: string;
  locationText: string;
  notes: string;
  status: BookingStatus;
  declinedReason: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  paymentRequestId: number | null;
  source: string;
  createdAt: string;
  handledByName: string | null;
};

const COLUMNS =
  "id,organization_id,offering_id,offering_name,reference_code,public_token,customer_name,customer_email,customer_phone,guardian_confirmed,child_first_name,requested_date,requested_time,duration_or_qty,location_text,notes,status,declined_reason,price_cents,price_unit,payment_request_id,source,created_at,handled_by_name";

function toBooking(row: Row): BookingRequest {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    offeringId: row.offering_id === null || row.offering_id === undefined ? null : Number(row.offering_id),
    offeringName: String(row.offering_name ?? ""),
    referenceCode: String(row.reference_code ?? ""),
    token: String(row.public_token ?? ""),
    customerName: String(row.customer_name ?? ""),
    customerEmail: String(row.customer_email ?? ""),
    customerPhone: String(row.customer_phone ?? ""),
    guardianConfirmed: Boolean(row.guardian_confirmed),
    childFirstName: (row.child_first_name as string | null) ?? null,
    requestedDate: String(row.requested_date ?? ""),
    requestedTime: (row.requested_time as string | null) ?? null,
    durationOrQty: String(row.duration_or_qty ?? ""),
    locationText: String(row.location_text ?? ""),
    notes: String(row.notes ?? ""),
    status: isBookingStatus(row.status) ? row.status : "new",
    declinedReason: (row.declined_reason as string | null) ?? null,
    priceCents: row.price_cents === null || row.price_cents === undefined ? null : Number(row.price_cents),
    priceUnit: (row.price_unit as string | null) ?? null,
    paymentRequestId: row.payment_request_id === null || row.payment_request_id === undefined ? null : Number(row.payment_request_id),
    source: String(row.source ?? "unknown"),
    createdAt: String(row.created_at ?? ""),
    handledByName: (row.handled_by_name as string | null) ?? null,
  };
}

// ---- the customer asks -----------------------------------------------------------------

// `defaultPrefix`: the letters this business's codes start with if it has
// never made a payment request (lib/paymentRequests/rules.defaultPrefix).
export async function createBooking(found: BookableOffering, input: BookingInput, defaultPrefix: string): Promise<BookingRequest> {
  // A PortPass account with this email, if there is one: the request then
  // shows in /account without a lookup by email.
  const person = await findPersonByEmail(input.customerEmail).catch(() => null);
  // Where the customer came from, by what the request itself shows (a
  // PortPass link or QR, another PortPass page). Nobody is asked.
  const resolved = resolveAttribution({ heard: null, referralCode: null, attribution: input.attribution, isNewFamily: true });
  const { data, error } = await getSupabaseAdmin().rpc("booking_request_create", {
    p: {
      organization_id: found.business.id,
      default_prefix: defaultPrefix,
      offering_id: found.offering.id,
      offering_name: found.offering.name.slice(0, 160),
      public_token: randomBytes(20).toString("hex"),
      person_id: person?.id ?? null,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      guardian_confirmed: input.guardianConfirmed,
      child_first_name: input.childFirstName,
      requested_date: input.requestedDate,
      requested_time: input.requestedTime,
      duration_or_qty: input.durationOrQty,
      location_text: input.locationText,
      notes: input.notes,
      price_cents: found.offering.priceCents,
      price_unit: found.offering.priceUnit,
      source: resolved.sourceChannel,
      utm_source: input.attribution.utmSource,
      utm_medium: input.attribution.utmMedium,
      utm_campaign: input.attribution.utmCampaign,
      referrer_host: input.attribution.referrerHost,
    },
  });
  throwIfSupabaseError(error, "Could not save the booking request");
  return toBooking(data as Row);
}

// ---- the business's side -----------------------------------------------------------------

export async function listBookings(organizationId: number): Promise<BookingRequest[]> {
  const { data, error } = await getSupabaseAdmin().from("booking_requests").select(COLUMNS).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500);
  throwIfSupabaseError(error, "Could not load booking requests");
  return ((data ?? []) as Row[]).map(toBooking);
}

export async function getBooking(organizationId: number, id: number): Promise<BookingRequest | null> {
  const { data, error } = await getSupabaseAdmin().from("booking_requests").select(COLUMNS).eq("organization_id", organizationId).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the booking request");
  return data ? toBooking(data as Row) : null;
}

// The number on the business home's Bookings card.
export async function countNewBookings(organizationId: number): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("booking_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "new");
  throwIfSupabaseError(error, "Could not count new booking requests");
  return count ?? 0;
}

export type BookingActor = { userId: string | null; name: string };

// Confirm, decline (with a reason), mark done or re-open. The update names
// the status it expects, so two people pressing at once can't both win:
// the second gets CONFLICT and is told to refresh.
export async function changeBookingStatus(organizationId: number, id: number, action: BookingAction, actor: BookingActor, reason: string | null = null): Promise<BookingRequest> {
  const current = await getBooking(organizationId, id);
  if (!current) throw new Error("NOT_FOUND");
  const next = nextStatus(current.status, action);
  if (!next) throw new Error("CONFLICT");
  if (next === "declined" && !reason) throw new Error("NEEDS_REASON");
  const now = new Date().toISOString();
  const patch: Row = { status: next, updated_at: now, handled_by_name: actor.name.slice(0, 120) };
  if (next === "confirmed") Object.assign(patch, { confirmed_at: now });
  if (next === "done") Object.assign(patch, { done_at: now });
  if (next === "declined") Object.assign(patch, { declined_at: now, declined_reason: reason });
  if (next === "new") Object.assign(patch, { declined_at: null, declined_reason: null, done_at: null, confirmed_at: null });
  const { data, error } = await getSupabaseAdmin().from("booking_requests").update(patch).eq("organization_id", organizationId).eq("id", id).eq("status", current.status).select(COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not update the booking request");
  if (!data) throw new Error("CONFLICT");
  const updated = toBooking(data as Row);
  await logAudit({ actorUserId: actor.userId, organizationId, action: `booking_request.${action}`, targetTable: "booking_requests", targetId: id, before: { status: current.status }, after: { reference: updated.referenceCode, status: updated.status, by: actor.name } });
  return updated;
}

// A payment request made from a booking (brief 17's "Request payment",
// prefilled): the booking remembers the newest one.
export async function linkBookingPaymentRequest(organizationId: number, bookingId: number, paymentRequestId: number): Promise<void> {
  const { error } = await getSupabaseAdmin().from("booking_requests").update({ payment_request_id: paymentRequestId, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", bookingId);
  throwIfSupabaseError(error, "Could not link the payment request to the booking");
}

export type BookingPayment = { id: number; referenceCode: string; status: string; totalCents: number; paidCents: number; token: string };

// The payment requests linked from a set of bookings, by request id. A
// test request is never linked; a void one is shown as void.
export async function bookingPayments(organizationId: number, bookings: Pick<BookingRequest, "paymentRequestId">[]): Promise<Map<number, BookingPayment>> {
  const ids = [...new Set(bookings.map((b) => b.paymentRequestId).filter((id): id is number => id !== null))];
  const found = new Map<number, BookingPayment>();
  if (ids.length === 0) return found;
  const { data, error } = await getSupabaseAdmin().from("payment_requests").select("id,reference_code,status,total_cents,paid_cents,public_token").eq("organization_id", organizationId).in("id", ids);
  throwIfSupabaseError(error, "Could not load the bookings' payment requests");
  for (const row of (data ?? []) as Row[]) {
    found.set(Number(row.id), { id: Number(row.id), referenceCode: String(row.reference_code), status: String(row.status), totalCents: Number(row.total_cents), paidCents: Number(row.paid_cents), token: String(row.public_token) });
  }
  return found;
}

// What "Request payment" on a confirmed booking starts from: the customer,
// one line at the offering's price on the day it was asked for, and the
// quantity the customer gave when it reads as a number.
export type BookingPrefill = {
  customer: { name: string; email: string | null; phone: string | null };
  line: { label: string; qty: number; unitCents: number } | null;
  offeringId: number | null;
  referenceCode: string;
  open: BookingPayment | null;
};

export async function prefillFromBooking(organizationId: number, bookingId: number): Promise<BookingPrefill | null> {
  const booking = await getBooking(organizationId, bookingId);
  if (!booking) return null;
  const payment = (await bookingPayments(organizationId, [booking])).get(booking.paymentRequestId ?? -1) ?? null;
  const owing = booking.status === "confirmed" || booking.status === "done";
  const unit = booking.priceCents ?? 0;
  return {
    customer: { name: booking.customerName, email: booking.customerEmail || null, phone: booking.customerPhone || null },
    line: owing && unit > 0 ? { label: `${booking.offeringName} (${booking.referenceCode})`.slice(0, 160), qty: quantityFrom(booking.durationOrQty), unitCents: unit } : null,
    offeringId: booking.offeringId,
    referenceCode: booking.referenceCode,
    open: payment && ["draft", "sent", "part_paid"].includes(payment.status) ? payment : null,
  };
}

// ---- the customer's page -----------------------------------------------------------------

export type PublicBooking = {
  booking: {
    token: string;
    referenceCode: string;
    offeringName: string;
    customerFirstName: string;
    childFirstName: string | null;
    requestedDate: string;
    requestedTime: string | null;
    durationOrQty: string;
    locationText: string;
    notes: string;
    status: BookingStatus;
    declinedReason: string | null;
    priceCents: number | null;
    priceUnit: string | null;
    createdAt: string;
  };
  business: {
    id: number;
    name: string;
    slug: string | null;
    primaryCategory: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    whatsappE164: string | null;
    phoneE164: string | null;
    publicEmail: string | null;
    isDemo: boolean;
  };
  // The payment request the business sent for this booking, once it has
  // been sent (a draft isn't the customer's to see yet).
  payment: { referenceCode: string; status: string; balanceCents: number; totalCents: number; payPath: string } | null;
};

// By token only. The page shows what the customer asked for; their own
// phone and email are left off it, because a link can be forwarded.
export async function getPublicBooking(token: string): Promise<PublicBooking | null> {
  if (!isBookingToken(token)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("booking_requests").select(COLUMNS).eq("public_token", token).maybeSingle();
  throwIfSupabaseError(error, "Could not load the booking request");
  if (!data) return null;
  const booking = toBooking(data as Row);
  const [{ data: org, error: orgError }, payments] = await Promise.all([
    db.from("organizations").select("id,name,slug,primary_category,logo_url,brand_color,whatsapp_e164,phone_e164,public_email,is_demo").eq("id", booking.organizationId).single(),
    bookingPayments(booking.organizationId, [booking]),
  ]);
  throwIfSupabaseError(orgError, "Could not load the business");
  const linked = payments.get(booking.paymentRequestId ?? -1) ?? null;
  const shown = linked && ["sent", "part_paid", "paid"].includes(linked.status) ? linked : null;
  return {
    booking: {
      token,
      referenceCode: booking.referenceCode,
      offeringName: booking.offeringName,
      customerFirstName: booking.customerName.trim().split(/\s+/)[0] ?? "",
      childFirstName: booking.childFirstName,
      requestedDate: booking.requestedDate,
      requestedTime: booking.requestedTime,
      durationOrQty: booking.durationOrQty,
      locationText: booking.locationText,
      notes: booking.notes,
      status: booking.status,
      declinedReason: booking.declinedReason,
      priceCents: booking.priceCents,
      priceUnit: booking.priceUnit,
      createdAt: booking.createdAt,
    },
    business: {
      id: Number(org!.id),
      name: String(org!.name),
      slug: (org!.slug as string | null) ?? null,
      primaryCategory: (org!.primary_category as string | null) ?? null,
      logoUrl: (org!.logo_url as string | null) ?? null,
      brandColor: (org!.brand_color as string | null) ?? null,
      whatsappE164: (org!.whatsapp_e164 as string | null) ?? null,
      phoneE164: (org!.phone_e164 as string | null) ?? null,
      publicEmail: (org!.public_email as string | null) ?? null,
      isDemo: Boolean(org!.is_demo),
    },
    payment: shown ? { referenceCode: shown.referenceCode, status: shown.status, balanceCents: Math.max(0, shown.totalCents - shown.paidCents), totalCents: shown.totalCents, payPath: `/pay/${shown.token}` } : null,
  };
}

// The customer cancels a request nobody has answered yet. Once the
// business has confirmed, changing it is a conversation with the business.
export async function cancelBookingByCustomer(token: string): Promise<{ outcome: "cancelled"; booking: BookingRequest } | { outcome: "not_found" | "closed" }> {
  if (!isBookingToken(token)) return { outcome: "not_found" };
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("booking_requests").select(COLUMNS).eq("public_token", token).maybeSingle();
  throwIfSupabaseError(error, "Could not load the booking request");
  if (!data) return { outcome: "not_found" };
  const current = toBooking(data as Row);
  if (!customerCanCancel(current.status)) return { outcome: "closed" };
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await db.from("booking_requests").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", current.id).eq("status", "new").select(COLUMNS).maybeSingle();
  throwIfSupabaseError(updateError, "Could not cancel the booking request");
  if (!updated) return { outcome: "closed" };
  await logAudit({ organizationId: current.organizationId, action: "booking_request.cancelled_by_customer", targetTable: "booking_requests", targetId: current.id, before: { status: "new" }, after: { reference: current.referenceCode, status: "cancelled" } });
  return { outcome: "cancelled", booking: toBooking(updated as Row) };
}
