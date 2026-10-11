import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROTECTED_CHILD_COLUMNS } from "@/lib/health";
import { nassauToday } from "@/lib/futprepTerms";
import { buildAttendanceCsv, buildMoneyCsv } from "@/lib/ownerDashboard";
import { addDays } from "@/lib/paymentRequests/rules";
import { createDraftBusiness } from "./business";
import { loadAttendance, loadMoneyRows, loadOwnerDashboard } from "./ownerDashboard";
import { createPaymentRequest, markPaymentRequestSent, recordRequestPayment, savePaymentSettings } from "./paymentRequests";

// The owner's dashboard (brief 27, B) against the local Supabase stack: a
// TEST business with a TEST class, two TEST children, a held session with
// one mark, a coming Saturday, three payment requests (paid, overdue and a
// TEST one) and an accepted private session this week. A second TEST
// business sees none of it. Everything is deleted in afterAll; nothing
// sends (no email path is touched).
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
const MARK = "TEST — delete";
const today = nassauToday();
const heldDay = addDays(today, -7);
const nextDay = addDays(today, 3);
let userId = "";
let orgId = 0;
let otherOrgId = 0;
let programId = 0;
let termId = 0;
let privateId = 0;
const registrationIds: number[] = [];
const sessionIds: number[] = [];
const requestIds: number[] = [];

const actor = () => ({ userId, name: `${MARK} owner` });

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `dash-owner-${tag}@test.portpass.local`, email_confirm: true });
  expect(created.error).toBeNull();
  userId = created.data.user!.id;
  await admin.from("profiles").upsert({ user_id: userId, full_name: `${MARK} owner` });
  orgId = (await createDraftBusiness({ name: `${MARK} Dash Biz ${tag}`, section: "sports-fitness", subcategory: null, ownerUserId: userId, actorUserId: userId })).id;
  otherOrgId = (await createDraftBusiness({ name: `${MARK} Other Dash Biz ${tag}`, section: "sports-fitness", subcategory: null, ownerUserId: null, actorUserId: userId })).id;

  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: orgId, slug: `test-delete-dash-${tag}`, name: "TEST Kickers", age_min: 3, age_max: 6, location: "TEST field", day_of_week: "Saturday", start_time: "10:00 AM", capacity: 20, is_public: false })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  const { data: term, error: termError } = await admin.from("program_terms").insert({ program_id: programId, name: "TEST Term", start_date: addDays(today, -30), end_date: addDays(today, 40), weekly_fee_cents: 4500, term_fee_cents: 42000 }).select("id").single();
  expect(termError).toBeNull();
  termId = Number(term!.id);

  const { data: sessions, error: sessionError } = await admin
    .from("sessions")
    .insert([
      { program_id: programId, term_id: termId, session_date: heldDay, start_time: "10:00 AM", location: "TEST field", status: "scheduled" },
      { program_id: programId, term_id: termId, session_date: nextDay, start_time: "10:00 AM", location: "TEST field", status: "scheduled" },
    ])
    .select("id,session_date");
  expect(sessionError).toBeNull();
  for (const s of sessions!) sessionIds.push(Number(s.id));
  const heldSessionId = Number(sessions!.find((s) => s.session_date === heldDay)!.id);

  const { data: regs, error: regError } = await admin
    .from("registrations")
    .insert(["Amara", "Bodie"].map((first) => ({
      reference_code: `FP-TESTD-${first.slice(0, 1)}${tag.toUpperCase()}`, organization_id: orgId, program_id: programId, term_id: termId,
      parent_name: `${MARK} Parent`, parent_email: `dash-parent-${tag}@example.com`, parent_phone: "242-555-0101",
      child_name: `${first} TEST`, payment_frequency: "weekly", amount_due_cents: 4500,
      registration_status: "confirmed", payment_status: "pending", consent_version: "test", consent_accepted: true, submitted_at: new Date().toISOString(),
    })))
    .select("id,child_name");
  expect(regError).toBeNull();
  for (const r of regs!) registrationIds.push(Number(r.id));
  const amara = Number(regs!.find((r) => String(r.child_name).startsWith("Amara"))!.id);
  const { error: markError } = await admin.from("attendance").insert({ registration_id: amara, session_id: heldSessionId, status: "present", marked_by: MARK });
  expect(markError).toBeNull();

  const { data: priv, error: privError } = await admin
    .from("private_session_requests")
    .insert({ reference_code: `FP-S-TEST-${tag.toUpperCase()}`, organization_id: orgId, parent_name: `${MARK} Parent`, parent_email: `dash-parent-${tag}@example.com`, parent_phone: "242-555-0102", child_name: "Cleo TEST", child_age: 5, requested_date: today, requested_start_time: "4:00 PM", duration_minutes: 30, location_preference: "TEST field", status: "accepted", children_count: 1 })
    .select("id")
    .single();
  expect(privError).toBeNull();
  privateId = Number(priv!.id);

  await savePaymentSettings(orgId, { referencePrefix: "TDB", bankName: "TEST Bank", accountName: MARK, accountNumberLast4: "0000", transferInstructions: "TEST", kanooHandleOrPhone: "", cashNote: "TEST desk", defaultDueDays: 7, acceptedMethods: ["bank_transfer", "cash"] }, actor());
  const request = (over: Record<string, unknown> = {}) => ({
    customerName: `${MARK} Parent`, customerEmail: `dash-parent-${tag}@example.com`, customerPhone: "242-555-0101", personId: null,
    lines: [{ label: "TEST term fee", qty: 1, unitCents: 42000 }], totalCents: 42000, dueDate: addDays(today, 7), allowPartPayment: false,
    methods: ["bank_transfer" as const, "cash" as const], offeringId: null, registrationId: null, privateSessionRequestId: null, reservationId: null, ...over,
  });
  const paidRequest = await createPaymentRequest(orgId, request(), actor(), "TDB");
  await markPaymentRequestSent(orgId, paidRequest.id, "in_person", actor());
  await recordRequestPayment(orgId, paidRequest.id, { amountCents: 42000, method: "bank_transfer", receivedAt: new Date().toISOString(), reference: "TEST-REF", note: "" }, actor());
  const overdueRequest = await createPaymentRequest(orgId, request({ lines: [{ label: "TEST Saturday", qty: 1, unitCents: 4500 }], totalCents: 4500 }), actor(), "TDB");
  await markPaymentRequestSent(orgId, overdueRequest.id, "in_person", actor());
  await admin.from("payment_requests").update({ due_date: addDays(today, -3) }).eq("id", overdueRequest.id);
  const testRequest = await createPaymentRequest(orgId, request({ customerEmail: `dash-owner-${tag}@test.portpass.local` }), actor(), "TDB", { isTest: true });
  await markPaymentRequestSent(orgId, testRequest.id, "in_person", actor());
  await recordRequestPayment(orgId, testRequest.id, { amountCents: 42000, method: "cash", receivedAt: new Date().toISOString(), reference: "", note: "" }, actor());
  requestIds.push(paidRequest.id, overdueRequest.id, testRequest.id);
});

