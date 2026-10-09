import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actOnPrivateSessionRequest,
  addWeeklyCoachSlots,
  createPrivateSessionRequest,
  listAllCoachProfiles,
  listFutprepPrivateServices,
  listPrivateSessionRequests,
  privateSessionStats,
  recordPrivateSessionPayment,
  setCoachWorkingDays,
} from "./coaches";
import { notifyNewPrivateSessionRequest, TEMPLATE } from "./privateSessionNotices";
import { SESSION_REFERENCE } from "@/lib/privateSessions";

// Brief 06 v2, Part B and brief 13, part 4, against the local Supabase
// stack: a TEST coach posts weekly slots, a TEST parent books one with a
// priced service, the coach accepts (slot booked; the email goes to the
// reserved test domain, so nothing is ever sent), a payment is recorded
// against the reference and the stats count it; the per-child tiers price a
// trio and a group of 4 to 8.
//
// Prices are never written by this test (brief 13: it must not overwrite
// live prices). It snapshots the service rows first, adds only the ones
// missing (the local stack's Futprep organisation postdates the
// migrations), switches publication on or off where a check needs it, and
// afterwards puts every snapshotted row back exactly as it was and deletes
// what it added.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const SLUGS = ["private-1on1", "private-60", "private-pair", "private-trio", "private-group", "private-pack-4", "birthday-party"];
// The rows as Futprep has them on 8 Oct 2026 (Brief 29): lengths and child
// counts on the row, where the drawer and the API now read them.
const SERVICE_ROWS = [
  { slug: "private-1on1", name: "Private session · 30 min", price_cents: 3500, price_unit: "per_session", inclusions: ["30 minutes", "1 child"], sort_order: 50, duration_minutes: 30, min_children: 1, max_children: 1 },
  { slug: "private-60", name: "Private session · 60 min", price_cents: 7000, price_unit: "per_session", inclusions: ["60 minutes", "1 child"], sort_order: 51, duration_minutes: 60, min_children: 1, max_children: 1 },
  { slug: "private-pair", name: "2-on-1 Session", price_cents: 12000, price_unit: "per_session", inclusions: ["45 minutes", "2 children"], sort_order: 51, duration_minutes: 45, min_children: 2, max_children: 2 },
  { slug: "private-trio", name: "3-on-1 Session", price_cents: 13500, price_unit: "per_session", inclusions: ["45 minutes", "3 children"], sort_order: 52, duration_minutes: 45, min_children: 3, max_children: 3 },
  { slug: "private-group", name: "Group Session (4+)", price_cents: 3500, price_unit: "per_child", inclusions: ["45 minutes", "4 to 8 children"], sort_order: 53, duration_minutes: 45, min_children: 4, max_children: 8 },
  { slug: "private-pack-4", name: "4-Session Pack", price_cents: 22000, price_unit: null, inclusions: ["Four 45-minute sessions"], sort_order: 54, duration_minutes: 45, min_children: 1, max_children: 1 },
  { slug: "birthday-party", name: "Birthday Football Party", price_cents: 30000, price_unit: null, inclusions: ["90 minutes"], sort_order: 55, duration_minutes: 90, min_children: 1, max_children: 1 },
];
type ServiceRow = { id: number; slug: string; name: string; summary: string | null; price_cents: number | null; price_unit: string | null; inclusions: string[]; sort_order: number; is_published: boolean };
let coachId = 0;
let orgId = 0;
let snapshot: ServiceRow[] = [];
let seeded: string[] = [];
const price: Record<string, number> = {};

