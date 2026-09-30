import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { summarizePay } from "@/lib/coachPay";
import { nassauToday } from "@/lib/futprepTerms";
import {
  ensureDefaultLead,
  getSessionStaff,
  listContractLines,
  listPayLedger,
  listProgramPnl,
  markCoachMonthPaid,
  setCoachPayDefaults,
  setSessionStaff,
} from "./coachPay";
import { createFutprepProgram, listFutprepPrograms } from "./programs";
import { createFutprepPendingRegistration, createFutprepRegistration, ensureFutprepPilotData, getFutprepAvailability } from "./registrations";
import { listFutprepStaffRegistrations } from "./staff";

// Brief 13 acceptance against the local Supabase stack CI starts: school
// contracts (never public or registrable, a roster by name, sessions
// delivered × fee to invoice), who coached each session, the coach pay
// ledger ("Mark paid", paid rows locked, audit-logged) and the program P&L.
// Every row is "TEST — delete" and removed afterwards.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const today = nassauToday();

function shift(days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let orgId = 0;
let classId = 0;
let classTermId = 0;
let contractId = 0;
let leadCoach = 0;
let assistantCoach = 0;
const locationName = `${MARK} field`;

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: coaches, error } = await db()
    .from("coach_profiles")
    .insert([
      { organization_id: orgId, slug: `test-delete-lead-${crypto.randomUUID().slice(0, 6)}`, display_name: `${MARK} Coach Lead`, member_type: "coach", active: true, public_visible: false, bookable: false, default_lead_pay_cents: 5000, default_assistant_pay_cents: 2500 },
      { organization_id: orgId, slug: `test-delete-asst-${crypto.randomUUID().slice(0, 6)}`, display_name: `${MARK} Coach Assistant`, member_type: "coach", active: true, public_visible: false, bookable: false, default_assistant_pay_cents: 2000 },
    ])
    .select("id,display_name");
  expect(error).toBeNull();
  leadCoach = Number(coaches!.find((c) => c.display_name.endsWith("Lead"))!.id);
  assistantCoach = Number(coaches!.find((c) => c.display_name.endsWith("Assistant"))!.id);

  // A Saturday class that started five weeks ago, so some sessions are done.
  const made = await createFutprepProgram({
    name: `${MARK} class`, ageMin: 3, ageMax: 6, coed: true, locationName, locationAddress: "TEST",
    dayOfWeek: "Saturday", startTime: "10:00 AM", endTime: "10:45 AM", capacity: 20,
    termName: "TEST Term", termStartDate: shift(-35), termEndDate: shift(35), breakDates: [],
    weeklyFeeCents: 4500, termFeeCents: 42000, registrationFeeCents: 0,
  });
  classId = made.id;
  const { data: term } = await db().from("program_terms").select("id").eq("program_id", classId).single();
  classTermId = Number(term!.id);
  await db().from("programs").update({ default_lead_coach_id: leadCoach, field_cost_cents_per_term: 10000 }).eq("id", classId);
});

afterAll(async () => {
  const programIds = [classId, contractId].filter(Boolean);
  if (programIds.length) {
    await db().from("registrations").delete().in("program_id", programIds);
    await db().from("programs").delete().in("id", programIds);
  }
  await db().from("coach_profiles").delete().in("id", [leadCoach, assistantCoach].filter(Boolean));
  await db().from("locations").delete().eq("organization_id", orgId).eq("name", locationName);
  await db().from("audit_log").delete().in("action", ["futprep.coach_pay_marked_paid", "futprep.coach_pay_rates"]).like("after->>by", "TEST — delete%");
});

async function pastSessions(programId: number): Promise<Array<{ id: number; session_date: string }>> {
  const { data } = await db().from("sessions").select("id,session_date").eq("program_id", programId).lte("session_date", today).order("session_date");
  return (data ?? []).map((s) => ({ id: Number(s.id), session_date: String(s.session_date) }));
}

