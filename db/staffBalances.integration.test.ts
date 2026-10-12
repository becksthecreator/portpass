import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFutprepPendingRegistration, ensureFutprepPilotData } from "./registrations";
import { getFutprepMoneySummary, listFutprepStaffRegistrations } from "./staff";

// Audit finding 5 (brief 33): the desk's "Recorded" and "Balance", the
// money strip and the CEO overview read the payments and registrations
// lists, and the API returns at most 1,000 rows a call. Past that, paid
// children showed a balance. Against the local Supabase stack CI starts;
// every row is "TEST — delete" and removed in afterAll.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const programIds: number[] = [];
let organizationId = 0;

async function newClass(): Promise<{ slug: string; programId: number; termId: number }> {
  const slug = `test-delete-balances-${crypto.randomUUID().slice(0, 8)}`;
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

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  organizationId = Number(org!.id);
});

afterAll(async () => {
  if (programIds.length) {
    // Payments go with their registrations (on delete cascade).
    expect((await db().from("registrations").delete().in("program_id", programIds)).error).toBeNull();
    expect((await db().from("programs").delete().in("id", programIds)).error).toBeNull();
  }
});

describe("desk balances read every payment (audit finding 5)", () => {
  it("counts every payment past the first 1,000", async () => {
    const target = await newClass();
    const a = await createFutprepPendingRegistration({ childName: `${MARK} child A`, programSlug: target.slug, termId: target.termId, enteredByStaff: MARK });
    const b = await createFutprepPendingRegistration({ childName: `${MARK} child B`, programSlug: target.slug, termId: target.termId, enteredByStaff: MARK });

    // 1,001 payments of $1 for A, then B's $25 last of all.
    const now = new Date().toISOString();
    const { error: manyError } = await db().from("payments").insert(
      Array.from({ length: 1001 }, () => ({ registration_id: a.registrationId, amount_cents: 100, method: "cash", status: "received", note: MARK, received_at: now })),
    );
    expect(manyError).toBeNull();
    const { error: lastError } = await db().from("payments").insert({ registration_id: b.registrationId, amount_cents: 2500, method: "cash", status: "received", note: MARK, received_at: now });
    expect(lastError).toBeNull();

    const desk = await listFutprepStaffRegistrations();
    expect(desk.find((r) => r.id === a.registrationId)?.paid_cents).toBe(100100);
    expect(desk.find((r) => r.id === b.registrationId)?.paid_cents).toBe(2500);

    const strip = (await getFutprepMoneySummary()).byProgram.find((bucket) => bucket.programSlug === target.slug);
    expect(strip).toMatchObject({ count: 2, collectedCents: 102600 });
  });

  it("lists more than 1,000 children", async () => {
    const target = await newClass();
    const now = new Date().toISOString();
    // The staff desk's quick-add row, 1,001 times.
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      reference_code: `FP-2098-T${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
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
    const { error } = await db().from("registrations").insert(rows);
    expect(error).toBeNull();

    // The last child in name order sits past the first 1,000 rows and the
    // first blocks of 200 ids: its payment is still counted.
    const { data: last } = await db().from("registrations").select("id").eq("program_id", target.programId).eq("child_name", `${MARK} child 1000`).single();
    const { error: payError } = await db().from("payments").insert({ registration_id: last!.id, amount_cents: 1700, method: "cash", status: "received", note: MARK, received_at: now });
    expect(payError).toBeNull();

    const desk = await listFutprepStaffRegistrations();
    expect(desk.filter((r) => r.program_slug === target.slug)).toHaveLength(1001);
    expect(desk.find((r) => r.id === Number(last!.id))?.paid_cents).toBe(1700);
  });
});
