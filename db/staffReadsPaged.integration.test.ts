import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFutprepPendingRegistration, ensureFutprepPilotData } from "./registrations";
import { listFutprepSessionPlans, listFutprepStaffSessions, listFutprepWorkLogs, rosterExportForTerm } from "./staff";

// After #203 the desk's registrations and payments are read in pages. The
// API returns at most 1,000 rows a call, and these Futprep staff reads
// still stopped there: the per-session "registered" count, the sessions
// list itself, session plans, work logs and the roster export's payments.
// Against the local Supabase stack CI starts; every row is "TEST — delete"
// and removed in afterAll.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;
const programIds: number[] = [];
let organizationId = 0;

type TestClass = { slug: string; programId: number; termId: number };

async function newClass(): Promise<TestClass> {
  const slug = `test-delete-paged-${crypto.randomUUID().slice(0, 8)}`;
  const { data: program, error: programError } = await db()
    .from("programs")
    .insert({ organization_id: organizationId, slug, name: `${MARK} class`, program_type: "term", is_public: false, age_min: 4, age_max: 8, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "10:00 AM", capacity: 5000, active: true })
    .select("id")
    .single();
  expect(programError).toBeNull();
  const programId = Number(program!.id);
  programIds.push(programId);
  const { data: term, error: termError } = await db()
    .from("program_terms")
    .insert({ program_id: programId, name: "TEST Term", start_date: "2098-09-06", end_date: "2098-11-22", weekly_fee_cents: 2500, term_fee_cents: 25000, active: true })
    .select("id")
    .single();
  expect(termError).toBeNull();
  return { slug, programId, termId: Number(term!.id) };
}

// The staff desk's quick-add row, as a bulk insert.
function quickAddRows(target: TestClass, count: number, now: string) {
  return Array.from({ length: count }, (_, i) => ({
    reference_code: `FP-2098-P${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
    organization_id: organizationId,
    program_id: target.programId,
    term_id: target.termId,
    parent_name: null,
    parent_email: null,
    parent_phone: null,
    child_name: `${MARK} child ${String(i).padStart(4, "0")}`,
    allergies: null,
    medical_conditions: null,
    medications: null,
    special_needs: null,
    payment_frequency: "weekly",
    amount_due_cents: 2500,
    registration_status: "pending_details",
    payment_status: "pending",
    consent_version: "TEST",
    consent_accepted: false,
    additional_notes: "",
    is_new_family: false,
    commission_eligible: false,
    commission_reason: "Entered by staff",
    submitted_at: now,
    entered_by_staff: MARK,
  }));
}

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  organizationId = Number(org!.id);
});

afterAll(async () => {
  if (programIds.length) {
    expect((await db().from("registrations").delete().in("program_id", programIds)).error).toBeNull();
    // Sessions, plans and work logs go with the programme (on delete cascade).
    expect((await db().from("programs").delete().in("id", programIds)).error).toBeNull();
  }
});

describe("the Futprep desk reads every row (past 1,000)", () => {
  it("counts every child in a class on the sessions list", async () => {
    const target = await newClass();
    const { error } = await db().from("registrations").insert(quickAddRows(target, 1001, new Date().toISOString()));
    expect(error).toBeNull();

    const sessions = (await listFutprepStaffSessions()).filter((s) => s.term_id === target.termId);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.registered === 1001)).toBe(true);
  });

  it("lists every session, plan and work log past the first 1,000", async () => {
    const target = await newClass();
    // 1,001 extra days for the term, each with a plan and one coach's log.
    const days = Array.from({ length: 1001 }, (_, i) => {
      const d = new Date(Date.UTC(2099, 0, 1));
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const { data: inserted, error } = await db()
      .from("sessions")
      .insert(days.map((day) => ({ program_id: target.programId, term_id: target.termId, session_date: day, start_time: "9:00 AM", location: "TEST field", status: "scheduled" })))
      .select("id,session_date");
    expect(error).toBeNull();
    const mine = (inserted ?? []).map((s) => Number(s.id));
    expect(mine).toHaveLength(1001);
    expect((await db().from("session_plans").insert(mine.map((id) => ({ session_id: id, title: MARK, plan_text: "TEST plan", updated_by: MARK })))).error).toBeNull();
    expect((await db().from("staff_work_logs").insert(mine.map((id, i) => ({ session_id: id, staff_name: MARK, work_date: days[i], hours: 1 })))).error).toBeNull();

    const sessions = (await listFutprepStaffSessions()).filter((s) => s.term_id === target.termId);
    expect(sessions.filter((s) => mine.includes(s.id))).toHaveLength(1001);

    const plans = (await listFutprepSessionPlans()).filter((p) => p.title === MARK);
    expect(plans).toHaveLength(1001);

    const logs = (await listFutprepWorkLogs()).filter((l) => l.staff_name === MARK);
    expect(logs).toHaveLength(1001);
    expect(logs.reduce((sum, l) => sum + l.hours, 0)).toBe(1001);
  });

  it("the roster export counts every payment past the first 1,000", async () => {
    const target = await newClass();
    const a = await createFutprepPendingRegistration({ childName: `${MARK} paid child`, programSlug: target.slug, termId: target.termId, enteredByStaff: MARK });
    const now = new Date().toISOString();
    const { error } = await db().from("payments").insert(
      Array.from({ length: 1001 }, () => ({ registration_id: a.registrationId, amount_cents: 100, method: "cash", status: "received", note: MARK, received_at: now })),
    );
    expect(error).toBeNull();

    const roster = await rosterExportForTerm(target.programId, target.termId);
    expect(roster).not.toBeNull();
    expect(roster!.rows.find((r) => r.referenceCode === a.referenceCode)?.paidCents).toBe(100100);
  });
});
