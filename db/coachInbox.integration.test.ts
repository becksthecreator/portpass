import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isoWeekday } from "@/lib/workingDays";
import { listPayLedger, listPrivatePayLines, markCoachMonthPaid, setPrivatePayRates } from "./coachPay";
import { actOnPrivateSessionRequest, createPrivateSessionRequest, getCoachDays, listPrivateSessionRequests, listPublicCoachProfiles, privateSessionOwners, setCoachDayAway } from "./coaches";
import { listPrivateSessionPlaces } from "./futprepLocations";

// Brief 31 (C) against the local Supabase stack: each coach's own inbox,
// days away and coaches who confirm a time, the place on a request, and a
// pay line when a private session is completed. TEST coaches, places and
// requests in Futprep's organisation (parents at @example.com, so nothing
// is ever sent), all deleted afterwards. Local stack only.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${tag}`;
let orgId = 0;
let coachA = 0; // works Mon, Wed, Fri; rates set
let coachB = 0; // no working days, no rates
let placeOk = 0;
let placeOff = 0;
const requestIds: number[] = [];

// The next Monday at least a week away, and the Monday after it.
function monday(weeksOut: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * weeksOut);
  while (isoWeekday(d.toISOString().slice(0, 10)) !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const away = monday(1);
const working = monday(2);

async function ask(input: { coachId: number | null; date?: string; minutes?: number; locationId?: number | null; place?: string }) {
  const created = await createPrivateSessionRequest({
    requestType: "private_lesson",
    preferredCoachId: input.coachId,
    parentName: `${MARK} Parent`,
    parentEmail: `test-delete-parent-${tag}@example.com`,
    parentPhone: "242-555-0101",
    childName: `${MARK} Child`,
    childAge: 8,
    requestedDate: input.date ?? working,
    requestedStartTime: "16:00",
    durationMinutes: input.minutes ?? 60,
    locationPreference: input.place ?? "",
    locationId: input.locationId ?? null,
    sessionGoal: "TEST first touch",
    notes: "TEST note",
  });
  requestIds.push(created.id);
  return created.id;
}

beforeAll(async () => {
  const url = process.env.SUPABASE_URL ?? "";
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to run against anything but a local Supabase stack.");
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: coaches, error } = await db()
    .from("coach_profiles")
    .insert([
      { organization_id: orgId, slug: `test-delete-a-${tag}`, display_name: `${MARK} Coach A`, member_type: "coach", active: true, public_visible: true, bookable: true, working_days: [1, 3, 5], private_30_pay_cents: 2000, private_60_pay_cents: 3500 },
      { organization_id: orgId, slug: `test-delete-b-${tag}`, display_name: `${MARK} Coach B`, member_type: "coach", active: true, public_visible: true, bookable: true, working_days: [] },
    ])
    .select("id,display_name");
  expect(error).toBeNull();
  coachA = Number(coaches!.find((c) => c.display_name.endsWith("Coach A"))!.id);
  coachB = Number(coaches!.find((c) => c.display_name.endsWith("Coach B"))!.id);
  const { data: places, error: placeError } = await db()
    .from("locations")
    .insert([
      { organization_id: orgId, name: `${MARK} field`, address: "TEST address", active: true, private_sessions_ok: true, cost_model: "per_hour", cost_cents: 4000 },
      { organization_id: orgId, name: `${MARK} school`, address: "TEST address", active: true, private_sessions_ok: false },
    ])
    .select("id,name");
  expect(placeError).toBeNull();
  placeOk = Number(places!.find((p) => p.name.endsWith("field"))!.id);
  placeOff = Number(places!.find((p) => p.name.endsWith("school"))!.id);
});

afterAll(async () => {
  if (requestIds.length) {
    await db().from("private_session_pay").delete().in("request_id", requestIds);
    await db().from("private_session_events").delete().in("request_id", requestIds);
    await db().from("private_session_requests").delete().in("id", requestIds);
  }
  const coaches = [coachA, coachB].filter(Boolean);
  if (coaches.length) {
    await db().from("coach_availability").delete().in("coach_id", coaches);
    await db().from("audit_log").delete().eq("target_table", "coach_profiles").in("target_id", coaches.map(String));
    await db().from("coach_profiles").delete().in("id", coaches);
  }
  await db().from("audit_log").delete().in("action", ["futprep.private_session_pay", "futprep.coach_pay_marked_paid"]).like("after->>by", "TEST — delete%");
  await db().from("locations").delete().in("id", [placeOk, placeOff].filter(Boolean));
});

