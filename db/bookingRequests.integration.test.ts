import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/bookings/route";
import { POST as customerPost } from "@/app/api/bookings/[token]/route";
import { sendEmail } from "@/lib/email";
import { listAccountBookings } from "./accountBookings";
import { listAdminBookings } from "./adminBookings";
import { bookingPayments, cancelBookingByCustomer, changeBookingStatus, countNewBookings, getBookableOffering, getBooking, getPublicBooking, linkBookingPaymentRequest, listBookings, prefillFromBooking } from "./bookingRequests";
import { createPaymentRequest } from "./paymentRequests";

// Booking requests (brief 19, part A) against CI's local Supabase stack: a
// TEST business with priced offerings is asked for a date through the real
// route, its team confirms, declines and marks done, the customer cancels,
// and a payment request is made from a confirmed booking. Another business
// can't reach any of it, and the customer's page never shows their phone
// or email. No email leaves: sendEmail is replaced, and every address is
// on the reserved test domain anyway. Every row is "TEST — delete" and
// removed with its business.
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/email")>()), sendEmail: vi.fn(async () => "sent" as const) }));

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
const SLUG = `test-delete-booth-${TAG}`;
const HIDDEN_SLUG = `test-delete-booth-hidden-${TAG}`;
const OTHER_SLUG = `test-delete-booth-other-${TAG}`;
const BOOTH = `booth-${TAG}`;
const KIDS = `kids-party-${TAG}`;
const LINKED = `linked-${TAG}`;
const DRAFT = `draft-${TAG}`;
const UNPRICED = `unpriced-${TAG}`;
const ACTOR = { userId: null, name: "TEST delete Owner" };
let orgId = 0;
let otherOrgId = 0;
let boothOfferingId = 0;
let ip = 0;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
const email = () => `booking-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`;

