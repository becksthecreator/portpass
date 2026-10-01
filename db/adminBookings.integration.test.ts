import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOOKINGS_CSV_HEADER, HEALTH_FIELDS, reconcile, REVEALS_PER_HOUR } from "@/lib/adminBookings";
import { nassauToday } from "@/lib/futprepTerms";
import { exportBookings, getAdminRegistration, listAdminBookings, revealRegistrationHealth } from "./adminBookings";
import { listAdminPayments, outstandingByBusiness } from "./adminPayments";
import { ensureFutprepPilotData } from "./registrations";

// Admin -> Bookings and Payments (brief 08, 1.6 and 1.7) against CI's local
// Supabase stack. The point of this file is the rule: a child's medical,
// allergy, medication, special-needs and emergency details never appear in
// the list or the export, and are shown only through Reveal, with a reason,
// after the audit log has the entry. Every row is "TEST — delete" and
// removed afterwards.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;

// Distinct, searchable words in every hidden field.
const HIDDEN = {
  emergency_contact_name: `ZZEMERGENCY${TAG}`,
  emergency_contact_phone: "+12425550199",
  allergies: `ZZPEANUT${TAG}`,
  medical_conditions: `ZZASTHMA${TAG}`,
  medications: `ZZINHALER${TAG}`,
  special_needs: `ZZNEEDS${TAG}`,
  authorized_pickup: `ZZPICKUP${TAG}`,
  additional_notes: `ZZWHEEZY${TAG}`,
};

let founder = "";
let orgId = 0;
let programId = 0;
let owingId = 0;
let paidId = 0;
let cancelledId = 0;
let weeklyId = 0;
let termId = 0;

const DAY = 24 * 3600_000;
const dayOffset = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
// A weekly payer who joined three weeks ago.
const JOINED = new Date(Date.now() - 21 * DAY).toISOString();

function registration(label: string, extra: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    reference_code: `FP-TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    organization_id: orgId,
    program_id: programId,
    parent_name: `${MARK} Parent ${label}`,
    parent_email: `test-delete-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`,
    parent_phone: "+12425550100",
    relationship: "Parent",
    child_name: `${MARK} Child ${label}`,
    child_dob: "2021-03-01",
    gender: "Prefer not to say",
    ...HIDDEN,
    photo_consent: "no",
    payment_frequency: "term",
    payment_method: "bank_transfer",
    amount_due_cents: 30000,
    registration_status: "confirmed",
    payment_status: "pending",
    consent_version: "test",
    consent_accepted: true,
    consent_at: now,
    signature_name: `${MARK} Parent ${label}`,
    submitted_at: now,
    is_new_family: false,
    commission_eligible: false,
    commission_reason: "TEST fixture",
    ...extra,
  };
}

const mine = <T extends { organizationId: number | null; detail?: string; payer?: string }>(rows: T[]) => rows.filter((row) => row.organizationId === orgId && `${row.detail ?? ""}${row.payer ?? ""}`.includes(MARK));

beforeAll(async () => {
  await ensureFutprepPilotData();
  const created = await db.auth.admin.createUser({ email: `test-delete-bookings-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  founder = created.data.user.id;
  const { data: org } = await db.from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: program, error: programError } = await db
    .from("programs")
    .insert({ organization_id: orgId, slug: `test-delete-bookings-${TAG}`, name: `${MARK} class`, program_type: "term", is_public: false, age_min: 3, age_max: 6, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "9:45 AM", capacity: 20, active: false })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  // A term that started five weeks ago and runs five more: its Saturday
  // sessions are made by the database when the term is added.
  const { data: term, error: termError } = await db.from("program_terms").insert({ program_id: programId, name: "TEST term", start_date: dayOffset(-35), end_date: dayOffset(35), weekly_fee_cents: 3500, term_fee_cents: 30000, active: false }).select("id").single();
  expect(termError).toBeNull();
  termId = Number(term!.id);
  const { data: rows, error } = await db
    .from("registrations")
    .insert([
      registration("Owing", { term_id: termId, payment_status: "partial" }),
      registration("Paid", { term_id: termId, payment_status: "paid" }),
      registration("Cancelled", { term_id: termId, registration_status: "cancelled" }),
      registration("Weekly", { term_id: termId, registration_status: "pending_details", payment_frequency: "weekly", amount_due_cents: 3500, submitted_at: JOINED }),
    ])
    .select("id,child_name");
  expect(error).toBeNull();
  owingId = Number(rows!.find((r) => r.child_name.endsWith("Owing"))!.id);
  paidId = Number(rows!.find((r) => r.child_name.endsWith("Paid"))!.id);
  cancelledId = Number(rows!.find((r) => r.child_name.endsWith("Cancelled"))!.id);
  weeklyId = Number(rows!.find((r) => r.child_name.endsWith("Weekly"))!.id);
  const { error: paymentError } = await db.from("payments").insert([
    { registration_id: owingId, amount_cents: 10000, method: "cash", status: "received", recorded_by: MARK, note: "", received_at: "2026-10-01T15:00:00Z" },
    { registration_id: owingId, amount_cents: 5000, method: "cash", status: "voided", recorded_by: MARK, note: "", received_at: "2026-10-01T15:05:00Z" },
    { registration_id: paidId, amount_cents: 30000, method: "bank_transfer", status: "received", recorded_by: MARK, note: "", reference: null, received_at: "2026-10-02T15:00:00Z" },
  ]);
  expect(paymentError).toBeNull();
});