describe("each coach's own inbox (brief 31, C1)", () => {
  it("a coach's list holds only their own requests; the desk's holds every one", async () => {
    const forA = await ask({ coachId: coachA });
    const forB = await ask({ coachId: coachB });
    const anyCoach = await ask({ coachId: null });
    const ids = (rows: Array<{ id: number }>) => rows.map((r) => Number(r.id)).filter((id) => requestIds.includes(id));
    expect(ids((await listPrivateSessionRequests({ coachId: coachA })).requests)).toEqual([forA]);
    expect(ids((await listPrivateSessionRequests({ coachId: coachB })).requests)).toEqual([forB]);
    expect(ids((await listPrivateSessionRequests()).requests).sort()).toEqual([forA, forB, anyCoach].sort());
    expect(await privateSessionOwners(forA)).toEqual({ preferred_coach_id: coachA, assigned_coach_id: null });
  });

  it("refers only to one of Futprep's active coaches", async () => {
    const id = await ask({ coachId: coachA });
    const { data: stranger } = await db().from("coach_profiles").insert({ organization_id: orgId, slug: `test-delete-off-${tag}`, display_name: `${MARK} Coach Off`, member_type: "coach", active: false, public_visible: false, bookable: false }).select("id").single();
    await expect(actOnPrivateSessionRequest({ id, action: "refer", coachId: coachA, targetCoachId: Number(stranger!.id), reason: "TEST", actor: MARK })).rejects.toThrow("COACH_NOT_AVAILABLE");
    await db().from("coach_profiles").delete().eq("id", stranger!.id);
  });

  it("a request referred to another coach shows in both coaches' lists", async () => {
    const id = await ask({ coachId: coachA });
    await actOnPrivateSessionRequest({ id, action: "refer", coachId: coachA, targetCoachId: coachB, reason: "TEST", actor: MARK });
    const inB = (await listPrivateSessionRequests({ coachId: coachB })).requests.map((r) => Number(r.id));
    const inA = (await listPrivateSessionRequests({ coachId: coachA })).requests.map((r) => Number(r.id));
    expect(inB).toContain(id);
    expect(inA).toContain(id);
  });
});

describe("days away and coaches who confirm a time (brief 31, C2 and C3)", () => {
  it("refuses a suggested time on a coach's day away, and closes that day's open times", async () => {
    await db().from("coach_availability").insert({ coach_id: coachA, availability_date: away, start_time: "4:00 PM", end_time: "4:45 PM", status: "available", location: "TEST", note: "" });
    await setCoachDayAway({ coachId: coachA, date: away, away: true, actor: MARK });
    await expect(ask({ coachId: coachA, date: away })).rejects.toThrow(/^COACH_AWAY\|.*is away that day/);
    expect(await ask({ coachId: coachA, date: working })).toBeGreaterThan(0);
    // "Any coach" isn't held to one coach's days.
    expect(await ask({ coachId: null, date: away })).toBeGreaterThan(0);
    const { data: slots } = await db().from("coach_availability").select("status").eq("coach_id", coachA).eq("availability_date", away);
    expect(new Set((slots ?? []).map((s) => s.status))).toEqual(new Set(["blocked"]));
    expect((await getCoachDays(coachA))?.daysAway).toContain(away);
  });

  it("the parents' page gets a day away as a date only: no note, no place", async () => {
    await db().from("coach_availability").update({ note: "TEST private reason" }).eq("coach_id", coachA).eq("availability_date", away).eq("status", "blocked").eq("start_time", "00:00");
    const { coaches } = await listPublicCoachProfiles();
    const a = coaches.find((c) => c.id === coachA)!;
    const blocked = a.availability.filter((s) => s.status === "blocked");
    expect(blocked.length).toBeGreaterThan(0);
    expect(JSON.stringify(a.availability)).not.toContain("TEST private reason");
    for (const slot of blocked) expect(slot.location).toBe("");
  });

  it("a day can be opened again, with the open times it closed", async () => {
    await setCoachDayAway({ coachId: coachA, date: away, away: false, actor: MARK });
    expect((await getCoachDays(coachA))?.daysAway).not.toContain(away);
    const { data: slots } = await db().from("coach_availability").select("status,start_time").eq("coach_id", coachA).eq("availability_date", away);
    expect(slots).toEqual([{ status: "available", start_time: "4:00 PM" }]);
  });

  it("a request to a coach with no working days is marked: the coach confirms a time and the desk sees it", async () => {
    const toB = await ask({ coachId: coachB });
    const toA = await ask({ coachId: coachA });
    const rows = (await listPrivateSessionRequests()).requests;
    expect(rows.find((r) => Number(r.id) === toB)?.time_to_confirm).toBe(true);
    expect(rows.find((r) => Number(r.id) === toA)?.time_to_confirm).toBe(false);
  });
});

