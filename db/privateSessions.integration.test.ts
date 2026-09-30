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

// Brief 06 v2, Part B and brief 13, part 4, against the local Supabase
// stack: a TEST coach posts weekly slots, a TEST parent books one with a
// priced service, the coach accepts (slot booked; the email goes to the
// reserved test domain, so nothing is ever sent), a payment is recorded
// against the PS- code and the stats count it; the per-child tiers price a
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
const SLUGS = ["private-1on1", "private-pair", "private-trio", "private-group", "private-pack-4", "birthday-party"];
const SERVICE_ROWS = [
  { slug: "private-1on1", name: "1-on-1 Session", price_cents: 8000, price_unit: "per_session", inclusions: ["45 minutes"], sort_order: 50 },
  { slug: "private-pair", name: "2-on-1 Session", price_cents: 12000, price_unit: "per_session", inclusions: ["45 minutes", "2 children"], sort_order: 51 },
  { slug: "private-trio", name: "3-on-1 Session", price_cents: 13500, price_unit: "per_session", inclusions: ["45 minutes", "3 children"], sort_order: 52 },
  { slug: "private-group", name: "Group Session (4+)", price_cents: 3500, price_unit: "per_child", inclusions: ["45 minutes", "4 to 8 children"], sort_order: 53 },
  { slug: "private-pack-4", name: "4-Session Pack", price_cents: 22000, price_unit: null, inclusions: ["Four 45-minute sessions"], sort_order: 54 },
  { slug: "birthday-party", name: "Birthday Football Party", price_cents: 30000, price_unit: null, inclusions: ["90 minutes"], sort_order: 55 },
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
    .insert({ organization_id: orgId, slug: `test-delete-coach-${crypto.randomUUID().slice(0, 6)}`, display_name: `${MARK} coach`, nickname: "Coach Test", member_type: "coach", public_visible: false, bookable: true, active: true })
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
  await db().from("offerings").update({ is_published: true }).eq("organization_id", orgId).in("slug", ["private-1on1", "private-trio", "private-group"]);
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

  it("has the six services, priced, and offers only the published ones", async () => {
    const all = await listFutprepPrivateServices();
    expect(all.map((s) => s.slug).sort()).toEqual([...SLUGS].sort());
    expect(all.find((s) => s.slug === "private-1on1")).toMatchObject({ priceCents: price["private-1on1"], durationMinutes: 45, kind: "session", minChildren: 1, maxChildren: 1 });
    expect(all.find((s) => s.slug === "birthday-party")).toMatchObject({ durationMinutes: 90, kind: "party" });
    const offered = await listFutprepPrivateServices({ publishedOnly: true });
    expect(offered.some((s) => s.slug === "private-1on1")).toBe(true);
    expect(offered.some((s) => s.slug === "private-pair")).toBe(false);
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
    const { referenceCode } = await request({ availabilityId: slotId, preferredCoachId: coachId, requestedDate: "1970-01-01", requestedStartTime: "00:00", durationMinutes: 60 });
    expect(referenceCode).toMatch(/^PS-\d{4}-[A-Z0-9]{7}$/);
    const { data } = await db().from("private_session_requests").select("id,service_slug,price_cents,children_count,availability_id,requested_date,requested_start_time,duration_minutes,status").eq("reference_code", referenceCode).single();
    expect(data).toMatchObject({ service_slug: "private-1on1", price_cents: price["private-1on1"], children_count: 1, availability_id: slotId, requested_date: "2030-01-02", requested_start_time: "4:00 PM", duration_minutes: 45, status: "pending" });
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

  it("records a payment against the PS- code and the stats count it", async () => {
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