beforeAll(async () => {
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: coach, error } = await db()
    .from("coach_profiles")
    .insert({ organization_id: orgId, slug: `test-delete-coach-${crypto.randomUUID().slice(0, 6)}`, display_name: `${MARK} coach`, nickname: "Coach Test", member_type: "coach", public_visible: true, bookable: true, active: true })
    .select("id")
    .single();
  expect(error).toBeNull();
  coachId = Number(coach!.id);

  const { data: before } = await db().from("offerings").select("id,slug,name,summary,price_cents,price_unit,inclusions,sort_order,is_published").eq("organization_id", orgId).in("slug", SLUGS);
  snapshot = (before ?? []) as ServiceRow[];
  const missing = SERVICE_ROWS.filter((s) => !snapshot.some((e) => e.slug === s.slug));
  if (missing.length) {
    const { error: seedError } = await db().from("offerings").insert(missing.map((s) => ({ ...s, organization_id: orgId, type: "service", is_published: false })));
    expect(seedError).toBeNull();
    seeded = missing.map((s) => s.slug);
  }
  const { data: rows } = await db().from("offerings").select("slug,price_cents").eq("organization_id", orgId).in("slug", SLUGS);
  for (const row of rows ?? []) price[String(row.slug)] = Number(row.price_cents);

  // Offered to parents for this test: the 1-on-1, trio and group. The pair
  // is switched off to prove an unpublished service is refused.
  await db().from("offerings").update({ is_published: true }).eq("organization_id", orgId).in("slug", ["private-1on1", "private-60", "private-trio", "private-group"]);
  await db().from("offerings").update({ is_published: false }).eq("organization_id", orgId).eq("slug", "private-pair");
});

afterAll(async () => {
  await db().from("private_session_requests").delete().like("parent_name", "TEST — delete%");
  if (coachId) await db().from("coach_profiles").delete().eq("id", coachId);
  for (const row of snapshot) {
    await db()
      .from("offerings")
      .update({ name: row.name, summary: row.summary, price_cents: row.price_cents, price_unit: row.price_unit, inclusions: row.inclusions, sort_order: row.sort_order, is_published: row.is_published })
      .eq("id", row.id);
  }
  if (orgId && seeded.length) await db().from("offerings").delete().eq("organization_id", orgId).in("slug", seeded);
});

function request(over: Partial<Parameters<typeof createPrivateSessionRequest>[0]>) {
  return createPrivateSessionRequest({
    requestType: "private_lesson",
    serviceSlug: "private-1on1",
    availabilityId: null,
    preferredCoachId: null,
    parentName: MARK,
    parentEmail: `parent-${crypto.randomUUID().slice(0, 6)}@test.portpass.local`,
    parentPhone: "+12425550100",
    childName: "TEST Child",
    childAge: 7,
    requestedDate: "2030-02-01",
    requestedStartTime: "10:00",
    durationMinutes: 45,
    locationPreference: "",
    sessionGoal: "TEST",
    notes: "",
    ...over,
  });
}

