import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nassauToday } from "@/lib/futprepTerms";
import { claimJobRun, futprepOrganization, getGrowthReport, listUnmarkedAttendance, logMessage, recordPageEvent, sessionsToNudge, syncCommissionEvents } from "./growth";
import { ensureFutprepPilotData } from "./registrations";

// The growth report (brief 05, parts 2 and 3) against CI's local Supabase
// stack: a TEST class in Futprep with a term running today, three TEST
// children, one payment from a family PortPass brought. Other test files
// share the organisation, so the assertions look at this class's own rows
// and at differences, never at organisation-wide totals. Everything is
// "TEST — delete" and removed afterwards.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST delete ${TAG}`;
const PATH = `/futprep/test-delete-${TAG}`;
const today = nassauToday();

function shift(days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${today}T12:00:00Z`).getUTCDay()];

let organization = { id: 0, name: "" };
let programId = 0;
let termId = 0;
let staffId = 0;
let coachId = 0;
let paymentId = 0;
const regs: Record<string, number> = {};
let lastWeek = 0;
let twoWeeksAgo = 0;
let todaySession = 0;

function registration(label: string, over: Record<string, unknown> = {}) {
  const submitted = new Date(`${shift(-25)}T15:00:00Z`).toISOString();
  return {
    reference_code: `FP-TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    organization_id: organization.id,
    program_id: programId,
    term_id: termId,
    parent_name: `${MARK} Parent ${label}`,
    parent_email: `test-delete-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`,
    parent_phone: "+12425550100",
    relationship: "Parent",
    child_name: `${label}${TAG} ${MARK}`,
    child_dob: "2021-03-01",
    gender: "Prefer not to say",
    emergency_contact_name: `${MARK} Emergency`,
    emergency_contact_phone: "+12425550199",
    allergies: "TEST peanut",
    medical_conditions: "TEST asthma",
    medications: "",
    special_needs: "",
    authorized_pickup: `${MARK} Pickup`,
    additional_notes: "",
    photo_consent: "no",
    payment_frequency: "term",
    payment_method: "cash",
    amount_due_cents: 42000,
    registration_status: "confirmed",
    payment_status: "pending",
    consent_version: "test",
    consent_accepted: true,
    consent_at: submitted,
    signature_name: `${MARK} Parent ${label}`,
    submitted_at: submitted,
    is_new_family: false,
    commission_eligible: false,
    commission_reason: "TEST fixture",
    ...over,
  };
}

beforeAll(async () => {
  await ensureFutprepPilotData();
  const org = await futprepOrganization();
  if (!org) throw new Error("Futprep organisation missing");
  organization = org;

  const { data: staff, error: staffError } = await db().from("staff_members").insert({ organization_id: org.id, name: `${MARK} Coach`, role: "coach", email: `test-delete-coach-${TAG}@test.portpass.local`, responsibilities: "", active: true }).select("id").single();
  expect(staffError).toBeNull();
  staffId = Number(staff!.id);
  const { data: coach, error: coachError } = await db().from("coach_profiles").insert({ organization_id: org.id, slug: `test-delete-coach-${TAG}`, display_name: `${MARK} Coach`, member_type: "coach", active: true, public_visible: false, bookable: false, staff_member_id: staffId }).select("id").single();
  expect(coachError).toBeNull();
  coachId = Number(coach!.id);

  const { data: program, error: programError } = await db()
    .from("programs")
    .insert({ organization_id: org.id, slug: `test-delete-growth-${TAG}`, name: `${MARK} class`, program_type: "term", is_public: false, age_min: 3, age_max: 6, coed: true, location: "TEST field", day_of_week: WEEKDAY, start_time: "9:00 AM", end_time: "9:45 AM", capacity: 10, active: false, default_lead_coach_id: coachId })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  const { data: term, error: termError } = await db().from("program_terms").insert({ program_id: programId, name: `TEST term ${TAG}`, start_date: shift(-28), end_date: shift(28), weekly_fee_cents: 3500, term_fee_cents: 42000, active: false }).select("id").single();
  expect(termError).toBeNull();
  termId = Number(term!.id);

  const { data: sessions } = await db().from("sessions").select("id,session_date").eq("term_id", termId);
  const on = (date: string) => Number(sessions!.find((s) => s.session_date === date)!.id);
  todaySession = on(today);
  lastWeek = on(shift(-7));
  twoWeeksAgo = on(shift(-14));

  const { data: rows, error: regError } = await db()
    .from("registrations")
    .insert([registration("Alpha", { is_new_family: true, commission_eligible: true, commission_reason: "PortPass QR" }), registration("Bravo"), registration("Charlie", { registration_status: "waitlist" })])
    .select("id,child_name");
  expect(regError).toBeNull();
  regs.Alpha = Number(rows!.find((r) => String(r.child_name).startsWith("Alpha"))!.id);
  regs.Bravo = Number(rows!.find((r) => String(r.child_name).startsWith("Bravo"))!.id);

  const { data: payment, error: payError } = await db().from("payments").insert({ registration_id: regs.Alpha, amount_cents: 20000, method: "cash", status: "received", note: MARK, received_at: new Date().toISOString() }).select("id").single();
  expect(payError).toBeNull();
  paymentId = Number(payment!.id);
});

