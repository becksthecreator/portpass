import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureDefaultLead, getSessionStaff, setSessionStaff } from "./coachPay";
import {
  actOnPrivateSessionRequest,
  addWeeklyCoachSlots,
  listPrivateSessionRequests,
  privateSessionStats,
  recordPrivateSessionPayment,
  restoreCoach,
  saveCoachAvailability,
  saveCoachProfile,
  setCoachPhoto,
  setCoachWorkingDays,
  softDeleteCoach,
} from "./coaches";
import { ensureFutprepPilotData } from "./registrations";
import { setSessionCoaches } from "./staff";

// The same rule as the registration desk (rule 3; Ponytail audit finding 1,
// PR #205), for sessions, coaches and private-session requests: Futprep's
// staff screens take these ids from the request, and every business's rows
// share one table. Against CI's local Supabase stack, another business's
// TEST session, coach and request are answered exactly like missing ones,
// and their rows are left as they were. Futprep's own TEST session and
// coach still work. Every row is "TEST — delete" and removed afterwards.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;
// Never a session, coach or request id in a fresh test database.
const MISSING = 2_000_000_000;

let futprepOrgId = 0;
let otherOrgId = 0;
const programIds: number[] = [];
let otherSessionId = 0;
let otherEmptySessionId = 0;
let futprepSessionId = 0;
let otherCoachId = 0;
let futprepCoachId = 0;
let otherRequestId = 0;
let futprepRequestId = 0;

async function seedClass(organizationId: number, label: string, defaultLeadCoachId: number | null): Promise<number[]> {
  const { data: program, error } = await db()
    .from("programs")
    .insert({ organization_id: organizationId, slug: `test-delete-${label}-${TAG}`, name: `${MARK} ${label}`, program_type: "term", is_public: false, age_min: 4, age_max: 10, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "10:00 AM", capacity: 20, active: true, default_lead_coach_id: defaultLeadCoachId })
    .select("id")
    .single();
  if (error || !program) throw new Error(`Could not seed a TEST programme: ${error?.message}`);
  programIds.push(Number(program.id));
  const { error: termError } = await db()
    .from("program_terms")
    .insert({ program_id: program.id, name: `${MARK} term`, start_date: "2026-09-05", end_date: "2026-12-12", weekly_fee_cents: 2500, term_fee_cents: 20000, active: true });
  if (termError) throw new Error(`Could not seed a TEST term: ${termError.message}`);
  // The term's Saturdays were scheduled when it was added.
  const { data: sessions, error: sessionError } = await db().from("sessions").select("id").eq("program_id", program.id).order("session_date", { ascending: true }).limit(2);
  if (sessionError || !sessions?.length) throw new Error(`Could not find the TEST sessions: ${sessionError?.message}`);
  return sessions.map((s) => Number(s.id));
}

