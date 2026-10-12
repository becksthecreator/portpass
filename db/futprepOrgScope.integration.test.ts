import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actOnPrivateSessionRequest,
  addWeeklyCoachSlots,
  listAllCoachProfiles,
  listPrivateSessionRequests,
  listPublicCoachProfiles,
  privateSessionStats,
  recordPrivateSessionPayment,
  restoreCoach,
  saveCoachAvailability,
  saveCoachProfile,
  setCoachPhoto,
  softDeleteCoach,
} from "./coaches";
import { ensureDefaultLead, getSessionStaff, setCoachPayDefaults, setSessionStaff } from "./coachPay";
import { setFutprepProgramActive } from "./programs";
import { createFutprepPendingRegistration, createReturnLink, ensureFutprepPilotData, returnLinkPrefill } from "./registrations";
import {
  clearFutprepAttendance,
  getFutprepRegistrationDetail,
  markFutprepAttendance,
  recordFutprepPayment,
  rosterForSession,
  setSessionCoaches,
  updateFutprepRegistration,
  updateFutprepRegistrationDetail,
  voidFutprepPayment,
} from "./staff";

// CLAUDE.md rule 3 (Ponytail audit, 11 Oct, finding 1): Futprep's desk
// functions take a registration id, and every business's registrations
// share one table. Against CI's local Supabase stack: another business's
// registration is answered exactly like a missing one by every function,
// and its row, payment, attendance and history are left as they were.
// Futprep's own TEST registration still works. Every row is
// "TEST — delete" and removed afterwards.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.SUPABASE_URL ?? "")) {
  throw new Error("db/futprepOrgScope.integration.test.ts runs against a local Supabase stack only.");
}

const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;
// Never a registration or payment id in a fresh test database.
const MISSING = 2_000_000_000;

let otherOrgId = 0;
let otherProgramId = 0;
let otherProgramSlug = "";
let otherSessionId = 0;
let otherId = 0;
let otherPaymentId = 0;
let futprepProgramId = 0;
let futprepId = 0;
let otherCoachId = 0;
let otherTermId = 0;
let otherRequestId = 0;
let futprepRequestId = 0;
let otherStaffId = 0;
let futprepCoachId = 0;

function registration(organizationId: number, programId: number, termId: number, label: string) {
  const now = new Date().toISOString();
  return {
    reference_code: `TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    organization_id: organizationId,
    program_id: programId,
    term_id: termId,
    parent_name: `${MARK} Parent ${label}`,
    parent_email: `test-delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
    parent_phone: "+12425550123",
    relationship: "Parent",
    child_name: `${MARK} Child ${label}`,
    child_dob: "2019-03-01",
    gender: "Prefer not to say",
    emergency_contact_name: `ZZEMERGENCY${TAG}`,
    emergency_contact_phone: "+12425550124",
    allergies: `ZZPEANUT${TAG}`,
    medical_conditions: `ZZASTHMA${TAG}`,
    medications: "",
    special_needs: "",
    authorized_pickup: `ZZPICKUP${TAG}`,
    additional_notes: `ZZNOTE${TAG}`,
    photo_consent: "no",
    payment_frequency: "term",
    payment_method: "cash",
    amount_due_cents: 20000,
    registration_status: "confirmed",
    payment_status: "partial",
    consent_version: "test",
    consent_accepted: true,
    consent_at: now,
    signature_name: `${MARK} Parent ${label}`,
    submitted_at: now,
    is_new_family: false,
    commission_eligible: false,
    commission_reason: "TEST fixture",
  };
}

async function seedProgram(organizationId: number, slug: string): Promise<{ programId: number; termId: number }> {
  const { data: program, error } = await db()
    .from("programs")
    .insert({ organization_id: organizationId, slug, name: `${MARK} class`, program_type: "term", is_public: false, age_min: 4, age_max: 10, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "10:00 AM", capacity: 20, active: true })
    .select("id")
    .single();
  if (error || !program) throw new Error(`Could not seed a TEST programme: ${error?.message}`);
  const { data: term, error: termError } = await db()
    .from("program_terms")
    .insert({ program_id: program.id, name: `${MARK} term`, start_date: "2026-09-05", end_date: "2026-12-12", weekly_fee_cents: 2500, term_fee_cents: 20000, active: true })
    .select("id")
    .single();
  if (termError || !term) throw new Error(`Could not seed a TEST term: ${termError?.message}`);
  return { programId: Number(program.id), termId: Number(term.id) };
}