function post(payload: Record<string, unknown>) {
  ip += 1;
  return POST(new Request("https://portpass.test/api/bookings", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.19.0.${ip}` }, body: JSON.stringify(payload) }));
}

const payload = (over: Record<string, unknown> = {}) => ({
  organizationSlug: SLUG,
  offeringSlug: BOOTH,
  requestedDate: day(12),
  requestedTime: "18:00",
  durationOrQty: "3 hours",
  locationText: "TEST delete, Sandyport",
  notes: "TEST — delete.",
  customerName: "TEST delete Customer",
  customerPhone: "242-555-0161",
  customerEmail: email(),
  ...over,
});

async function ask(over: Record<string, unknown> = {}) {
  const body = payload(over);
  const response = await post(body);
  const data = (await response.json()) as { referenceCode?: string; bookingUrl?: string; error?: string; field?: string };
  if (response.status !== 201) throw new Error(`Expected 201, got ${response.status}: ${data.error}`);
  const token = data.bookingUrl!.split("/").pop()!;
  const { data: row } = await db.from("booking_requests").select("*").eq("public_token", token).single();
  return { body, token, referenceCode: data.referenceCode!, row: row as Record<string, unknown>, id: Number(row!.id) };
}

beforeAll(async () => {
  const business = (extra: Record<string, unknown>) => ({ primary_category: "entertainment", status: "approved", one_liner: "TEST — delete.", brand_color: "#0E7C86", ...extra });
  const { data: orgs, error } = await db
    .from("organizations")
    .insert([business({ name: `TEST delete ${TAG} Booth`, slug: SLUG }), business({ name: `TEST delete ${TAG} Hidden`, slug: HIDDEN_SLUG }), business({ name: `TEST delete ${TAG} Other`, slug: OTHER_SLUG })])
    .select("id,slug");
  if (error || !orgs) throw new Error(`Could not seed the TEST businesses: ${error?.message}`);
  orgId = Number(orgs.find((o) => o.slug === SLUG)!.id);
  otherOrgId = Number(orgs.find((o) => o.slug === OTHER_SLUG)!.id);
  const hiddenOrgId = Number(orgs.find((o) => o.slug === HIDDEN_SLUG)!.id);
  const offering = (organization_id: number, slug: string, extra: Record<string, unknown> = {}) => ({ organization_id, type: "service", slug, name: `TEST ${slug}`, price_cents: 15000, price_unit: "per_hour", is_published: true, ...extra });
  const { data: offerings, error: offeringError } = await db
    .from("offerings")
    .insert([
      offering(orgId, BOOTH),
      offering(orgId, KIDS, { price_unit: "per_child", price_cents: 2500, age_min: 4, age_max: 12 }),
      offering(orgId, LINKED, { action_url: "https://wa.me/12425550100" }),
      offering(orgId, DRAFT, { is_published: false }),
      offering(orgId, UNPRICED, { price_cents: null, price_unit: null }),
      // A priced, published offering of a business whose page isn't public.
      offering(hiddenOrgId, BOOTH),
    ])
    .select("id,slug,organization_id");
  if (offeringError || !offerings) throw new Error(`Could not seed the TEST offerings: ${offeringError?.message}`);
  boothOfferingId = Number(offerings.find((o) => o.slug === BOOTH && Number(o.organization_id) === orgId)!.id);
  const live = await db.from("organizations").update({ is_published: true, status: "live" }).eq("id", orgId);
  if (live.error) throw new Error(`Could not publish the TEST business: ${live.error.message}`);
  // Its own letters, so the codes below are known.
  const settings = await db.from("organization_payment_settings").insert({ organization_id: orgId, reference_prefix: "TB" });
  if (settings.error) throw new Error(`Could not seed the payment settings: ${settings.error.message}`);
});

afterAll(async () => {
  const ids = [orgId, otherOrgId].filter(Boolean);
  const { data: hidden } = await db.from("organizations").select("id").eq("slug", HIDDEN_SLUG).maybeSingle();
  if (hidden) ids.push(Number(hidden.id));
  for (const id of ids) {
    await db.from("organizations").update({ is_published: false }).eq("id", id);
    await db.from("booking_requests").delete().eq("organization_id", id);
    await db.from("payment_requests").delete().eq("organization_id", id);
    await db.from("offerings").delete().eq("organization_id", id);
    await db.from("organization_payment_settings").delete().eq("organization_id", id);
    await db.from("audit_log").delete().eq("organization_id", id);
    const { error } = await db.from("organizations").delete().eq("id", id);
    expect(error).toBeNull();
  }
});

describe("what can be asked for", () => {
  it("a published, priced offering with no link of its own, of a public business", async () => {
    const found = await getBookableOffering(SLUG, BOOTH);
    expect(found?.offering).toMatchObject({ slug: BOOTH, priceCents: 15000, priceUnit: "per_hour", forChildren: false });
    expect((await getBookableOffering(SLUG, KIDS))?.offering.forChildren).toBe(true);
  });

  it("not an offering with a link, a draft or one with no price", async () => {
    for (const slug of [LINKED, DRAFT, UNPRICED, "no-such-offering"]) expect(await getBookableOffering(SLUG, slug), slug).toBeNull();
  });

  it("not a business whose page isn't public, one that doesn't exist, or Futprep", async () => {
    expect(await getBookableOffering(HIDDEN_SLUG, BOOTH)).toBeNull();
    expect(await getBookableOffering("no-such-business", BOOTH)).toBeNull();
    expect(await getBookableOffering("futprep", "private-session")).toBeNull();
    expect(await getBookableOffering("Robert'); drop table offerings;--", BOOTH)).toBeNull();
  });

  it("the route answers 404 for each of them, and saves nothing", async () => {
    for (const over of [{ offeringSlug: LINKED }, { offeringSlug: DRAFT }, { offeringSlug: UNPRICED }, { organizationSlug: HIDDEN_SLUG }, { organizationSlug: "futprep" }]) {
      const response = await post(payload(over));
      expect(response.status, JSON.stringify(over)).toBe(404);
    }
    const { count } = await db.from("booking_requests").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(count).toBe(0);
  });
});

describe("the customer asks", () => {
  it("says which field is wrong, and saves nothing", async () => {
    const response = await post(payload({ requestedDate: day(-1) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "requestedDate" });
    const noEmail = await post(payload({ customerEmail: "not an email" }));
    expect(await noEmail.json()).toMatchObject({ field: "customerEmail" });
  });

  it("saves the request with the business's next code, the price on the day, and where the customer came from", async () => {
    vi.mocked(sendEmail).mockClear();
    const first = await ask({ attribution: { utmSource: "portpass", utmMedium: "qr", utmCampaign: `test-${TAG}`, referrerHost: null, viaPortpass: false } });
    expect(first.referenceCode).toBe("TB-B0001");
    expect(first.token).toMatch(/^[a-f0-9]{40}$/);
    expect(first.row).toMatchObject({
      organization_id: orgId,
      offering_id: boothOfferingId,
      offering_name: `TEST ${BOOTH}`,
      status: "new",
      price_cents: 15000,
      price_unit: "per_hour",
      customer_phone: "+12425550161",
      customer_email: first.body.customerEmail,
      requested_date: first.body.requestedDate,
      requested_time: "18:00",
      duration_or_qty: "3 hours",
      guardian_confirmed: false,
      child_first_name: null,
      source: "qr",
      utm_source: "portpass",
      utm_medium: "qr",
      payment_request_id: null,
    });
    const second = await ask();
    expect(second.referenceCode).toBe("TB-B0002");
    expect(second.row.source).toBe("unknown");

    // One email to the customer, from the business via PortPass. (The TEST
    // business has no owner account, so nobody else is written to.)
    await vi.waitFor(() => expect(vi.mocked(sendEmail).mock.calls.length).toBeGreaterThanOrEqual(2));
    const sent = vi.mocked(sendEmail).mock.calls.map(([input]) => input);
    const toFirst = sent.filter((input) => input.to === first.body.customerEmail);
    expect(toFirst).toHaveLength(1);
    expect(toFirst[0].subject).toContain("TB-B0001");
    expect(toFirst[0].html).toContain(`/booking/${first.token}`);
    expect(toFirst[0].log).toEqual({ template: "booking_request_received", organizationId: orgId });
  });

  it("for an under-18s offering, needs the guardian's tick and keeps the child's first name only", async () => {
    const missing = await post(payload({ offeringSlug: KIDS }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ field: "childFirstName" });
    const { row } = await ask({ offeringSlug: KIDS, childFirstName: "Maya TEST-delete Rolle", guardianConfirmed: true, durationOrQty: "8 children" });
    expect(row).toMatchObject({ child_first_name: "Maya", guardian_confirmed: true, price_cents: 2500, price_unit: "per_child" });
  });
});

describe("the customer's page", () => {
  it("shows what was asked for, and never the customer's phone or email", async () => {
    const { token, body, referenceCode } = await ask({ customerName: "Dana TEST-delete Rolle" });
    const view = await getPublicBooking(token);
    expect(view?.booking).toMatchObject({ referenceCode, status: "new", offeringName: `TEST ${BOOTH}`, customerFirstName: "Dana", priceCents: 15000, requestedDate: body.requestedDate });
    expect(view?.business).toMatchObject({ id: orgId, slug: SLUG, primaryCategory: "entertainment", isDemo: false });
    expect(view?.payment).toBeNull();
    const text = JSON.stringify(view);
    expect(text).not.toContain(body.customerEmail);
    expect(text).not.toContain("2425550161");
    expect(text).not.toContain("Rolle");
  });

  it("is found by the whole token only", async () => {
    const { token } = await ask();
    expect(await getPublicBooking(token.slice(0, 39))).toBeNull();
    expect(await getPublicBooking(`${token.slice(0, 39)}${token.endsWith("0") ? "1" : "0"}`)).toBeNull();
    expect(await getPublicBooking("%")).toBeNull();
  });

  it("the customer can cancel while nobody has answered, and not after", async () => {
    const waiting = await ask();
    const cancelled = await customerPost(new Request(`https://portpass.test/api/bookings/${waiting.token}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.19.1.1" }, body: JSON.stringify({ action: "cancel" }) }), { params: Promise.resolve({ token: waiting.token }) });
    expect(cancelled.status).toBe(200);
    expect((await getBooking(orgId, waiting.id))?.status).toBe("cancelled");
    // Again: it is already closed.
    expect((await cancelBookingByCustomer(waiting.token)).outcome).toBe("closed");

    const answered = await ask();
    await changeBookingStatus(orgId, answered.id, "confirm", ACTOR);
    expect((await cancelBookingByCustomer(answered.token)).outcome).toBe("closed");
    expect((await getBooking(orgId, answered.id))?.status).toBe("confirmed");
    expect((await cancelBookingByCustomer("f".repeat(40))).outcome).toBe("not_found");
    expect((await cancelBookingByCustomer("nope")).outcome).toBe("not_found");
  });
});