describe("private sessions (brief 06 v2, Part B)", () => {
  let slotId = 0;
  let requestId = 0;

  it("has every service of the business, with length and children from the row, and offers only the published ones", async () => {
    const all = await listFutprepPrivateServices();
    for (const slug of SLUGS) expect(all.map((s) => s.slug)).toContain(slug);
    expect(all.find((s) => s.slug === "private-1on1")).toMatchObject({ priceCents: price["private-1on1"], durationMinutes: 30, kind: "session", minChildren: 1, maxChildren: 1 });
    expect(all.find((s) => s.slug === "private-60")).toMatchObject({ priceCents: price["private-60"], durationMinutes: 60, kind: "session", requestType: "private_lesson" });
    expect(all.find((s) => s.slug === "birthday-party")).toMatchObject({ durationMinutes: 90, kind: "party", requestType: "birthday" });
    const offered = await listFutprepPrivateServices({ publishedOnly: true });
    expect(offered.some((s) => s.slug === "private-1on1")).toBe(true);
    expect(offered.some((s) => s.slug === "private-60")).toBe(true);
    expect(offered.some((s) => s.slug === "private-pair")).toBe(false);
  });

  it("books the 60 minute session at its own price and length, with a reference numbered from the business's prefix (Brief 29, part B)", async () => {
    const { referenceCode } = await request({ serviceSlug: "private-60", durationMinutes: 45 });
    expect(referenceCode).toMatch(SESSION_REFERENCE);
    const { data } = await db().from("private_session_requests").select("price_cents,duration_minutes,service_slug,request_type").eq("reference_code", referenceCode).single();
    expect(data).toEqual({ price_cents: price["private-60"], duration_minutes: 60, service_slug: "private-60", request_type: "private_lesson" });
    const { referenceCode: second } = await request({ serviceSlug: "private-1on1" });
    expect(second).toMatch(SESSION_REFERENCE);
    expect(Number(second.split("-S")[1])).toBe(Number(referenceCode.split("-S")[1]) + 1);
    const thirty = await db().from("private_session_requests").select("duration_minutes,price_cents").eq("reference_code", second).single();
    expect(thirty.data).toEqual({ duration_minutes: 30, price_cents: price["private-1on1"] });
  });

  it("lets a coach add weekly repeating slots", async () => {
    const added = await addWeeklyCoachSlots({ coachId, dayOfWeek: "Wednesday", startTime: "4:00 PM", endTime: "4:45 PM", weeks: 3, location: "TEST field", actor: "TEST", fromDate: "2030-01-01" });
    expect(added).toBe(3);
    const again = await addWeeklyCoachSlots({ coachId, dayOfWeek: "Wednesday", startTime: "4:00 PM", endTime: "4:45 PM", weeks: 3, location: "TEST field", actor: "TEST", fromDate: "2030-01-01" });
    expect(again).toBe(0);
    const { data } = await db().from("coach_availability").select("id,availability_date,status").eq("coach_id", coachId).order("availability_date");
    expect((data ?? []).map((s) => s.availability_date)).toEqual(["2030-01-02", "2030-01-09", "2030-01-16"]);
    slotId = Number(data![0].id);
  });

  it("books one of the slots with a priced service and a reference numbered from the business prefix", async () => {
    const { referenceCode } = await request({ availabilityId: slotId, preferredCoachId: coachId, requestedDate: "1970-01-01", requestedStartTime: "00:00", durationMinutes: 60 });
    expect(referenceCode).toMatch(SESSION_REFERENCE);
    const { data } = await db().from("private_session_requests").select("id,service_slug,price_cents,children_count,availability_id,requested_date,requested_start_time,duration_minutes,status").eq("reference_code", referenceCode).single();
    expect(data).toMatchObject({ service_slug: "private-1on1", price_cents: price["private-1on1"], children_count: 1, availability_id: slotId, requested_date: "2030-01-02", requested_start_time: "4:00 PM", duration_minutes: 30, status: "pending" });
    requestId = Number(data!.id);
  });

  it("refuses an unpublished service", async () => {
    await expect(request({ serviceSlug: "private-pair" })).rejects.toThrow("SERVICE_NOT_AVAILABLE");
  });

  it("accepting books the slot", async () => {
    await actOnPrivateSessionRequest({ id: requestId, action: "accept", coachId, actor: "TEST" });
    const { data: slot } = await db().from("coach_availability").select("status").eq("id", slotId).single();
    expect(slot!.status).toBe("booked");
    const { data: accepted } = await db().from("private_session_requests").select("status,accepted_at,assigned_coach_id").eq("id", requestId).single();
    expect(accepted).toMatchObject({ status: "accepted", assigned_coach_id: coachId });
    expect(accepted!.accepted_at).not.toBeNull();
  });

  it("records a payment against the reference and the stats count it", async () => {
    const full = price["private-1on1"];
    const before = await privateSessionStats();
    const partial = await recordPrivateSessionPayment({ requestId, amountCents: 3000, method: "cash", reference: "", recordedBy: "TEST" });
    expect(partial).toEqual({ paymentStatus: "partial", paidCents: 3000 });
    const paid = await recordPrivateSessionPayment({ requestId, amountCents: full - 3000, method: "bank_transfer", reference: "PS", recordedBy: "TEST" });
    expect(paid).toEqual({ paymentStatus: "paid", paidCents: full });
    const after = await privateSessionStats();
    expect(after.paid - before.paid).toBe(1);
    expect(after.revenueCents - before.revenueCents).toBe(full);
    const listed = (await listPrivateSessionRequests()).requests.find((r) => r.id === requestId)!;
    expect(listed).toMatchObject({ paid_cents: full, payment_status: "paid" });
  });
});