afterAll(async () => {
  if (programId) {
    const ids = [owingId, paidId, cancelledId, weeklyId].filter(Boolean);
    if (ids.length) await db.from("payments").delete().in("registration_id", ids);
    await db.from("registrations").delete().eq("program_id", programId);
    await db.from("sessions").delete().eq("program_id", programId);
    await db.from("program_terms").delete().eq("program_id", programId);
    await db.from("programs").delete().eq("id", programId);
  }
  if (founder) {
    await db.from("audit_log").delete().eq("actor_user_id", founder);
    await db.auth.admin.deleteUser(founder);
  }
});

describe("the bookings list", () => {
  it("shows who booked, what for, and what is due and paid", async () => {
    const bookings = mine(await listAdminBookings({ organizationId: orgId, kind: "registration", limit: 5000 }));
    expect(bookings).toHaveLength(4);
    const owing = bookings.find((b) => b.id === owingId)!;
    // A voided payment is not money received.
    expect(owing).toMatchObject({ kind: "registration", customer: `${MARK} Parent Owing`, dueCents: 30000, paidCents: 10000, status: "confirmed", paymentStatus: "partial" });
    expect(owing.detail).toContain(`${MARK} Child Owing`);
    expect(bookings.find((b) => b.id === paidId)).toMatchObject({ dueCents: 30000, paidCents: 30000 });
  });

  it("never carries a health or emergency detail", async () => {
    const bookings = await listAdminBookings({ organizationId: orgId, limit: 5000 });
    const everything = JSON.stringify(bookings);
    for (const value of Object.values(HIDDEN)) expect(everything).not.toContain(value);
    for (const field of HEALTH_FIELDS) expect(everything).not.toContain(field.column);
  });

  it("filters to what still owes: not the paid one, not the cancelled one", async () => {
    const owing = mine(await listAdminBookings({ organizationId: orgId, kind: "registration", owing: true, limit: 5000 }));
    expect(owing.map((b) => b.id).sort()).toEqual([owingId, weeklyId].sort());
    // The screen's own call (no limit given) reads every row before it filters.
    expect(mine(await listAdminBookings({ organizationId: orgId, owing: true })).map((b) => b.id)).toContain(owingId);
  });

  it("charges a weekly payer one week for each session held since they joined, and a cancelled booking nothing", async () => {
    const { data: held } = await db.from("sessions").select("id").eq("term_id", termId).neq("status", "cancelled").gte("session_date", nassauToday(new Date(JOINED))).lte("session_date", nassauToday());
    // Three weeks always holds at least three Saturdays.
    expect(held!.length).toBeGreaterThanOrEqual(3);
    const bookings = mine(await listAdminBookings({ organizationId: orgId, kind: "registration", limit: 5000 }));
    const weekly = bookings.find((b) => b.id === weeklyId)!;
    expect(weekly).toMatchObject({ status: "pending_details", dueCents: 3500 * held!.length, paidCents: 0 });
    expect(weekly.detail).toContain("pays weekly");
    expect(bookings.find((b) => b.id === cancelledId)).toMatchObject({ dueCents: 0 });
    expect(await getAdminRegistration(weeklyId)).toMatchObject({ paysWeekly: true, dueCents: 3500 * held!.length });
  });
});

describe("the export", () => {
  it("is a spreadsheet with no health column and no health detail, and is logged", async () => {
    const { csv, rows } = await exportBookings(orgId, founder);
    expect(rows).toBeGreaterThanOrEqual(3);
    expect(csv.split("\r\n")[0]).toBe(BOOKINGS_CSV_HEADER.join(","));
    expect(csv).toContain(`${MARK} Parent Owing`);
    for (const value of Object.values(HIDDEN)) expect(csv).not.toContain(value);
    const { data: logged } = await db.from("audit_log").select("action,after").eq("actor_user_id", founder).eq("action", "bookings.exported");
    expect(logged).toHaveLength(1);
    expect(logged![0].after).toEqual({ rows });
  });
});