// What a call comes back with: its value, or the message it was refused with.
async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    return `ok ${JSON.stringify((await promise) ?? null)}`;
  } catch (error) {
    return `refused ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function otherRow() {
  const { data } = await db()
    .from("registrations")
    .select("child_name,registration_status,payment_status,allergies,additional_notes,program_id,amount_due_cents")
    .eq("id", otherId)
    .single();
  return data;
}

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: futprep } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  const { data: org, error: orgError } = await db()
    .from("organizations")
    .insert({ name: `${MARK} Other Club`, slug: `test-delete-other-club-${TAG}`, primary_category: "entertainment", status: "draft" })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`Could not seed the TEST business: ${orgError?.message}`);
  otherOrgId = Number(org.id);

  otherProgramSlug = `test-delete-other-kids-${TAG}`;
  const other = await seedProgram(otherOrgId, otherProgramSlug);
  otherProgramId = other.programId;
  otherTermId = other.termId;
  const mine = await seedProgram(Number(futprep!.id), `test-delete-futprep-kids-${TAG}`);
  futprepProgramId = mine.programId;

  const { data: rows, error: regError } = await db()
    .from("registrations")
    .insert([registration(otherOrgId, other.programId, other.termId, "Other"), registration(Number(futprep!.id), mine.programId, mine.termId, "Futprep")])
    .select("id,child_name");
  if (regError || !rows) throw new Error(`Could not seed TEST registrations: ${regError?.message}`);
  otherId = Number(rows.find((r) => r.child_name.endsWith("Other"))!.id);
  futprepId = Number(rows.find((r) => r.child_name.endsWith("Futprep"))!.id);

  // The term's Saturdays were scheduled when it was added.
  const { data: session, error: sessionError } = await db()
    .from("sessions")
    .select("id")
    .eq("program_id", other.programId)
    .order("session_date", { ascending: true })
    .limit(1)
    .single();
  if (sessionError || !session) throw new Error(`Could not find a TEST session: ${sessionError?.message}`);
  otherSessionId = Number(session.id);
  const { error: markError } = await db().from("attendance").insert({ registration_id: otherId, session_id: otherSessionId, status: "present", marked_by: MARK });
  if (markError) throw new Error(`Could not seed TEST attendance: ${markError.message}`);

  const { data: payment, error: paymentError } = await db()
    .from("payments")
    .insert({ registration_id: otherId, amount_cents: 5000, method: "cash", status: "received", recorded_by: MARK, received_at: new Date().toISOString() })
    .select("id")
    .single();
  if (paymentError || !payment) throw new Error(`Could not seed a TEST payment: ${paymentError?.message}`);
  otherPaymentId = Number(payment.id);

  // Brief 34: the other business's own coach, its class's default lead,
  // and who coached its first session.
  const { data: coach, error: coachError } = await db()
    .from("coach_profiles")
    .insert({ organization_id: otherOrgId, slug: `test-delete-other-coach-${TAG}`, display_name: `${MARK} Other Coach`, active: true, bookable: true, public_visible: false })
    .select("id")
    .single();
  if (coachError || !coach) throw new Error(`Could not seed a TEST coach: ${coachError?.message}`);
  otherCoachId = Number(coach.id);
  await db().from("programs").update({ default_lead_coach_id: otherCoachId }).eq("id", other.programId);
  const { error: staffError } = await db().from("session_staff").insert({ session_id: otherSessionId, coach_id: otherCoachId, role: "lead", pay_cents: 0, created_by: MARK });
  if (staffError) throw new Error(`Could not seed TEST session staff: ${staffError.message}`);

  // Brief 34: a private session request for each business, the other
  // business's staff login, and a Futprep coach (hidden, switched off).
  const request = (organizationId: number, label: string) => ({
    reference_code: `FP-S-TEST-${TAG.toUpperCase()}-${label}`,
    organization_id: organizationId,
    parent_name: `${MARK} Parent ${label}`,
    parent_email: `test-delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
    parent_phone: "242-555-0125",
    child_name: `${MARK} Child ${label}`,
    child_age: 6,
    requested_date: "2098-09-06",
    requested_start_time: "4:00 PM",
    duration_minutes: 60,
    location_preference: "TEST field",
    status: "pending",
    price_cents: 5000,
  });
  const { data: requests, error: requestError } = await db().from("private_session_requests").insert([request(otherOrgId, "OTHER"), request(Number(futprep!.id), "FUTPREP")]).select("id,reference_code");
  if (requestError || !requests) throw new Error(`Could not seed TEST private session requests: ${requestError?.message}`);
  otherRequestId = Number(requests.find((r) => r.reference_code.endsWith("OTHER"))!.id);
  futprepRequestId = Number(requests.find((r) => r.reference_code.endsWith("FUTPREP"))!.id);
  const { data: staff, error: staffMemberError } = await db().from("staff_members").insert({ organization_id: otherOrgId, name: `${MARK} Other Login`, role: "coach", responsibilities: "", active: true }).select("id").single();
  if (staffMemberError || !staff) throw new Error(`Could not seed a TEST staff login: ${staffMemberError?.message}`);
  otherStaffId = Number(staff.id);
  const { data: mine, error: mineError } = await db()
    .from("coach_profiles")
    .insert({ organization_id: Number(futprep!.id), slug: `test-delete-futprep-coach-${TAG}`, display_name: `${MARK} Futprep Coach`, active: false, bookable: false, public_visible: false })
    .select("id")
    .single();
  if (mineError || !mine) throw new Error(`Could not seed a TEST Futprep coach: ${mineError?.message}`);
  futprepCoachId = Number(mine.id);
});