describe("private-session tiers per child (brief 13)", () => {
  it("prices a trio as one session for three children", async () => {
    const trio = (await listFutprepPrivateServices()).find((s) => s.slug === "private-trio")!;
    expect(trio).toMatchObject({ minChildren: 3, maxChildren: 3, perChildCents: Math.round(price["private-trio"] / 3) });
    const { referenceCode } = await request({ serviceSlug: "private-trio" });
    const { data } = await db().from("private_session_requests").select("price_cents,children_count").eq("reference_code", referenceCode).single();
    expect(data).toEqual({ price_cents: price["private-trio"], children_count: 3 });
  });

  it("totals a group session by the children, 4 to 8, and refuses 3", async () => {
    const group = (await listFutprepPrivateServices()).find((s) => s.slug === "private-group")!;
    expect(group).toMatchObject({ priceUnit: "per_child", minChildren: 4, maxChildren: 8, perChildCents: price["private-group"] });
    const { referenceCode } = await request({ serviceSlug: "private-group", childrenCount: 5 });
    const { data } = await db().from("private_session_requests").select("price_cents,children_count").eq("reference_code", referenceCode).single();
    expect(data).toEqual({ price_cents: 5 * price["private-group"], children_count: 5 });
    await expect(request({ serviceSlug: "private-group", childrenCount: 3 })).rejects.toThrow("CHILDREN_OUT_OF_RANGE");
    await expect(request({ serviceSlug: "private-group", childrenCount: 9 })).rejects.toThrow("CHILDREN_OUT_OF_RANGE");
  });

  it("never changes a price", async () => {
    const { data: rows } = await db().from("offerings").select("slug,price_cents").eq("organization_id", orgId).in("slug", SLUGS);
    for (const row of rows ?? []) expect(Number(row.price_cents)).toBe(price[String(row.slug)]);
  });
});

// Brief 29, part C: a suggested time must fall on one of the coach's working
// days; a posted open time is the coach's own and is not checked.
describe("a coach's working days (Brief 29, part C)", () => {
  afterAll(async () => {
    await setCoachWorkingDays(coachId, []);
  });

  it("refuses a suggested date on a day the coach does not work, with the days in the message, and accepts one that fits", async () => {
    await setCoachWorkingDays(coachId, [1, 3, 5]);
    const { data } = await db().from("coach_profiles").select("working_days").eq("id", coachId).single();
    expect(data!.working_days).toEqual([1, 3, 5]);
    // 2030-02-05 is a Tuesday; 2030-02-04 a Monday.
    await expect(request({ preferredCoachId: coachId, requestedDate: "2030-02-05" })).rejects.toThrow(/^COACH_DAY_OFF\|.*works Mondays, Wednesdays and Fridays\. Pick one of those days\.$/);
    const monday = await request({ preferredCoachId: coachId, requestedDate: "2030-02-04" });
    expect(monday.referenceCode).toBeTruthy();
    // No preferred coach: no rule to apply.
    const any = await request({ preferredCoachId: null, requestedDate: "2030-02-05" });
    expect(any.referenceCode).toBeTruthy();
    // No rule: any day.
    await setCoachWorkingDays(coachId, []);
    const tuesday = await request({ preferredCoachId: coachId, requestedDate: "2030-02-05" });
    expect(tuesday.referenceCode).toBeTruthy();
    const listed = await listAllCoachProfiles();
    expect(listed.coaches.find((c) => c.id === coachId)?.working_days).toEqual([]);
  });
});