describe("one registration, and Reveal", () => {
  it("opens without the health details", async () => {
    const registration = await getAdminRegistration(owingId);
    expect(registration).toMatchObject({ id: owingId, childName: `${MARK} Child Owing`, dueCents: 30000, paidCents: 10000, healthPurgedAt: null });
    const everything = JSON.stringify(registration);
    for (const value of Object.values(HIDDEN)) expect(everything).not.toContain(value);
    expect(await getAdminRegistration(999_999_999)).toBeNull();
  });

  it("refuses to reveal without a real reason, and logs nothing", async () => {
    await expect(revealRegistrationHealth(owingId, "   ", founder)).rejects.toThrow("REASON_REQUIRED");
    await expect(revealRegistrationHealth(owingId, "too short", founder)).rejects.toThrow("REASON_REQUIRED");
    await expect(revealRegistrationHealth(999_999_999, "TEST a long enough reason", founder)).rejects.toThrow("NOT_FOUND");
    const { data: logged } = await db.from("audit_log").select("id").eq("actor_user_id", founder).eq("action", "registration.health_revealed");
    expect(logged).toHaveLength(0);
  });

  it("reveals with a reason, and the log has who, which registration and why, but not the details", async () => {
    const revealed = await revealRegistrationHealth(owingId, "TEST coach asked about an allergy before class", founder);
    expect(revealed.purgedAt).toBeNull();
    expect(revealed.fields.map((f) => f.label)).toEqual(HEALTH_FIELDS.map((f) => f.label));
    expect(revealed.fields.find((f) => f.label === "Allergies")?.value).toBe(HIDDEN.allergies);
    expect(revealed.fields.find((f) => f.label === "Notes from the parent")?.value).toBe(HIDDEN.additional_notes);

    const { data: logged } = await db.from("audit_log").select("organization_id,target_table,target_id,after").eq("actor_user_id", founder).eq("action", "registration.health_revealed");
    expect(logged).toHaveLength(1);
    expect(logged![0]).toMatchObject({ organization_id: orgId, target_table: "registrations", target_id: String(owingId) });
    expect((logged![0].after as { reason: string }).reason).toBe("TEST coach asked about an allergy before class");
    const entry = JSON.stringify(logged![0]);
    for (const value of Object.values(HIDDEN)) expect(entry).not.toContain(value);
  });

  it("stops at ten reveals an hour for one person, counted from the log itself", async () => {
    const { data: already } = await db.from("audit_log").select("id").eq("actor_user_id", founder).eq("action", "registration.health_revealed");
    const filler = Array.from({ length: REVEALS_PER_HOUR - already!.length }, () => ({ actor_user_id: founder, organization_id: orgId, action: "registration.health_revealed", target_table: "registrations", target_id: String(paidId), after: { reason: "TEST filler for the limit", shown: "health_and_emergency" } }));
    expect((await db.from("audit_log").insert(filler)).error).toBeNull();
    await expect(revealRegistrationHealth(owingId, "TEST one more than the limit allows", founder)).rejects.toThrow("RATE_LIMITED");
    const { data: after } = await db.from("audit_log").select("id").eq("actor_user_id", founder).eq("action", "registration.health_revealed");
    expect(after).toHaveLength(REVEALS_PER_HOUR);
  });
});

describe("payments", () => {
  it("lists what was recorded, with the business and who paid", async () => {
    const payments = mine(await listAdminPayments({ organizationId: orgId }));
    expect(payments).toHaveLength(3);
    expect(payments.find((p) => p.amountCents === 30000)).toMatchObject({ kind: "registration", method: "bank_transfer", status: "received", payer: `${MARK} Parent Paid`, reference: null });
    expect(payments.filter((p) => p.status === "voided")).toHaveLength(1);
  });

  it("adds up a month by method, keeps voided money apart, and flags a transfer with no reference", async () => {
    const lines = reconcile(mine(await listAdminPayments({ organizationId: orgId })));
    const cash = lines.find((l) => l.method === "cash")!;
    const transfer = lines.find((l) => l.method === "bank_transfer")!;
    expect(cash).toMatchObject({ month: "2026-10", count: 1, receivedCents: 10000, voidedCount: 1, voidedCents: 5000, refundedCount: 0, missingReference: 0 });
    expect(transfer).toMatchObject({ month: "2026-10", count: 1, receivedCents: 30000, missingReference: 1 });
  });

  it("counts what customers still owe the business", async () => {
    const outstanding = (await outstandingByBusiness()).find((entry) => entry.organizationId === orgId);
    // At least this file's 200.00 and the weekly payer's three weeks: other tests may leave their own.
    expect(outstanding!.owingCents).toBeGreaterThanOrEqual(20000 + 3 * 3500);
    expect(outstanding!.byKind.find((k) => k.kind === "registration")!.count).toBeGreaterThanOrEqual(1);
  });
});