afterAll(async () => {
  await db().from("page_events").delete().eq("path", PATH);
  await db().from("commission_plans").delete().eq("organization_id", organization.id).eq("note", MARK);
  if (paymentId) await db().from("billing_events").delete().eq("source_table", "payments").eq("source_id", paymentId);
  await db().from("job_runs").delete().like("job", `test-${TAG}%`);
  await db().from("message_log").delete().eq("template", `test_${TAG}`);
  if (programId) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("programs").update({ default_lead_coach_id: null }).eq("id", programId);
    await db().from("sessions").delete().eq("program_id", programId);
    await db().from("program_terms").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
  if (coachId) await db().from("coach_profiles").delete().eq("id", coachId);
  if (staffId) await db().from("staff_members").delete().eq("id", staffId);
});

describe("page events and the report", () => {
  it("counts a view by source, and the class's places, fees and attendance", async () => {
    const before = await getGrowthReport(organization);
    const qrBefore = before.current?.found.bySource.find((s) => s.channel === "qr")?.views ?? 0;
    const tapsBefore = before.current?.asked.whatsappTaps ?? 0;

    await recordPageEvent({ organizationId: organization.id, path: PATH, event: "view", sourceChannel: "qr" });
    await recordPageEvent({ organizationId: organization.id, path: PATH, event: "view", sourceChannel: "qr" });
    await recordPageEvent({ organizationId: organization.id, path: PATH, event: "whatsapp_click", sourceChannel: "qr" });
    // Attendance two weeks ago and last week: Alpha came both times, Bravo neither.
    await db().from("attendance").insert([
      { registration_id: regs.Alpha, session_id: twoWeeksAgo, status: "present", marked_by: MARK },
      { registration_id: regs.Alpha, session_id: lastWeek, status: "present", marked_by: MARK },
    ]);

    const report = await getGrowthReport(organization);
    expect(report.current).not.toBeNull();
    const term = report.current!;
    expect((term.found.bySource.find((s) => s.channel === "qr")?.views ?? 0) - qrBefore).toBe(2);
    expect(term.asked.whatsappTaps - tapsBefore).toBe(1);

    const name = `${MARK} class`;
    // Two places taken of ten; the waitlisted child does not take one.
    expect(term.booked.classes.find((c) => c.programName === name)).toEqual({ programName: name, registered: 2, capacity: 10, fillPercent: 20 });
    expect(term.paid.classes.find((c) => c.programName === name)).toEqual({ programName: name, dueCents: 84000, collectedCents: 20000, outstandingCents: 64000 });
    expect(term.showedUp.sessions.find((s) => s.programName === name && s.date === shift(-7))).toMatchObject({ enrolled: 2, present: 1, taken: true, percent: 50 });

    // Bravo missed the last two sessions; only a first name and the class are shown.
    expect(report.missedTwo).toContainEqual({ childFirstName: `Bravo${TAG}`, programName: name });
    expect(report.missedTwo.some((m) => m.childFirstName === `Alpha${TAG}`)).toBe(false);

    // Nothing about health, emergency contacts or contact details is in the report.
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/peanut|asthma|Emergency|Pickup|2425550|@test\.portpass/);
    expect(text).not.toContain(`${MARK} Parent`);
  });

  it("shows what Grow With Us would come to, and invoices nothing, for a business not on the plan", async () => {
    const report = await getGrowthReport(organization);
    expect(report.value.onPlan).toBe(false);
    expect(report.value.terms).toEqual({ rateBps: 800, capCentsPerMonth: 12000 });
    expect(report.value.thisMonth.families).toBeGreaterThanOrEqual(1);
    expect(report.value.invoicedCents).toBe(0);
    expect(await syncCommissionEvents(organization.id)).toBeNull();
    const { data } = await db().from("billing_events").select("id").eq("source_table", "payments").eq("source_id", paymentId);
    expect(data).toEqual([]);
  });
});