describe("the business answers", () => {
  it("lists its own requests and counts the new ones", async () => {
    const before = await countNewBookings(orgId);
    const { id } = await ask();
    expect(await countNewBookings(orgId)).toBe(before + 1);
    expect((await listBookings(orgId)).some((b) => b.id === id)).toBe(true);
    expect(await listBookings(otherOrgId)).toEqual([]);
    expect(await countNewBookings(otherOrgId)).toBe(0);
  });

  it("confirms, marks done and re-opens, and each change is logged", async () => {
    const { id, referenceCode } = await ask();
    const confirmed = await changeBookingStatus(orgId, id, "confirm", ACTOR);
    expect(confirmed).toMatchObject({ status: "confirmed", handledByName: "TEST delete Owner" });
    // Pressed twice, or by two people: the second is told it has changed.
    await expect(changeBookingStatus(orgId, id, "confirm", ACTOR)).rejects.toThrow("CONFLICT");
    expect((await changeBookingStatus(orgId, id, "done", ACTOR)).status).toBe("done");
    expect((await changeBookingStatus(orgId, id, "reopen", ACTOR)).status).toBe("new");
    const { data: row } = await db.from("booking_requests").select("confirmed_at,done_at").eq("id", id).single();
    expect(row).toEqual({ confirmed_at: null, done_at: null });
    const { data: audit } = await db.from("audit_log").select("action,after").eq("organization_id", orgId).eq("target_table", "booking_requests").eq("target_id", String(id)).order("id", { ascending: true });
    expect((audit ?? []).map((a) => a.action)).toEqual(["booking_request.confirm", "booking_request.done", "booking_request.reopen"]);
    expect((audit ?? [])[0].after).toMatchObject({ reference: referenceCode, status: "confirmed", by: "TEST delete Owner" });
  });

  it("declines only with a reason, which the customer's page then shows", async () => {
    const { id, token } = await ask();
    await expect(changeBookingStatus(orgId, id, "decline", ACTOR)).rejects.toThrow("NEEDS_REASON");
    expect((await getBooking(orgId, id))?.status).toBe("new");
    const declined = await changeBookingStatus(orgId, id, "decline", ACTOR, "TEST — fully booked that day");
    expect(declined).toMatchObject({ status: "declined", declinedReason: "TEST — fully booked that day" });
    expect((await getPublicBooking(token))?.booking).toMatchObject({ status: "declined", declinedReason: "TEST — fully booked that day" });
  });

  it("another business can't read or change it", async () => {
    const { id } = await ask();
    expect(await getBooking(otherOrgId, id)).toBeNull();
    await expect(changeBookingStatus(otherOrgId, id, "confirm", ACTOR)).rejects.toThrow("NOT_FOUND");
    await expect(changeBookingStatus(otherOrgId, id, "decline", ACTOR, "TEST — not ours")).rejects.toThrow("NOT_FOUND");
    expect(await prefillFromBooking(otherOrgId, id)).toBeNull();
    expect((await getBooking(orgId, id))?.status).toBe("new");
  });
});