afterAll(async () => {
  if (requestIds.length) await admin.from("payments").delete().in("payment_request_id", requestIds);
  if (sessionIds.length) await admin.from("attendance").delete().in("session_id", sessionIds);
  if (sessionIds.length) await admin.from("sessions").delete().in("id", sessionIds);
  if (registrationIds.length) await admin.from("registrations").delete().in("id", registrationIds);
  if (privateId) await admin.from("private_session_requests").delete().eq("id", privateId);
  if (termId) await admin.from("program_terms").delete().eq("id", termId);
  if (programId) await admin.from("programs").delete().eq("id", programId);
  for (const id of [orgId, otherOrgId].filter(Boolean)) {
    await admin.from("payment_requests").delete().eq("organization_id", id);
    await admin.from("audit_log").delete().eq("organization_id", id);
    const { error } = await admin.from("organizations").delete().eq("id", id);
    expect(error).toBeNull();
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("the owner's dashboard (brief 27, B)", () => {
  it("adds up the four tiles from the business's own rows", async () => {
    const data = await loadOwnerDashboard(orgId, { money: true });
    expect(data.tiles.collectedThisMonthCents).toBe(42000);
    expect(data.tiles.owedCents).toBe(4500);
    expect(data.tiles.owedCount).toBe(1);
    expect(data.tiles.nextSessionDay).toEqual({ date: nextDay, booked: 2, sessions: 1 });
    expect(data.tiles.privateThisWeek).toEqual({ accepted: 1, pending: 0 });
  });

  it("lists money without the TEST request, with method and date for the paid one", async () => {
    const data = await loadOwnerDashboard(orgId, { money: true });
    const rows = data.money!.rows;
    expect(rows.map((r) => r.status).sort()).toEqual(["overdue", "paid"]);
    const paid = rows.find((r) => r.status === "paid")!;
    expect(paid.method).toBe("Bank transfer");
    expect(paid.paidAt).not.toBeNull();
    expect(paid.what).toBe("TEST term fee");
    expect(rows.find((r) => r.status === "overdue")!.balanceCents).toBe(4500);
    expect(data.money!.months[0]).toBe(today.slice(0, 7));
    expect(await loadMoneyRows(orgId)).toHaveLength(2);
  });

  it("shows each session's marks and each child's rate, names only", async () => {
    const { sessions, rates } = await loadAttendance(orgId);
    const held = sessions.find((s) => s.kind === "class" && s.date === heldDay)!;
    expect(held).toMatchObject({ name: "TEST Kickers", booked: 2, present: 1, absent: 0, notMarked: 1 });
    const coming = sessions.find((s) => s.kind === "class" && s.date === nextDay)!;
    expect(coming).toMatchObject({ booked: 2, present: 0, absent: 0, notMarked: 2 });
    const privateRow = sessions.find((s) => s.kind === "private")!;
    expect(privateRow).toMatchObject({ booked: 1, present: 0, absent: 0 });
    expect(privateRow.name).toContain("Cleo TEST");
    expect(rates.map((r) => [r.name, r.held, r.present, r.rate])).toEqual([["Amara TEST", 1, 1, 1], ["Bodie TEST", 1, 0, 0]]);

    const csv = buildAttendanceCsv(sessions, rates).toLowerCase();
    for (const column of PROTECTED_CHILD_COLUMNS) expect(csv).not.toContain(column);
    for (const word of ["allerg", "medic", "emergency", "pickup"]) expect(csv).not.toContain(word);
    expect(Object.keys(sessions[0]).some((key) => /allerg|medic|emergency|pickup|phone|email/i.test(key))).toBe(false);
  });

  it("a coach's load never runs the money queries", async () => {
    const data = await loadOwnerDashboard(orgId, { money: false });
    expect(data.money).toBeNull();
    expect(data.tiles.collectedThisMonthCents).toBe(0);
    expect(data.sessions.length).toBeGreaterThan(0);
  });

  it("another business sees none of it", async () => {
    const data = await loadOwnerDashboard(otherOrgId, { money: true });
    expect(data.money!.rows).toEqual([]);
    expect(data.sessions).toEqual([]);
    expect(data.rates).toEqual([]);
    expect(data.tiles).toMatchObject({ collectedThisMonthCents: 0, owedCents: 0, nextSessionDay: null, privateThisWeek: { accepted: 0, pending: 0 } });
    expect(buildMoneyCsv(data.money!.rows).split("\r\n")).toHaveLength(2);
  });
});