describe("billing events for a business on the plan", () => {
  it("writes one event per payment from a commissionable family, once, and removes it if the payment is voided", async () => {
    const { error: planError } = await db().from("commission_plans").insert({ organization_id: organization.id, kind: "grow_with_us", rate_bps: 800, cap_cents_per_month: 12000, starts_on: shift(-28), note: MARK });
    expect(planError).toBeNull();

    const first = await syncCommissionEvents(organization.id);
    expect(first).not.toBeNull();
    const { data: events } = await db().from("billing_events").select("kind,booking_value_cents,rate_bps,fee_cents,event_on,invoice_line_id,organization_id").eq("source_table", "payments").eq("source_id", paymentId);
    // 8% of the $200 collected. The $420 due is never charged on.
    expect(events).toEqual([{ kind: "grow_with_us_commission", booking_value_cents: 20000, rate_bps: 800, fee_cents: 1600, event_on: today, invoice_line_id: null, organization_id: organization.id }]);
    expect((await getGrowthReport(organization)).value.onPlan).toBe(true);

    // A second run writes nothing new for this payment.
    await syncCommissionEvents(organization.id);
    expect((await db().from("billing_events").select("id").eq("source_table", "payments").eq("source_id", paymentId)).data).toHaveLength(1);

    // The payment is voided: the uninvoiced event goes.
    await db().from("payments").update({ status: "voided" }).eq("id", paymentId);
    await syncCommissionEvents(organization.id);
    expect((await db().from("billing_events").select("id").eq("source_table", "payments").eq("source_id", paymentId)).data).toEqual([]);

    await db().from("commission_plans").delete().eq("organization_id", organization.id).eq("note", MARK);
  });
});

describe("attendance nudges", () => {
  it("finds today's session and the coach on duty's email", async () => {
    const sessions = await sessionsToNudge(organization.id);
    const mine = sessions.find((s) => s.sessionId === todaySession);
    expect(mine).toMatchObject({ programName: `${MARK} class`, startTime: "9:00 AM", coaches: [{ name: `${MARK} Coach`, email: `test-delete-coach-${TAG}@test.portpass.local` }] });
  });

  it("lists a session whose attendance was never marked, until it is marked", async () => {
    // A week from the last two sessions was marked above; add an unmarked one by clearing last week's.
    await db().from("attendance").delete().eq("session_id", lastWeek);
    const before = await listUnmarkedAttendance();
    expect(before.some((s) => s.sessionId === lastWeek && s.programName === `${MARK} class`)).toBe(true);
    await db().from("attendance").insert({ registration_id: regs.Bravo, session_id: lastWeek, status: "present", marked_by: MARK });
    const after = await listUnmarkedAttendance();
    expect(after.some((s) => s.sessionId === lastWeek)).toBe(false);
  });
});

describe("scheduled jobs and the messages log", () => {
  it("lets a job claim a period once", async () => {
    expect(await claimJobRun(`test-${TAG}`, "2026-10")).toBe(true);
    expect(await claimJobRun(`test-${TAG}`, "2026-10")).toBe(false);
    expect(await claimJobRun(`test-${TAG}`, "2026-11")).toBe(true);
  });

  it("records who was emailed, which template and the outcome, never the text", async () => {
    await logMessage({ organizationId: organization.id, template: `test_${TAG}`, recipient: `test-delete-${TAG}@test.portpass.local`, status: "skipped", detail: "Email is not set up yet." });
    const { data } = await db().from("message_log").select("*").eq("template", `test_${TAG}`).single();
    expect(data).toMatchObject({ organization_id: organization.id, recipient: `test-delete-${TAG}@test.portpass.local`, status: "skipped", detail: "Email is not set up yet." });
    expect(Object.keys(data!).sort()).toEqual(["created_at", "detail", "id", "organization_id", "provider_id", "recipient", "status", "template"]);
  });
});