describe("a payment request from a confirmed booking", () => {
  it("starts from the offering's price and the quantity asked for, and the customer's page shows it once sent", async () => {
    const { id, token, body } = await ask({ durationOrQty: "3 hours" });
    // Nothing to ask for until it's confirmed.
    expect((await prefillFromBooking(orgId, id))?.line).toBeNull();
    await changeBookingStatus(orgId, id, "confirm", ACTOR);
    const prefill = await prefillFromBooking(orgId, id);
    expect(prefill).toMatchObject({ customer: { name: "TEST delete Customer", email: body.customerEmail, phone: "+12425550161" }, offeringId: boothOfferingId, open: null });
    expect(prefill?.line).toMatchObject({ qty: 3, unitCents: 15000 });
    expect(prefill?.line?.label).toContain(`TEST ${BOOTH}`);

    const request = await createPaymentRequest(
      orgId,
      { customerName: prefill!.customer.name, customerEmail: prefill!.customer.email, customerPhone: prefill!.customer.phone, personId: null, lines: [prefill!.line!], totalCents: 45000, dueDate: day(7), allowPartPayment: false, methods: ["cash"], offeringId: boothOfferingId, registrationId: null, privateSessionRequestId: null, reservationId: null },
      ACTOR,
      "TB",
    );
    await linkBookingPaymentRequest(orgId, id, request.id);
    const booking = await getBooking(orgId, id);
    expect(booking?.paymentRequestId).toBe(request.id);
    expect((await bookingPayments(orgId, [booking!])).get(request.id)).toMatchObject({ referenceCode: request.referenceCode, status: "draft", totalCents: 45000, paidCents: 0 });
    // Already open: the screen warns before a second one is made.
    expect((await prefillFromBooking(orgId, id))?.open?.id).toBe(request.id);
    // A draft isn't the customer's to see yet.
    expect((await getPublicBooking(token))?.payment).toBeNull();
    await db.from("payment_requests").update({ sent_at: new Date().toISOString(), sent_via: "link" }).eq("id", request.id);
    expect((await getPublicBooking(token))?.payment).toMatchObject({ referenceCode: request.referenceCode, status: "sent", balanceCents: 45000, payPath: `/pay/${request.publicToken}` });
    // Another business can't hang its request on this booking.
    await linkBookingPaymentRequest(otherOrgId, id, 999_999_999);
    expect((await getBooking(orgId, id))?.paymentRequestId).toBe(request.id);
  });
});

