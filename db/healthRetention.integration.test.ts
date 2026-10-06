import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nassauToday } from "@/lib/futprepTerms";
import { ensureFutprepPilotData } from "./registrations";
import { getFutprepRegistrationDetail } from "./staff";

// Privacy Policy v2 (brief 16 D): a child's health details are deleted 90
// days after the programme ends. Against CI's local Supabase stack: a
// registration in a term that ended 91 days ago loses its health details
// (and their history) and nothing else; one that ended 89 days ago is left
// alone. Every row is "TEST — delete" and removed afterwards.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const today = nassauToday();

function shift(days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let programId = 0;
let dueId = 0;
let recentId = 0;

function registration(termId: number, orgId: number, label: string) {
  const now = new Date().toISOString();
  return {
    reference_code: `FP-TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    organization_id: orgId,
    program_id: programId,
    term_id: termId,
    parent_name: `${MARK} Parent ${label}`,
    parent_email: `test-delete-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`,
    parent_phone: "+12425550100",
    relationship: "Parent",
    child_name: `${MARK} Child ${label}`,
    child_dob: "2021-03-01",
    gender: "Prefer not to say",
    emergency_contact_name: `${MARK} Emergency`,
    emergency_contact_phone: "+12425550199",
    allergies: "TEST peanut",
    medical_conditions: "TEST asthma",
    medications: "TEST inhaler",
    special_needs: "TEST note",
    authorized_pickup: `${MARK} Pickup`,
    additional_notes: "TEST gets wheezy when running",
    photo_consent: "no",
    payment_frequency: "term",
    payment_method: "cash",
    amount_due_cents: 30000,
    registration_status: "confirmed",
    payment_status: "paid",
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

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  const orgId = Number(org!.id);
  const { data: program, error: programError } = await db()
    .from("programs")
    .insert({ organization_id: orgId, slug: `test-delete-retention-${crypto.randomUUID().slice(0, 6)}`, name: `${MARK} class`, program_type: "term", is_public: false, age_min: 3, age_max: 6, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "9:45 AM", capacity: 20, active: false })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  const { data: terms, error: termError } = await db()
    .from("program_terms")
    .insert([
      { program_id: programId, name: "TEST ended 91 days ago", start_date: shift(-150), end_date: shift(-91), weekly_fee_cents: 3500, term_fee_cents: 30000, active: false },
      { program_id: programId, name: "TEST ended 89 days ago", start_date: shift(-150), end_date: shift(-89), weekly_fee_cents: 3500, term_fee_cents: 30000, active: false },
    ])
    .select("id,name");
  expect(termError).toBeNull();
  const dueTerm = Number(terms!.find((t) => t.name.includes("91"))!.id);
  const recentTerm = Number(terms!.find((t) => t.name.includes("89"))!.id);
  const { data: rows, error: regError } = await db()
    .from("registrations")
    .insert([registration(dueTerm, orgId, "Due"), registration(recentTerm, orgId, "Recent")])
    .select("id,child_name");
  expect(regError).toBeNull();
  dueId = Number(rows!.find((r) => r.child_name.endsWith("Due"))!.id);
  recentId = Number(rows!.find((r) => r.child_name.endsWith("Recent"))!.id);
  const { error: editError } = await db().from("registration_edits").insert({
    registration_id: dueId,
    changed_by: MARK,
    changes: {
      Allergies: { from: "", to: "TEST peanut" },
      "Medical conditions": { from: "TEST old", to: "TEST asthma" },
      Notes: { from: "", to: "TEST gets wheezy when running" },
      "Parent phone": { from: "+12425550000", to: "+12425550100" },
    },
  });
  expect(editError).toBeNull();
});

afterAll(async () => {
  if (programId) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("sessions").delete().eq("program_id", programId);
    await db().from("program_terms").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
});

const HEALTH = "allergies,medical_conditions,medications,special_needs,additional_notes,health_purged_at";
const KEPT = "child_name,child_dob,parent_name,parent_phone,emergency_contact_name,emergency_contact_phone,authorized_pickup,photo_consent,payment_status,signature_name";

describe("children's health details are deleted 90 days after the programme ends", () => {
  it("the nightly run writes one audit_log row saying how many were cleared, and nothing about whom", async () => {
    const before = new Date().toISOString();
    const { data, error } = await db().rpc("purge_expired_health_details_nightly");
    expect(error).toBeNull();
    const { data: rows } = await db().from("audit_log").select("action,target_table,target_id,organization_id,actor_user_id,after").eq("action", "registrations.health_purged").gte("created_at", before).order("id", { ascending: false }).limit(1);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ target_table: "registrations", target_id: null, organization_id: null, actor_user_id: null });
    expect(rows![0].after).toMatchObject({ cleared: Number(data), job: "purge-expired-health-details" });
    expect(JSON.stringify(rows![0])).not.toMatch(/peanut|wheezy|child_name/);
    // The browser roles cannot start it.
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? "", { auth: { persistSession: false } });
    expect((await anon.rpc("purge_expired_health_details_nightly")).error).not.toBeNull();
  });

  it("clears the health fields and their edit history at 91 days, and nothing else", async () => {
    const before = (await db().from("registrations").select(KEPT).eq("id", dueId).single()).data;
    const { data: cleared, error } = await db().rpc("purge_expired_health_details", { p_today: today });
    expect(error).toBeNull();
    expect(Number(cleared)).toBeGreaterThanOrEqual(1);

    const { data: due } = await db().from("registrations").select(HEALTH).eq("id", dueId).single();
    expect(due).toMatchObject({ allergies: "", medical_conditions: "", medications: "", special_needs: "", additional_notes: "" });
    expect(due!.health_purged_at).not.toBeNull();
    // Names, contact, emergency contact, pickup, consent and payment stay.
    expect((await db().from("registrations").select(KEPT).eq("id", dueId).single()).data).toEqual(before);

    const { data: edits } = await db().from("registration_edits").select("changes").eq("registration_id", dueId);
    expect(edits).toHaveLength(1);
    expect(Object.keys(edits![0].changes)).toEqual(["Parent phone"]);
    expect(JSON.stringify(edits)).not.toContain("peanut");
    expect(JSON.stringify(edits)).not.toContain("wheezy");

    // The staff detail view can say "removed", not "none given".
    expect((await getFutprepRegistrationDetail(dueId))?.health_purged_at).not.toBeNull();
  });

  it("leaves a registration alone until its programme has been over for more than 90 days", async () => {
    const { data: recent } = await db().from("registrations").select(HEALTH).eq("id", recentId).single();
    expect(recent).toMatchObject({ allergies: "TEST peanut", medical_conditions: "TEST asthma", medications: "TEST inhaler", special_needs: "TEST note", additional_notes: "TEST gets wheezy when running", health_purged_at: null });
    expect((await getFutprepRegistrationDetail(recentId))?.health_purged_at).toBeNull();
  });

  it("is idempotent: a second run leaves an already-cleared registration untouched", async () => {
    const stamp = (await db().from("registrations").select("health_purged_at").eq("id", dueId).single()).data!.health_purged_at;
    const { error } = await db().rpc("purge_expired_health_details", { p_today: today });
    expect(error).toBeNull();
    expect((await db().from("registrations").select("health_purged_at").eq("id", dueId).single()).data!.health_purged_at).toBe(stamp);
  });

  it("keeps null (never asked) as null for a staff-started registration", async () => {
    await db().from("registrations").update({ allergies: null, medical_conditions: null, medications: null, special_needs: null, health_purged_at: null }).eq("id", dueId);
    await db().rpc("purge_expired_health_details", { p_today: today });
    const { data: due } = await db().from("registrations").select(HEALTH).eq("id", dueId).single();
    expect(due).toMatchObject({ allergies: null, medical_conditions: null, medications: null, special_needs: null });
    expect(due!.health_purged_at).not.toBeNull();
  });

  it("clears health details written again after the first purge (a late staff correction or import)", async () => {
    await db().from("registrations").update({ allergies: "TEST bee stings", additional_notes: "TEST carries an auto-injector" }).eq("id", dueId);
    await db().from("registration_edits").insert({ registration_id: dueId, changed_by: MARK, changes: { Allergies: { from: "", to: "TEST bee stings" } } });
    const { data: cleared, error } = await db().rpc("purge_expired_health_details", { p_today: today });
    expect(error).toBeNull();
    expect(Number(cleared)).toBeGreaterThanOrEqual(1);
    const { data: due } = await db().from("registrations").select(HEALTH).eq("id", dueId).single();
    expect(due).toMatchObject({ allergies: "", additional_notes: "" });
    const { data: edits } = await db().from("registration_edits").select("changes").eq("registration_id", dueId);
    expect(JSON.stringify(edits)).not.toContain("bee stings");
  });

  it("scrubs the edit history even when the detail was typed and blanked again between two runs", async () => {
    // Nothing on the record itself to clear: the value only lives in the history.
    await db().from("registration_edits").insert([
      { registration_id: dueId, changed_by: MARK, changes: { Allergies: { from: "", to: "TEST shellfish" } } },
      { registration_id: dueId, changed_by: MARK, changes: { Allergies: { from: "TEST shellfish", to: null }, "Parent name": { from: "a", to: "b" } } },
    ]);
    const { error } = await db().rpc("purge_expired_health_details", { p_today: today });
    expect(error).toBeNull();
    const { data: edits } = await db().from("registration_edits").select("changes").eq("registration_id", dueId);
    expect(JSON.stringify(edits)).not.toContain("shellfish");
    // The rest of that edit stays.
    expect(JSON.stringify(edits)).toContain("Parent name");
  });

  it("never uses a date later than today: a wrong date can't clear a programme that is still within 90 days", async () => {
    const { error } = await db().rpc("purge_expired_health_details", { p_today: "2099-01-01" });
    expect(error).toBeNull();
    const { data: recent } = await db().from("registrations").select(HEALTH).eq("id", recentId).single();
    expect(recent).toMatchObject({ allergies: "TEST peanut", medical_conditions: "TEST asthma", additional_notes: "TEST gets wheezy when running", health_purged_at: null });
  });

  it("clears 'who entered the medical info' along with the details", async () => {
    await db().from("registrations").update({ allergies: "TEST dust", medical_info_source: "staff" }).eq("id", dueId);
    await db().rpc("purge_expired_health_details", { p_today: today });
    const { data: due } = await db().from("registrations").select("allergies,medical_info_source").eq("id", dueId).single();
    expect(due).toEqual({ allergies: "", medical_info_source: null });
  });
});
