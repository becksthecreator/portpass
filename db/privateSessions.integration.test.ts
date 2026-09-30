import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actOnPrivateSessionRequest,
  addWeeklyCoachSlots,
  createPrivateSessionRequest,
  listFutprepPrivateServices,
  listPrivateSessionRequests,
  privateSessionStats,
  recordPrivateSessionPayment,
} from "./coaches";

// Brief 06 v2, Part B acceptance against the local Supabase stack: a TEST
// coach posts weekly slots, a TEST parent books one with a priced service,
// the coach accepts (slot booked; the email goes to the reserved test
// domain, so nothing is ever sent), a payment is recorded against the PS-
// code and the stats count it. Everything is deleted afterwards.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
let coachId = 0;
let orgId = 0;
let wasPublished = false;
let seeded: string[] = [];
const SERVICE_ROWS = [
  { slug: "private-1on1", name: "1-on-1 Session", price_cents: 6000, price_unit: "per_session", inclusions: ["45 minutes"], sort_order: 50 },
  { slug: "private-pair", name: "Pair Session", price_cents: 9000, price_unit: "per_session", inclusions: ["45 minutes", "2 children"], sort_order: 51 },
  { slug: "private-pack-4", name: "4-Session Pack", price_cents: 22000, price_unit: null, inclusions: ["Four 45-minute sessions"], sort_order: 52 },
  { slug: "birthday-party", name: "Birthday Football Party", price_cents: 30000, price_unit: null, inclusions: ["90 minutes"], sort_order: 53 },
];

beforeAll(async () => {
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: coach, error } = await db()
    .from("coach_profiles")
    .insert({ organization_id: orgId, slug: `test-delete-coach-${crypto.randomUUID().slice(0, 6)}`, display_name: `${MARK} coach`, nickname: "Coach Test", member_type: "coach", public_visible: false, bookable: true, active: true })
    .select("id")
    .single();
  expect(error).toBeNull();
  coachId = Number(coach!.id);
  // The local stack's Futprep organisation is created by an earlier test,
  // after migrations ran, so the migration's service rows may be missing
  // here; add the same four (unpublished) if so. Production has them from
  // 202610010003_private_sessions_bookable.sql.
  const { data: existing } = await db().from("offerings").select("slug").eq("organization_id", orgId).in("slug", SERVICE_ROWS.map((s) => s.slug));
  const missing = SERVICE_ROWS.filter((s) => !(existing ?? []).some((e) => e.slug === s.slug));
  if (missing.length) {
    const { error: seedError } = await db().from("offerings").insert(missing.map((s) => ({ ...s, organization_id: orgId, type: "service", is_published: false })));
    expect(seedError).toBeNull();
    seeded = missing.map((s) => s.slug);
  }
  const { data: service } = await db().from("offerings").select("is_published").eq("organization_id", orgId).eq("slug", "private-1on1").single();
  wasPublished = Boolean(service?.is_published);
  await db().from("offerings").update({ is_published: true }).eq("organization_id", orgId).eq("slug", "private-1on1");
});

afterAll(async () => {
  await db().from("private_session_requests").delete().like("parent_name", "TEST — delete%");
  if (coachId) await db().from("coach_profiles").delete().eq("id", coachId);
  if (orgId) await db().from("offerings").update({ is_published: wasPublished }).eq("organization_id", orgId).eq("slug", "private-1on1");
  if (orgId && seeded.length) await db().from("offerings").delete().eq("organization_id", orgId).in("slug", seeded);
});

describe("private sessions (brief 06 v2, Part B)", () => {
  let slotId = 0;
  let requestId = 0;

  it("has the four services with prices, unpublished until confirmed", async () => {
    const all = await listFutprepPrivateServices();
    expect(all.map((s) => s.slug).sort()).toEqual(["birthday-party", "private-1on1", "private-pack-4", "private-pair"]);
    expect(all.find((s) => s.slug === "private-1on1")).toMatchObject({ priceCents: 6000, durationMinutes: 45, kind: "session" });
    expect(all.find((s) => s.slug === "birthday-party")).toMatchObject({ priceCents: 30000, durationMinutes: 90, kind: "party" });
    // Only the one this test switched on is offered to parents.
    expect((await listFutprepPrivateServices({ publishedOnly: true })).some((s) => s.slug === "private-pair")).toBe(false);
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

  it("books one of the slots with a priced service and a PS- code", async () => {
    const { referenceCode } = await createPrivateSessionRequest({
      requestType: "private_lesson",
      serviceSlug: "private-1on1",
      availabilityId: slotId,
      preferredCoachId: coachId,
      parentName: MARK,
      parentEmail: `parent-${crypto.randomUUID().slice(0, 6)}@test.portpass.local`,
      parentPhone: "+12425550100",
      childName: "TEST Child",
      childAge: 7,
      requestedDate: "1970-01-01",
      requestedStartTime: "00:00",
      durationMinutes: 60,
      locationPreference: "",
      sessionGoal: "TEST",
      notes: "",
    });
    expect(referenceCode).toMatch(/^PS-\d{4}-[A-Z0-9]{7}$/);
    const { data } = await db().from("private_session_requests").select("id,service_slug,price_cents,availability_id,requested_date,requested_start_time,duration_minutes,status").eq("reference_code", referenceCode).single();
    expect(data).toMatchObject({ service_slug: "private-1on1", price_cents: 6000, availability_id: slotId, requested_date: "2030-01-02", requested_start_time: "4:00 PM", duration_minutes: 45, status: "pending" });
    requestId = Number(data!.id);
  });

  it("refuses an unpublished service", async () => {
    await expect(createPrivateSessionRequest({ requestType: "private_lesson", serviceSlug: "private-pair", availabilityId: null, preferredCoachId: null, parentName: MARK, parentEmail: "x@test.portpass.local", parentPhone: "1", childName: "TEST", childAge: 7, requestedDate: "2030-02-01", requestedStartTime: "10:00", durationMinutes: 45, locationPreference: "", sessionGoal: "", notes: "" })).rejects.toThrow("SERVICE_NOT_AVAILABLE");
  });

  it("accepting books the slot", async () => {
    await actOnPrivateSessionRequest({ id: requestId, action: "accept", coachId, actor: "TEST" });
    const { data: slot } = await db().from("coach_availability").select("status").eq("id", slotId).single();
    expect(slot!.status).toBe("booked");
    const { data: request } = await db().from("private_session_requests").select("status,accepted_at,assigned_coach_id").eq("id", requestId).single();
    expect(request).toMatchObject({ status: "accepted", assigned_coach_id: coachId });
    expect(request!.accepted_at).not.toBeNull();
  });

  it("records a payment against the PS- code and the stats count it", async () => {
    const before = await privateSessionStats();
    const partial = await recordPrivateSessionPayment({ requestId, amountCents: 3000, method: "cash", reference: "", recordedBy: "TEST" });
    expect(partial).toEqual({ paymentStatus: "partial", paidCents: 3000 });
    const paid = await recordPrivateSessionPayment({ requestId, amountCents: 3000, method: "bank_transfer", reference: "PS", recordedBy: "TEST" });
    expect(paid).toEqual({ paymentStatus: "paid", paidCents: 6000 });
    const after = await privateSessionStats();
    expect(after.paid - before.paid).toBe(1);
    expect(after.revenueCents - before.revenueCents).toBe(6000);
    const listed = (await listPrivateSessionRequests()).requests.find((r) => r.id === requestId)!;
    expect(listed).toMatchObject({ paid_cents: 6000, payment_status: "paid" });
  });
});