describe("school contracts (brief 13)", () => {
  it("is never public or registrable, and keeps a roster by name", async () => {
    const made = await createFutprepProgram({
      name: `${MARK} St Andrew's`, ageMin: 5, ageMax: 12, coed: true, locationName, locationAddress: "TEST",
      dayOfWeek: "Wednesday", startTime: "2:00 PM", endTime: "3:00 PM", capacity: 30,
      termName: "TEST Fall", termStartDate: shift(-28), termEndDate: shift(28), breakDates: [],
      weeklyFeeCents: 0, termFeeCents: 0, registrationFeeCents: 0,
      programType: "contract", contractClient: `${MARK} St Andrew's School`, contractFeeCents: 15000, contractBilling: "per_session",
    });
    contractId = made.id;
    const { data: row } = await db().from("programs").select("is_public,program_type").eq("id", contractId).single();
    expect(row).toEqual({ is_public: false, program_type: "contract" });

    // The database forces it private even if someone tries.
    await db().from("programs").update({ is_public: true }).eq("id", contractId);
    const { data: again } = await db().from("programs").select("is_public").eq("id", contractId).single();
    expect(again!.is_public).toBe(false);

    // Never offered or registrable.
    expect((await getFutprepAvailability()).some((o) => o.programId === contractId)).toBe(false);
    const slug = (await listFutprepPrograms()).find((p) => p.id === contractId)!.slug;
    await expect(createFutprepRegistration({
      parentName: MARK, parentEmail: "test-delete@test.portpass.local", parentPhone: "+12425550100", relationship: "Mother",
      childName: `${MARK} child`, childDob: "2018-01-01", gender: "Female", emergencyContactName: MARK, emergencyContactPhone: "+12425550100",
      allergies: "", medicalConditions: "", medications: "", specialNeeds: "", authorizedPickup: MARK, additionalNotes: "",
      programSlug: slug, paymentFrequency: "weekly", paymentMethod: "cash", photoConsent: "no", consentAccepted: true, signatureName: MARK,
    })).rejects.toThrow("INVALID_PROGRAM");

    // A child on the roster by name only: confirmed, nothing owed, nothing
    // pending, and not on the families' registration desk.
    const added = await createFutprepPendingRegistration({ childName: `${MARK} pupil`, programSlug: slug, enteredByStaff: MARK });
    const { data: pupil } = await db().from("registrations").select("registration_status,payment_status,amount_due_cents,parent_name,allergies").eq("id", added.registrationId).single();
    expect(pupil).toEqual({ registration_status: "confirmed", payment_status: "waived", amount_due_cents: 0, parent_name: null, allergies: null });
    expect((await listFutprepStaffRegistrations()).some((r) => r.id === added.registrationId)).toBe(false);

    const summary = (await listFutprepPrograms()).find((p) => p.id === contractId)!;
    expect(summary).toMatchObject({ programType: "contract", contractClient: `${MARK} St Andrew's School`, contractFeeCents: 15000, contractBilling: "per_session", siteName: locationName });
  });

  it("invoices sessions delivered × fee", async () => {
    const delivered = (await pastSessions(contractId)).length;
    expect(delivered).toBeGreaterThan(0);
    const line = (await listContractLines()).find((l) => l.client === `${MARK} St Andrew's School`)!;
    expect(line).toMatchObject({ billing: "per_session", feeCents: 15000, sessionsDelivered: delivered, invoiceCents: 15000 * delivered });
    expect(line.sessionsScheduled).toBeGreaterThan(delivered);
    expect(JSON.stringify(line)).not.toContain("pupil");
  });
});