describe("the place for a private session (brief 31, C4)", () => {
  it("offers only Futprep's places that take private sessions, by name, never their cost", async () => {
    const places = await listPrivateSessionPlaces();
    expect(places.map((p) => p.id)).toContain(placeOk);
    expect(places.map((p) => p.id)).not.toContain(placeOff);
    expect(JSON.stringify(places)).not.toMatch(/cost/);
  });

  it("keeps a chosen place as its id and a suggestion as words, and refuses a place that doesn't take them", async () => {
    const chosen = await ask({ coachId: coachA, locationId: placeOk, place: "TEST ignored" });
    const suggested = await ask({ coachId: coachA, place: "TEST our garden" });
    await expect(ask({ coachId: coachA, locationId: placeOff })).rejects.toThrow("LOCATION_NOT_AVAILABLE");
    const rows = (await listPrivateSessionRequests({ coachId: coachA })).requests;
    expect(rows.find((r) => Number(r.id) === chosen)).toMatchObject({ location_id: placeOk, location_name: `${MARK} field`, location_preference: "" });
    expect(rows.find((r) => Number(r.id) === suggested)).toMatchObject({ location_id: null, location_preference: "TEST our garden" });
  });
});

describe("a completed private session is a pay line (brief 31, C5 and C6)", () => {
  it("one line at the coach's rate, once, and only for an accepted session", async () => {
    const id = await ask({ coachId: coachA, minutes: 60 });
    await expect(actOnPrivateSessionRequest({ id, action: "complete", actor: MARK })).rejects.toThrow("NOT_ACCEPTED");
    expect((await listPrivatePayLines({ coachId: coachA })).filter((l) => l.referenceCode)).toHaveLength(0);

    await actOnPrivateSessionRequest({ id, action: "accept", coachId: coachA, actor: MARK });
    // Never before the session's day.
    await expect(actOnPrivateSessionRequest({ id, action: "complete", actor: MARK })).rejects.toThrow("NOT_YET");
    await db().from("private_session_requests").update({ requested_date: new Date().toISOString().slice(0, 10) }).eq("id", id);
    await actOnPrivateSessionRequest({ id, action: "complete", actor: MARK });
    await actOnPrivateSessionRequest({ id, action: "complete", actor: MARK });
    // Completed is final.
    await expect(actOnPrivateSessionRequest({ id, action: "decline", reason: "TEST", actor: MARK })).rejects.toThrow("COMPLETED");
    const lines = await listPrivatePayLines({ coachId: coachA });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ coachId: coachA, durationMinutes: 60, payCents: 3500, basis: "rate_60", paidAt: null });
    expect(JSON.stringify(lines)).not.toContain("Child");
  });

  it("a coach with no rate gets a $0 line marked rate not set, and never another coach's lines", async () => {
    const id = await ask({ coachId: coachB, minutes: 30 });
    await actOnPrivateSessionRequest({ id, action: "accept", coachId: coachB, actor: MARK });
    await db().from("private_session_requests").update({ requested_date: new Date().toISOString().slice(0, 10) }).eq("id", id);
    await actOnPrivateSessionRequest({ id, action: "complete", actor: MARK });
    const mine = await listPrivatePayLines({ coachId: coachB });
    expect(mine).toEqual([expect.objectContaining({ payCents: 0, basis: "not_set" })]);
    expect((await listPayLedger({ coachId: coachB })).some((r) => r.kind === "private" && r.coachId === coachA)).toBe(false);
  });

  it("the ledger and Mark paid include private lines", async () => {
    const [line] = await listPrivatePayLines({ coachId: coachA });
    expect((await listPayLedger({ coachId: coachA })).filter((r) => r.kind === "private")).toEqual([expect.objectContaining({ payCents: 3500, programName: `Private session · ${line.referenceCode}` })]);
    const result = await markCoachMonthPaid({ coachId: coachA, month: line.sessionDate.slice(0, 7), actor: MARK });
    expect(result.totalCents).toBeGreaterThanOrEqual(3500);
    expect((await listPrivatePayLines({ coachId: coachA }))[0].paidAt).not.toBeNull();
  });

  it("the desk or the CEO sets private rates, audit-logged, and a bad amount is refused", async () => {
    const coach = await setPrivatePayRates({ coachId: coachB, private30Cents: 1500, private60Cents: null, actor: MARK });
    expect(coach).toMatchObject({ private30PayCents: 1500, private60PayCents: null });
    const { count } = await db().from("audit_log").select("id", { count: "exact", head: true }).eq("action", "futprep.private_pay_rates").eq("target_id", String(coachB));
    expect(Number(count)).toBe(1);
    await expect(setPrivatePayRates({ coachId: coachB, private30Cents: -1, private60Cents: null, actor: MARK })).rejects.toThrow("INVALID_RATE");
  });
});