// Brief 29, part A: every send is a Messages-log line and every state change
// an event. The parent is a test address and the TEST coach has no login,
// so nothing leaves; the lines say so.
describe("private-session emails and events (Brief 29, part A)", () => {
  const since = new Date().toISOString();
  const lines = async (template: string) => (await db().from("message_log").select("recipient,status,detail").eq("template", template).gte("created_at", since)).data ?? [];
  // The decision emails go out after the answer (afterResponse); outside a
  // request that is a promise nobody awaits, so give it a moment.
  const linesSoon = async (template: string, atLeast = 1) => {
    for (let i = 0; i < 40; i += 1) {
      const found = await lines(template);
      if (found.length >= atLeast) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return lines(template);
  };

  afterAll(async () => {
    await db().from("message_log").delete().like("template", "futprep_private_session_%").gte("created_at", since);
  });

  it("writes a created event on the request itself", async () => {
    const { id } = await request({ preferredCoachId: coachId });
    const { data: events } = await db().from("private_session_events").select("action,actor_account,note").eq("request_id", id);
    expect(events).toEqual([{ action: "created", actor_account: "parent", note: expect.stringContaining("2030-02-01") }]);
  });

  it("tells the parent, the coach and the owner, and logs each as a line: skipped here, since nobody has a real address", async () => {
    const parentEmail = `parent-${crypto.randomUUID().slice(0, 6)}@test.portpass.local`;
    const { id } = await request({ preferredCoachId: coachId, parentEmail });
    const sent = await notifyNewPrivateSessionRequest(id);
    expect(sent).toBe(0);
    const parent = await lines(TEMPLATE.parentReceived);
    expect(parent).toEqual([{ recipient: parentEmail, status: "skipped", detail: "A test address: never emailed." }]);
    const staff = await lines(TEMPLATE.staffNew);
    expect(staff).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipient: `${MARK} coach`, status: "skipped", detail: "No email address on this coach's staff account." }),
      expect.objectContaining({ recipient: "(no owner on file)", status: "skipped" }),
    ]));
    expect(JSON.stringify(staff)).not.toContain("TEST Child");
  });

  it("with no preferred coach, every bookable coach is told", async () => {
    const { id } = await request({ preferredCoachId: null });
    await notifyNewPrivateSessionRequest(id);
    const staff = await lines(TEMPLATE.staffNew);
    expect(staff.filter((l) => l.recipient === `${MARK} coach`).length).toBeGreaterThanOrEqual(2);
  });

  it("tells the parent on a decline and a referral, and logs each", async () => {
    const parentEmail = `parent-${crypto.randomUUID().slice(0, 6)}@test.portpass.local`;
    const { id } = await request({ preferredCoachId: coachId, parentEmail });
    await actOnPrivateSessionRequest({ id, action: "decline", reason: "TEST: coach away", actor: "TEST" });
    expect(await linesSoon(TEMPLATE.parentDeclined)).toEqual([{ recipient: parentEmail, status: "skipped", detail: "A test address: never emailed." }]);
    // A second decline of the same request says nothing again.
    await actOnPrivateSessionRequest({ id, action: "decline", reason: "TEST: again", actor: "TEST" });
    await new Promise((r) => setTimeout(r, 300));
    expect(await lines(TEMPLATE.parentDeclined)).toHaveLength(1);
    const second = await request({ preferredCoachId: coachId, parentEmail });
    await actOnPrivateSessionRequest({ id: second.id, action: "refer", coachId, targetCoachId: coachId, reason: "TEST note", actor: "TEST" });
    expect(await linesSoon(TEMPLATE.parentReferred)).toEqual([{ recipient: parentEmail, status: "skipped", detail: "A test address: never emailed." }]);
    const { data: events } = await db().from("private_session_events").select("action").eq("request_id", second.id).order("id");
    expect(events?.map((e) => e.action)).toEqual(["created", "refer"]);
    const { data: declinedEvents } = await db().from("private_session_events").select("action").eq("request_id", id).order("id");
    expect(declinedEvents?.map((e) => e.action)).toEqual(["created", "decline", "decline"]);
  });
});