describe("who coached and coach pay (brief 13)", () => {
  it("records who coached, at each coach's rate for the role, never returning pay to the roster", async () => {
    const [first] = await pastSessions(classId);
    const entries = await setSessionStaff(first.id, [{ coachId: leadCoach, role: "lead" }, { coachId: assistantCoach, role: "assistant" }], MARK);
    expect(entries.map((e) => [e.coachId, e.role]).sort()).toEqual([[leadCoach, "lead"], [assistantCoach, "assistant"]].sort());
    const { data: rows } = await db().from("session_staff").select("coach_id,pay_cents").eq("session_id", first.id);
    expect(Object.fromEntries((rows ?? []).map((r) => [Number(r.coach_id), Number(r.pay_cents)]))).toEqual({ [leadCoach]: 5000, [assistantCoach]: 2000 });
    const { data: session } = await db().from("sessions").select("coaches_on_duty").eq("id", first.id).single();
    expect(session!.coaches_on_duty).toBe(2);
    const shown = await getSessionStaff(first.id);
    expect(JSON.stringify(shown)).not.toMatch(/pay|cents/i);
  });

  it("records the class's default lead when a session is marked and nobody said who coached", async () => {
    const [, second] = await pastSessions(classId);
    expect((await getSessionStaff(second.id)).suggestedLead?.coachId).toBe(leadCoach);
    await ensureDefaultLead(second.id, MARK);
    await ensureDefaultLead(second.id, MARK); // once only
    const { data: rows } = await db().from("session_staff").select("coach_id,role,pay_cents").eq("session_id", second.id);
    expect(rows).toEqual([{ coach_id: leadCoach, role: "lead", pay_cents: 5000 }]);
  });

  it("totals a coach's month, marks it paid, logs it, and locks paid rows", async () => {
    const [first] = await pastSessions(classId);
    const month = first.session_date.slice(0, 7);
    const mine = await listPayLedger({ coachId: leadCoach });
    expect(mine.every((row) => row.coachId === leadCoach)).toBe(true);
    const before = summarizePay(mine).find((s) => s.month === month)!;
    expect(before.owedCents).toBeGreaterThan(0);

    const paid = await markCoachMonthPaid({ coachId: leadCoach, month, actor: MARK });
    expect(paid.totalCents).toBe(before.owedCents);
    const after = summarizePay(await listPayLedger({ coachId: leadCoach })).find((s) => s.month === month)!;
    expect(after).toMatchObject({ owedCents: 0, paidCents: before.owedCents });
    const { count } = await db().from("audit_log").select("id", { count: "exact", head: true }).eq("action", "futprep.coach_pay_marked_paid").eq("target_id", String(leadCoach));
    expect(Number(count)).toBeGreaterThan(0);

    // A paid coach can't be taken off the session or switched role.
    await expect(setSessionStaff(first.id, [{ coachId: assistantCoach, role: "assistant" }], MARK)).rejects.toThrow("PAID_ROW_LOCKED");
  });

  it("lets Alex set a coach's rates, used for sessions recorded after", async () => {
    await setCoachPayDefaults({ coachId: assistantCoach, leadCents: 4000, assistantCents: 2200, staffMemberId: null, actor: MARK });
    const sessions = await pastSessions(classId);
    const third = sessions[2];
    await setSessionStaff(third.id, [{ coachId: assistantCoach, role: "assistant" }], MARK);
    const { data: row } = await db().from("session_staff").select("pay_cents").eq("session_id", third.id).eq("coach_id", assistantCoach).single();
    expect(row!.pay_cents).toBe(2200);
    await expect(setCoachPayDefaults({ coachId: assistantCoach, leadCents: -1, assistantCents: null, staffMemberId: null, actor: MARK })).rejects.toThrow("INVALID_RATE");
  });
});

describe("program P&L (brief 13)", () => {
  it("is fees collected minus coach pay, the field and the PortPass fee", async () => {
    // A TEST family PortPass brought in, who paid $420.
    const { data: reg } = await db().from("registrations").insert({
      reference_code: `FP-TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, organization_id: orgId, program_id: classId, term_id: classTermId,
      parent_name: MARK, child_name: `${MARK} child`, payment_frequency: "term", payment_method: "cash", amount_due_cents: 42000,
      registration_status: "confirmed", payment_status: "paid", consent_version: "test", consent_accepted: true, submitted_at: new Date().toISOString(),
      commission_eligible: true, commission_reason: "TEST", is_new_family: true,
    }).select("id").single();
    await db().from("payments").insert({ registration_id: reg!.id, amount_cents: 42000, method: "cash", status: "received", note: MARK, received_at: new Date().toISOString() });

    const { data: staffRows } = await db().from("session_staff").select("pay_cents,sessions!inner(program_id)").eq("sessions.program_id", classId);
    const coachPay = (staffRows ?? []).reduce((sum, r) => sum + Number(r.pay_cents), 0);
    const line = (await listProgramPnl()).find((l) => l.programName === `${MARK} class`)!;
    expect(line).toMatchObject({ kind: "term", feesCollectedCents: 42000, coachPayCents: coachPay, fieldCostCents: 10000, portpassFeeCents: 3360 });
    expect(line.leftCents).toBe(42000 - coachPay - 10000 - 3360);

    const contract = (await listProgramPnl()).find((l) => l.programName === `${MARK} St Andrew's`)!;
    expect(contract.kind).toBe("contract");
    expect(contract.portpassFeeCents).toBe(0);
  });
});