afterAll(async () => {
  const requestIds = [otherRequestId, futprepRequestId].filter(Boolean);
  if (requestIds.length) {
    await db().from("private_session_events").delete().in("request_id", requestIds);
    await db().from("payments").delete().in("private_session_request_id", requestIds);
    await db().from("private_session_requests").delete().in("id", requestIds);
  }
  if (futprepCoachId) await db().from("coach_profiles").delete().eq("id", futprepCoachId);
  if (otherStaffId) await db().from("staff_members").delete().eq("id", otherStaffId);
  if (otherSessionId) await db().from("session_staff").delete().eq("session_id", otherSessionId);
  if (otherCoachId) {
    await db().from("coach_availability").delete().eq("coach_id", otherCoachId);
    await db().from("programs").update({ default_lead_coach_id: null }).eq("id", otherProgramId);
    await db().from("coach_profiles").delete().eq("id", otherCoachId);
  }
  for (const programId of [otherProgramId, futprepProgramId].filter(Boolean)) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("sessions").delete().eq("program_id", programId);
    await db().from("program_terms").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
  if (otherOrgId) {
    await db().from("locations").delete().eq("organization_id", otherOrgId);
    await db().from("organizations").delete().eq("id", otherOrgId);
  }
});

describe("Futprep's desk never reaches another business's registration (rule 3)", () => {
  it("the registration record: not found, like a missing one", async () => {
    expect(await getFutprepRegistrationDetail(otherId)).toBeNull();
    expect(await getFutprepRegistrationDetail(MISSING)).toBeNull();
    // Futprep's own still opens.
    expect((await getFutprepRegistrationDetail(futprepId))?.child_name).toBe(`${MARK} Child Futprep`);
  });

  it("recording a payment: refused like a missing one, nothing written, so no email", async () => {
    const asked = { amountCents: 1000, method: "cash" as const, recordedBy: MARK };
    expect(await outcome(recordFutprepPayment({ registrationId: otherId, ...asked }))).toBe(await outcome(recordFutprepPayment({ registrationId: MISSING, ...asked })));
    expect(await outcome(recordFutprepPayment({ registrationId: otherId, ...asked }))).toBe("refused REGISTRATION_NOT_FOUND");
    const { data: payments } = await db().from("payments").select("id").eq("registration_id", otherId);
    expect(payments).toHaveLength(1);
    expect((await otherRow())?.payment_status).toBe("partial");
    // Futprep's own still takes a payment.
    expect((await recordFutprepPayment({ registrationId: futprepId, ...asked })).paidCents).toBe(1000);
  });

  it("confirming, cancelling or changing the payment status: refused like a missing one, row unchanged", async () => {
    for (const change of [{ registrationStatus: "cancelled" as const }, { registrationStatus: "confirmed" as const }, { paymentStatus: "waived" as const }]) {
      expect(await outcome(updateFutprepRegistration({ registrationId: otherId, ...change }))).toBe(await outcome(updateFutprepRegistration({ registrationId: MISSING, ...change })));
      expect(await outcome(updateFutprepRegistration({ registrationId: otherId, ...change }))).toBe("refused REGISTRATION_NOT_FOUND");
    }
    expect(await otherRow()).toMatchObject({ registration_status: "confirmed", payment_status: "partial" });
  });

  it("editing the record: refused like a missing one, nothing changed or logged", async () => {
    const edit = { childName: "ZZRENAMED", allergies: "ZZCHANGED", additionalNotes: "ZZCHANGED", amountDueCentsOverride: 1 };
    expect(await outcome(updateFutprepRegistrationDetail(otherId, edit, MARK))).toBe(await outcome(updateFutprepRegistrationDetail(MISSING, edit, MARK)));
    expect(await outcome(updateFutprepRegistrationDetail(otherId, edit, MARK))).toBe("refused REGISTRATION_NOT_FOUND");
    expect(await otherRow()).toMatchObject({ child_name: `${MARK} Child Other`, allergies: `ZZPEANUT${TAG}`, additional_notes: `ZZNOTE${TAG}`, amount_due_cents: 20000 });
    const { data: edits } = await db().from("registration_edits").select("id").eq("registration_id", otherId);
    expect(edits).toEqual([]);
  });

  it("moving a Futprep child: never into another business's programme", async () => {
    expect(await outcome(updateFutprepRegistrationDetail(futprepId, { programSlug: otherProgramSlug }, MARK))).toBe("refused INVALID_PROGRAM");
    const { data: mine } = await db().from("registrations").select("program_id").eq("id", futprepId).single();
    expect(Number(mine?.program_id)).toBe(futprepProgramId);
  });

  it("marking and clearing attendance: answered like a missing one, the mark left as it was", async () => {
    const mark = { sessionId: otherSessionId, status: "absent" as const, markedBy: MARK };
    expect(await outcome(markFutprepAttendance({ registrationId: otherId, ...mark }))).toBe(await outcome(markFutprepAttendance({ registrationId: MISSING, ...mark })));
    expect(await outcome(markFutprepAttendance({ registrationId: otherId, ...mark }))).toBe("refused REGISTRATION_NOT_FOUND");
    expect(await outcome(clearFutprepAttendance({ sessionId: otherSessionId, registrationId: otherId }))).toBe(await outcome(clearFutprepAttendance({ sessionId: otherSessionId, registrationId: MISSING })));
    const { data: marks } = await db().from("attendance").select("status,marked_by").eq("registration_id", otherId);
    expect(marks).toEqual([{ status: "present", marked_by: MARK }]);
    // Nor does a coach's roster open another business's session.
    expect(await outcome(rosterForSession(otherSessionId, { includeSafety: true, includeHealth: true }))).toBe("refused SESSION_NOT_FOUND");
    // Nor is a Futprep child marked on another business's session.
    expect(await outcome(markFutprepAttendance({ registrationId: futprepId, ...mark }))).toBe("refused SESSION_NOT_FOUND");
    const { data: mine } = await db().from("attendance").select("id").eq("registration_id", futprepId);
    expect(mine).toEqual([]);
  });

  it("voiding a payment: refused like a missing one, the payment kept", async () => {
    expect(await outcome(voidFutprepPayment({ paymentId: otherPaymentId, voidedBy: MARK }))).toBe(await outcome(voidFutprepPayment({ paymentId: MISSING, voidedBy: MARK })));
    expect(await outcome(voidFutprepPayment({ paymentId: otherPaymentId, voidedBy: MARK }))).toBe("refused PAYMENT_NOT_FOUND");
    const { data: payment } = await db().from("payments").select("id,amount_cents").eq("id", otherPaymentId).maybeSingle();
    expect(payment).toMatchObject({ amount_cents: 5000 });
    expect((await otherRow())?.payment_status).toBe("partial");
  });

  it("voiding Futprep's own payment that has a receipt: still refused, it is refunded on the request", async () => {
    const { data: futprep } = await db().from("organizations").select("id").eq("slug", "futprep").single();
    const { data: request, error } = await db()
      .from("payment_requests")
      .insert({ organization_id: futprep!.id, reference_number: 900000 + Math.floor(Math.random() * 99999), reference_code: `FP-${900000 + Math.floor(Math.random() * 99999)}`, public_token: createHash("sha1").update(TAG).digest("hex"), customer_name: `${MARK} Parent`, customer_phone: "+12425550123", line_items: [{ label: "TEST term fee", qty: 1, unit_cents: 1000 }], total_cents: 1000, due_date: "2026-12-01", methods_allowed: ["cash"], registration_id: futprepId })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { data: paid, error: paidError } = await db()
      .from("payments")
      .insert({ registration_id: futprepId, payment_request_id: request!.id, amount_cents: 1000, method: "cash", status: "received", recorded_by: MARK, received_at: new Date().toISOString() })
      .select("id")
      .single();
    expect(paidError).toBeNull();
    expect(await outcome(voidFutprepPayment({ paymentId: Number(paid!.id), voidedBy: MARK }))).toMatch(/^refused This payment came through a payment request/);
    await db().from("payment_requests").delete().eq("id", request!.id);
  });

  it("a return link: never made for another business's family, and an old one fills in nothing", async () => {
    expect(await outcome(createReturnLink(otherId, MARK))).toBe(await outcome(createReturnLink(MISSING, MARK)));
    expect(await outcome(createReturnLink(otherId, MARK))).toBe("refused REGISTRATION_NOT_FOUND");
    const { data: links } = await db().from("futprep_return_links").select("id").eq("source_registration_id", otherId);
    expect(links).toEqual([]);
    // A link that points at another business's registration anyway (made
    // before this check) prefills nothing: no emergency contact, no pickup.
    const token = `test${crypto.randomUUID().replace(/-/g, "")}`;
    const { error } = await db().from("futprep_return_links").insert({ token_hash: createHash("sha256").update(token).digest("hex"), source_registration_id: otherId, created_by: MARK });
    expect(error).toBeNull();
    expect(await returnLinkPrefill(token)).toBeNull();
    // Futprep's own family still gets a link that fills in.
    const own = await createReturnLink(futprepId, MARK);
    expect((await returnLinkPrefill(own.token))?.childName).toBe(`${MARK} Child Futprep`);
  });
});