async function seedCoach(organizationId: number, label: string): Promise<number> {
  const { data, error } = await db()
    .from("coach_profiles")
    .insert({ organization_id: organizationId, slug: `test-delete-${label}-${TAG}`, display_name: `${MARK} ${label}`, member_type: "coach", public_visible: false, bookable: true, active: true, photo_url: `https://example.com/${label}.jpg` })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not seed a TEST coach: ${error?.message}`);
  return Number(data.id);
}

// What a call comes back with: its value, or the message it was refused with.
async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    return `ok ${JSON.stringify((await promise) ?? null)}`;
  } catch (error) {
    return `refused ${error instanceof Error ? error.message : String(error)}`;
  }
}

const otherCoach = async () => (await db().from("coach_profiles").select("organization_id,display_name,active,photo_url").eq("id", otherCoachId).single()).data;

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: futprep } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  futprepOrgId = Number(futprep!.id);
  const { data: org, error: orgError } = await db()
    .from("organizations")
    .insert({ name: `${MARK} Other Club`, slug: `test-delete-other-club-${TAG}`, primary_category: "entertainment", status: "draft" })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`Could not seed the TEST business: ${orgError?.message}`);
  otherOrgId = Number(org.id);

  otherCoachId = await seedCoach(otherOrgId, "other-coach");
  futprepCoachId = await seedCoach(futprepOrgId, "futprep-coach");
  [otherSessionId, otherEmptySessionId] = await seedClass(otherOrgId, "other-kids", otherCoachId);
  [futprepSessionId] = await seedClass(futprepOrgId, "futprep-kids", futprepCoachId);

  const { error: staffError } = await db().from("session_staff").insert({ session_id: otherSessionId, coach_id: otherCoachId, role: "lead", pay_cents: 5000, created_by: MARK });
  if (staffError) throw new Error(`Could not seed TEST session staff: ${staffError.message}`);
  const { error: dutyError } = await db().from("sessions").update({ coaches_on_duty: 2 }).eq("id", otherSessionId);
  if (dutyError) throw new Error(`Could not seed TEST coaches on duty: ${dutyError.message}`);

  const { data: request, error: requestError } = await db()
    .from("private_session_requests")
    .insert({ reference_code: `TEST-${TAG.toUpperCase()}`, organization_id: otherOrgId, parent_name: `${MARK} Parent`, parent_email: `test-delete-${TAG}@example.com`, parent_phone: "+12425550126", child_name: `ZZCHILD${TAG}`, child_age: 7, requested_date: "2026-11-07", requested_start_time: "10:00 AM", duration_minutes: 60, preferred_coach_id: otherCoachId })
    .select("id")
    .single();
  if (requestError || !request) throw new Error(`Could not seed a TEST private session request: ${requestError?.message}`);
  otherRequestId = Number(request.id);
  const { data: own, error: ownError } = await db()
    .from("private_session_requests")
    .insert({ reference_code: `TEST-F${TAG.toUpperCase()}`, organization_id: futprepOrgId, parent_name: `${MARK} Parent`, parent_email: `test-delete-f${TAG}@example.com`, parent_phone: "+12425550127", child_name: `${MARK} Child`, child_age: 7, requested_date: "2026-11-07", requested_start_time: "11:00 AM", duration_minutes: 60 })
    .select("id")
    .single();
  if (ownError || !own) throw new Error(`Could not seed a TEST Futprep request: ${ownError?.message}`);
  futprepRequestId = Number(own.id);
});

afterAll(async () => {
  for (const id of [otherRequestId, futprepRequestId].filter(Boolean)) await db().from("private_session_requests").delete().eq("id", id);
  for (const programId of programIds) {
    await db().from("sessions").delete().eq("program_id", programId);
    await db().from("program_terms").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
  for (const coachId of [otherCoachId, futprepCoachId].filter(Boolean)) await db().from("coach_profiles").delete().eq("id", coachId);
  if (otherOrgId) {
    await db().from("locations").delete().eq("organization_id", otherOrgId);
    await db().from("organizations").delete().eq("id", otherOrgId);
  }
});

describe("Futprep's staff screens never change another business's session", () => {
  it("coaches on duty: refused like a missing session, the cap left as it was", async () => {
    expect(await outcome(setSessionCoaches(otherSessionId, 0))).toBe(await outcome(setSessionCoaches(MISSING, 0)));
    expect(await outcome(setSessionCoaches(otherSessionId, 0))).toBe("refused SESSION_NOT_FOUND");
    const { data: session } = await db().from("sessions").select("coaches_on_duty").eq("id", otherSessionId).single();
    expect(session?.coaches_on_duty).toBe(2);
    // Futprep's own session still takes it.
    expect((await setSessionCoaches(futprepSessionId, 2)).coaches).toBe(2);
  });

  it("who coached: refused like a missing session, nothing removed or added", async () => {
    for (const coaches of [[], [{ coachId: futprepCoachId, role: "lead" as const }]]) {
      expect(await outcome(setSessionStaff(otherSessionId, coaches, MARK))).toBe(await outcome(setSessionStaff(MISSING, coaches, MARK)));
      expect(await outcome(setSessionStaff(otherSessionId, coaches, MARK))).toBe("refused SESSION_NOT_FOUND");
    }
    const { data: staff } = await db().from("session_staff").select("coach_id,role").eq("session_id", otherSessionId);
    expect(staff).toEqual([{ coach_id: otherCoachId, role: "lead" }]);
    const { data: session } = await db().from("sessions").select("coaches_on_duty").eq("id", otherSessionId).single();
    expect(session?.coaches_on_duty).toBe(2);
    // Futprep's own session and coach still work.
    expect((await setSessionStaff(futprepSessionId, [{ coachId: futprepCoachId, role: "lead" }], MARK)).map((e) => e.coachId)).toEqual([futprepCoachId]);
  });

  it("who coached, read: another business's session reads like a missing one", async () => {
    expect(await getSessionStaff(otherSessionId)).toEqual(await getSessionStaff(MISSING));
    expect(JSON.stringify(await getSessionStaff(otherEmptySessionId))).not.toContain(MARK);
  });

  it("the default lead: never recorded on another business's session", async () => {
    await ensureDefaultLead(otherEmptySessionId, MARK);
    const { data: staff } = await db().from("session_staff").select("id").eq("session_id", otherEmptySessionId);
    expect(staff).toEqual([]);
  });
});

describe("Futprep's staff screens never change another business's coach", () => {
  it("open times: refused like a missing coach, none added", async () => {
    const slots = { dayOfWeek: "Wednesday", startTime: "4:00 PM", endTime: "4:45 PM", weeks: 2, location: "TEST field", actor: MARK };
    expect(await outcome(addWeeklyCoachSlots({ coachId: otherCoachId, ...slots }))).toBe(await outcome(addWeeklyCoachSlots({ coachId: MISSING, ...slots })));
    expect(await outcome(addWeeklyCoachSlots({ coachId: otherCoachId, ...slots }))).toBe("refused COACH_NOT_FOUND");
    expect(await outcome(saveCoachAvailability({ coachId: otherCoachId, date: "2026-11-11", startTime: "4:00 PM", endTime: "4:45 PM", status: "available", location: "TEST", note: "", actor: MARK }))).toBe("refused COACH_NOT_FOUND");
    expect(await outcome(saveCoachAvailability({ coachId: MISSING, date: "2026-11-11", startTime: "4:00 PM", endTime: "4:45 PM", status: "available", location: "TEST", note: "", actor: MARK }))).toBe("refused COACH_NOT_FOUND");
    const { data: availability } = await db().from("coach_availability").select("id").eq("coach_id", otherCoachId);
    expect(availability).toEqual([]);
    // Futprep's own coach still takes them.
    expect(await addWeeklyCoachSlots({ coachId: futprepCoachId, ...slots })).toBeGreaterThan(0);
  });

  it("the profile, switching off and on, working days and photo: refused like a missing coach, the coach unchanged", async () => {
    const profile = { displayName: "ZZRENAMED", slug: `zz-${TAG}`, positionTitle: "Coach", memberType: "coach" as const, bio: "", licenses: [], playedAt: [], favoritePlayer: "", favoriteTeam: "", introVideoUrl: "", testimonialQuote: "", testimonialName: "", publicVisible: true, bookable: true, sortOrder: 1 };
    for (const call of [
      (id: number) => saveCoachProfile({ id, ...profile }),
      (id: number) => softDeleteCoach(id),
      (id: number) => restoreCoach(id),
      (id: number) => setCoachWorkingDays(id, [1, 3]),
      (id: number) => setCoachPhoto(id, null),
    ]) {
      expect(await outcome(call(otherCoachId))).toBe(await outcome(call(MISSING)));
      expect(await outcome(call(otherCoachId))).toBe("refused COACH_NOT_FOUND");
    }
    expect(await otherCoach()).toEqual({ organization_id: otherOrgId, display_name: `${MARK} other-coach`, active: true, photo_url: "https://example.com/other-coach.jpg" });
    // Futprep's own coach is still switched off and on.
    await softDeleteCoach(futprepCoachId);
    await restoreCoach(futprepCoachId);
    expect((await db().from("coach_profiles").select("active").eq("id", futprepCoachId).single()).data?.active).toBe(true);
  });
});

describe("Futprep's staff screens never reach another business's private-session request", () => {
  it("the list leaves it out, and the counts don't include it", async () => {
    const { requests } = await listPrivateSessionRequests();
    expect(requests.some((r) => r.id === otherRequestId)).toBe(false);
    expect(JSON.stringify(requests)).not.toContain(`ZZCHILD${TAG}`);
    const { count } = await db().from("private_session_requests").select("id", { count: "exact", head: true }).eq("organization_id", futprepOrgId);
    expect((await privateSessionStats()).requested).toBe(Number(count ?? 0));
  });

  it("recording a payment: refused like a missing request, nothing written", async () => {
    const pay = { amountCents: 1000, method: "cash" as const, reference: "", recordedBy: MARK };
    expect(await outcome(recordPrivateSessionPayment({ requestId: otherRequestId, ...pay }))).toBe(await outcome(recordPrivateSessionPayment({ requestId: MISSING, ...pay })));
    expect(await outcome(recordPrivateSessionPayment({ requestId: otherRequestId, ...pay }))).toBe("refused REQUEST_NOT_FOUND");
    const { data: payments } = await db().from("payments").select("id").eq("private_session_request_id", otherRequestId);
    expect(payments).toEqual([]);
  });

  it("accepting, declining, referring or completing: refused like a missing request, nothing changed", async () => {
    for (const act of [
      { action: "complete" as const },
      { action: "accept" as const, coachId: futprepCoachId },
      { action: "decline" as const, reason: "TEST" },
      { action: "refer" as const, targetCoachId: futprepCoachId },
    ]) {
      expect(await outcome(actOnPrivateSessionRequest({ id: otherRequestId, actor: MARK, ...act }))).toBe(await outcome(actOnPrivateSessionRequest({ id: MISSING, actor: MARK, ...act })));
      expect(await outcome(actOnPrivateSessionRequest({ id: otherRequestId, actor: MARK, ...act }))).toBe("refused REQUEST_NOT_FOUND");
    }
    const { data: request } = await db().from("private_session_requests").select("status,assigned_coach_id").eq("id", otherRequestId).single();
    expect(request).toEqual({ status: "pending", assigned_coach_id: null });
    const { data: events } = await db().from("private_session_events").select("id").eq("request_id", otherRequestId);
    expect(events).toEqual([]);
  });

  it("Futprep's own request goes only to one of Futprep's coaches", async () => {
    expect(await outcome(actOnPrivateSessionRequest({ id: futprepRequestId, action: "accept", coachId: otherCoachId, actor: MARK }))).toBe("refused COACH_REQUIRED");
    expect(await outcome(actOnPrivateSessionRequest({ id: futprepRequestId, action: "refer", targetCoachId: otherCoachId, actor: MARK }))).toBe("refused COACH_REQUIRED");
    const { data: request } = await db().from("private_session_requests").select("status,assigned_coach_id").eq("id", futprepRequestId).single();
    expect(request).toEqual({ status: "pending", assigned_coach_id: null });
    // It is on Futprep's list, and a Futprep coach can still be given it.
    expect((await listPrivateSessionRequests()).requests.some((r) => r.id === futprepRequestId)).toBe(true);
    await actOnPrivateSessionRequest({ id: futprepRequestId, action: "refer", targetCoachId: futprepCoachId, actor: MARK });
    const { data: referred } = await db().from("private_session_requests").select("status,assigned_coach_id").eq("id", futprepRequestId).single();
    expect(referred).toEqual({ status: "referred", assigned_coach_id: futprepCoachId });
  });
});
