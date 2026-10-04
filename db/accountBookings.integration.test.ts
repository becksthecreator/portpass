import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAccountBookings } from "./accountBookings";
import { ensureFutprepPilotData } from "./registrations";

// My account (brief 18, F2) against CI's local Supabase stack: a customer
// sees the registrations made with their own email and nobody else's, and
// nothing about a child's health, emergency contact or pickup ever reaches
// the page. Every row is "TEST — delete" and removed afterwards.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;
// An underscore is a wildcard to the database: it must match only itself.
const MINE = `test_delete.${TAG}@test.portpass.local`;
const NEIGHBOUR = `testXdelete.${TAG}@test.portpass.local`;

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

let orgId = 0;
let programId = 0;
let termId = 0;

function registration(label: string, email: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    reference_code: `FP-TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    organization_id: orgId,
    program_id: programId,
    term_id: termId,
    parent_name: `${MARK} Parent ${label}`,
    parent_email: email,
    parent_phone: "+12425550100",
    relationship: "Parent",
    child_name: `Amara ${MARK} ${label}`,
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

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db.from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: program, error: programError } = await db
    .from("programs")
    .insert({ organization_id: orgId, slug: `test-delete-account-${TAG}`, name: `${MARK} class`, program_type: "term", is_public: false, age_min: 3, age_max: 6, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "9:45 AM", capacity: 20, active: false })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const { data: term, error: termError } = await db.from("program_terms").insert({ program_id: programId, name: "TEST term", start_date: day(-7), end_date: day(35), weekly_fee_cents: 3500, term_fee_cents: 30000, active: false }).select("id").single();
  expect(termError).toBeNull();
  termId = Number(term!.id);
  const { error } = await db.from("registrations").insert([
    registration("Mine", MINE, { payment_status: "paid" }),
    registration("Mine cancelled", MINE, { registration_status: "cancelled" }),
    registration("Neighbour", NEIGHBOUR),
  ]);
  expect(error).toBeNull();
});

afterAll(async () => {
  if (programId) {
    await db.from("registrations").delete().eq("program_id", programId);
    await db.from("sessions").delete().eq("program_id", programId);
    await db.from("program_terms").delete().eq("program_id", programId);
    await db.from("programs").delete().eq("id", programId);
  }
});

describe("My account", () => {
  it("shows the registrations made with the account's own email, and nobody else's", async () => {
    // Whatever the case the account's address is written in.
    const mine = await listAccountBookings(MINE.toUpperCase());
    expect(mine.registrations).toHaveLength(2);
    expect(mine.registrations.map((r) => r.status).sort()).toEqual(["cancelled", "confirmed"]);
    const paid = mine.registrations.find((r) => r.status === "confirmed")!;
    expect(paid).toMatchObject({ childFirstName: "Amara", payment: "paid", what: `${MARK} class · TEST term`, href: "/futprep/my" });
    expect(paid.reference).toMatch(/^FP-TEST-/);

    const neighbour = await listAccountBookings(NEIGHBOUR);
    expect(neighbour.registrations).toHaveLength(1);
    expect((await listAccountBookings(`nobody.${TAG}@test.portpass.local`)).registrations).toHaveLength(0);
  });

  it("never carries a health, emergency, pickup or contact detail, and of a child only the first name", async () => {
    const everything = JSON.stringify(await listAccountBookings(MINE));
    for (const hidden of Object.values(HIDDEN)) expect(everything).not.toContain(hidden);
    expect(everything).not.toContain("+1242555");
    expect(everything).not.toContain("2021-03-01");
    // The child's full name is "Amara TEST — delete … Mine": only "Amara" is kept.
    expect(everything).not.toContain(`Amara ${MARK}`);
  });

  it("gives nothing for an address that can't be matched exactly", async () => {
    expect(await listAccountBookings(null)).toEqual({ registrations: [], bookings: [] });
    expect(await listAccountBookings("")).toEqual({ registrations: [], bookings: [] });
    // A wildcard never widens the search.
    expect((await listAccountBookings(`*${TAG}@test.portpass.local`)).registrations).toHaveLength(0);
    expect((await listAccountBookings(`%${TAG}@test.portpass.local`)).registrations).toHaveLength(0);
  });
});