// Brief 34 (audit finding 1, "every Futprep staff action"): the same rule
// for the screens that take a session or a coach id. Found by #205's
// security review: a Futprep PIN could set another business's "coaches
// today" (and so its class's cap), rewrite who coached its session, or add
// open times to its coach.
describe("Futprep's session and coach screens never reach another business's (rule 3, brief 34)", () => {
  it("coaches today: refused like a missing session, the other class's number left as it was", async () => {
    expect(await outcome(setSessionCoaches(otherSessionId, 0))).toBe(await outcome(setSessionCoaches(MISSING, 0)));
    expect(await outcome(setSessionCoaches(otherSessionId, 0))).toBe("refused SESSION_NOT_FOUND");
    const { data: session } = await db().from("sessions").select("coaches_on_duty").eq("id", otherSessionId).single();
    expect(session?.coaches_on_duty).toBeNull();
  });

  it("who coached: neither read nor rewritten, its row left as it was", async () => {
    expect(await outcome(getSessionStaff(otherSessionId))).toBe(await outcome(getSessionStaff(MISSING)));
    expect(await outcome(getSessionStaff(otherSessionId))).not.toContain("Other Coach");
    expect(await outcome(setSessionStaff(otherSessionId, [], MARK))).toBe(await outcome(setSessionStaff(MISSING, [], MARK)));
    expect(await outcome(setSessionStaff(otherSessionId, [], MARK))).toBe("refused SESSION_NOT_FOUND");
    const { data: rows } = await db().from("session_staff").select("coach_id,role").eq("session_id", otherSessionId);
    expect(rows).toEqual([{ coach_id: otherCoachId, role: "lead" }]);
  });

  it("the default lead after a mark: never recorded on another business's session", async () => {
    await db().from("session_staff").delete().eq("session_id", otherSessionId);
    await ensureDefaultLead(otherSessionId, MARK);
    const { data: rows } = await db().from("session_staff").select("id").eq("session_id", otherSessionId);
    expect(rows).toEqual([]);
    await db().from("session_staff").insert({ session_id: otherSessionId, coach_id: otherCoachId, role: "lead", pay_cents: 0, created_by: MARK });
  });

  it("open times: never added to another business's coach", async () => {
    const slots = { dayOfWeek: "Saturday", startTime: "9:00 AM", endTime: "10:00 AM", weeks: 2, location: "TEST field", actor: MARK };
    expect(await outcome(addWeeklyCoachSlots({ coachId: otherCoachId, ...slots }))).toBe(await outcome(addWeeklyCoachSlots({ coachId: MISSING, ...slots })));
    expect(await outcome(addWeeklyCoachSlots({ coachId: otherCoachId, ...slots }))).toBe("refused COACH_NOT_FOUND");
    const { data: times } = await db().from("coach_availability").select("id").eq("coach_id", otherCoachId);
    expect(times).toEqual([]);
  });
});