describe("where else a booking request shows", () => {
  it("in the customer's PortPass account, by their email, with a link to their page", async () => {
    const { token, body, referenceCode } = await ask();
    const { bookings } = await listAccountBookings(String(body.customerEmail));
    const mine = bookings.filter((b) => b.kind === "Booking request");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ business: `TEST delete ${TAG} Booth`, status: "waiting for a reply", href: `/booking/${token}` });
    expect(mine[0].what).toContain(`TEST ${BOOTH}`);
    expect(mine[0].key).toContain(referenceCode);
    expect((await listAccountBookings(email())).bookings).toEqual([]);
  });

  it("in Admin -> Bookings, with no amounts (the money is on the payment request)", async () => {
    const { id, referenceCode } = await ask();
    const listed = await listAdminBookings({ organizationId: orgId, kind: "booking_request" });
    const row = listed.find((b) => b.id === id);
    expect(row).toMatchObject({ kind: "booking_request", reference: referenceCode, organizationId: orgId, status: "new", dueCents: null, paidCents: null, paymentStatus: null });
    expect(listed.every((b) => b.kind === "booking_request")).toBe(true);
    expect((await listAdminBookings({ organizationId: otherOrgId, kind: "booking_request" }))).toEqual([]);
  });
});

describe("security: booking requests are server-only", () => {
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  it.skipIf(!anonKey)("a browser key can't read, write or call the create function", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, anonKey!, { auth: { persistSession: false } });
    const read = await anon.from("booking_requests").select("id").limit(1);
    expect(read.data ?? []).toEqual([]);
    const write = await anon.from("booking_requests").insert({ organization_id: orgId, offering_name: "TEST", reference_number: 9999, reference_code: "TB-B9999", public_token: "a".repeat(40), customer_name: "TEST", customer_email: "t@test.portpass.local", customer_phone: "+12425550100", requested_date: day(3) });
    expect(write.error).not.toBeNull();
    const call = await anon.rpc("booking_request_create", { p: { organization_id: orgId } });
    expect(call.error).not.toBeNull();
  });

  it("the database refuses a decline without a reason, and a malformed code or token", async () => {
    const { id } = await ask();
    expect((await db.from("booking_requests").update({ status: "declined" }).eq("id", id)).error).not.toBeNull();
    expect((await db.from("booking_requests").update({ reference_code: "TB-0001" }).eq("id", id)).error).not.toBeNull();
    expect((await db.from("booking_requests").update({ public_token: "short" }).eq("id", id)).error).not.toBeNull();
    expect((await db.from("booking_requests").update({ status: "paid" }).eq("id", id)).error).not.toBeNull();
  });
});