// Brief 34, the rest of finding 1 (found by the tdd-guide's read of every
// Futprep staff action): private session requests and their payments, the
// Team screen and the public coach pages, switching a class on or off, the
// desk's quick add and a coach's login link. Each answers another
// business's id like a missing one, and leaves its rows as they were.
describe("Futprep's private sessions, team and classes never reach another business's (rule 3, brief 34)", () => {
  async function otherRequest() {
    const { data } = await db().from("private_session_requests").select("status,assigned_coach_id,payment_status,parent_notified_at").eq("id", otherRequestId).single();
    return data;
  }

  it("a private session request: every action refused like a missing one, nothing booked or recorded", async () => {
    const before = await otherRequest();
    const actions = [
      { action: "accept" as const, coachId: otherCoachId },
      { action: "decline" as const, reason: "TEST reason" },
      { action: "refer" as const, targetCoachId: otherCoachId },
      { action: "parent_notified" as const },
      { action: "complete" as const },
    ];
    for (const act of actions) {
      const theirs = await outcome(actOnPrivateSessionRequest({ id: otherRequestId, actor: MARK, ...act }));
      expect(theirs).toBe(await outcome(actOnPrivateSessionRequest({ id: MISSING, actor: MARK, ...act })));
      expect(theirs).toBe("refused REQUEST_NOT_FOUND");
    }
    expect(await otherRequest()).toEqual(before);
    const { data: events } = await db().from("private_session_events").select("id").eq("request_id", otherRequestId);
    expect(events).toEqual([]);
  });

  it("a Futprep request is never given to another business's coach", async () => {
    expect(await outcome(actOnPrivateSessionRequest({ id: futprepRequestId, action: "accept", coachId: otherCoachId, actor: MARK }))).toBe("refused COACH_NOT_FOUND");
    expect(await outcome(actOnPrivateSessionRequest({ id: futprepRequestId, action: "refer", targetCoachId: otherCoachId, actor: MARK }))).toBe("refused COACH_NOT_FOUND");
    const { data } = await db().from("private_session_requests").select("status,assigned_coach_id").eq("id", futprepRequestId).single();
    expect(data).toEqual({ status: "pending", assigned_coach_id: null });
  });

  it("a private session payment: refused like a missing one, no money recorded", async () => {
    const pay = (requestId: number) => recordPrivateSessionPayment({ requestId, amountCents: 100, method: "cash", reference: "", recordedBy: MARK });
    expect(await outcome(pay(otherRequestId))).toBe(await outcome(pay(MISSING)));
    expect(await outcome(pay(otherRequestId))).toBe("refused REQUEST_NOT_FOUND");
    const { data: payments } = await db().from("payments").select("id").eq("private_session_request_id", otherRequestId);
    expect(payments).toEqual([]);
    expect((await otherRequest())?.payment_status).not.toBe("partial");
  });

  it("the private sessions list and its numbers are Futprep's only", async () => {
    const { requests } = await listPrivateSessionRequests();
    expect(requests.map((r) => Number(r.id))).toContain(futprepRequestId);
    expect(requests.map((r) => Number(r.id))).not.toContain(otherRequestId);
    // The other business's request, dated after anything another test
    // makes, paid in full: counted nowhere.
    await db().from("private_session_requests").update({ created_at: "2099-01-02T00:00:00Z", status: "accepted", accepted_at: "2099-01-02T00:00:00Z", payment_status: "paid" }).eq("id", otherRequestId);
    await db().from("payments").insert({ private_session_request_id: otherRequestId, amount_cents: 7777, method: "cash", status: "received", recorded_by: MARK, received_at: new Date().toISOString() });
    expect(await privateSessionStats("2099-01-01T00:00:00Z")).toEqual({ requested: 0, accepted: 0, paid: 0, revenueCents: 0 });
  });

  it("the Team screen: another business's coach is neither listed nor changed", async () => {
    const { coaches } = await listAllCoachProfiles();
    expect(coaches.map((c) => Number(c.id))).toContain(futprepCoachId);
    expect(coaches.map((c) => Number(c.id))).not.toContain(otherCoachId);

    const profile = (id: number) => saveCoachProfile({ id, displayName: `${MARK} Renamed`, slug: `test-delete-renamed-${TAG}`, positionTitle: "Coach", memberType: "coach", bio: "", licenses: [], playedAt: [], favoritePlayer: "", favoriteTeam: "", photoUrl: "https://example.com/test.jpg", introVideoUrl: "", testimonialQuote: "", testimonialName: "", publicVisible: true, bookable: true, sortOrder: 1 });
    const slot = (coachId: number) => saveCoachAvailability({ coachId, date: "2098-09-06", startTime: "9:00 AM", endTime: "10:00 AM", status: "available", location: "TEST field", note: "", actor: MARK });
    const calls: Array<(id: number) => Promise<unknown>> = [profile, softDeleteCoach, restoreCoach, slot, (id) => setCoachPhoto(id, null)];
    for (const call of calls) {
      expect(await outcome(call(otherCoachId))).toBe(await outcome(call(MISSING)));
      expect(await outcome(call(otherCoachId))).toBe("refused COACH_NOT_FOUND");
    }
    const { data: coach } = await db().from("coach_profiles").select("organization_id,display_name,active,public_visible,photo_url").eq("id", otherCoachId).single();
    expect(coach).toEqual({ organization_id: otherOrgId, display_name: `${MARK} Other Coach`, active: true, public_visible: false, photo_url: null });
    const { data: times } = await db().from("coach_availability").select("id").eq("coach_id", otherCoachId);
    expect(times).toEqual([]);
  });

  it("Futprep's public coach pages never show another business's coach", async () => {
    await db().from("coach_profiles").update({ public_visible: true }).eq("id", otherCoachId);
    try {
      const { coaches } = await listPublicCoachProfiles();
      expect(coaches.map((c) => Number(c.id))).not.toContain(otherCoachId);
    } finally {
      await db().from("coach_profiles").update({ public_visible: false }).eq("id", otherCoachId);
    }
  });

  it("switching a class on or off: never another business's", async () => {
    expect(await outcome(setFutprepProgramActive(otherProgramId, false))).toBe(await outcome(setFutprepProgramActive(MISSING, false)));
    expect(await outcome(setFutprepProgramActive(otherProgramId, false))).toBe("refused PROGRAM_NOT_FOUND");
    const { data } = await db().from("programs").select("active").eq("id", otherProgramId).single();
    expect(data?.active).toBe(true);
  });

  it("the desk's quick add: never into another business's class", async () => {
    const childName = `${MARK} quick add ${TAG}`;
    expect(await outcome(createFutprepPendingRegistration({ childName, programSlug: otherProgramSlug, termId: otherTermId, enteredByStaff: MARK }))).toBe("refused INVALID_PROGRAM");
    const { data } = await db().from("registrations").select("id").eq("program_id", otherProgramId).eq("child_name", childName);
    expect(data).toEqual([]);
  });

  it("a coach's login link: never another business's staff login", async () => {
    expect(await outcome(setCoachPayDefaults({ coachId: futprepCoachId, leadCents: null, assistantCents: null, staffMemberId: otherStaffId, actor: MARK }))).toBe("refused STAFF_NOT_FOUND");
    const { data } = await db().from("coach_profiles").select("staff_member_id").eq("id", futprepCoachId).single();
    expect(data?.staff_member_id).toBeNull();
  });
});
