import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import { buildRosterCsv } from "@/lib/rosterCsv";
import {
  createFutprepRegistration,
  ensureFutprepPilotData,
  getFutprepAvailability,
  getFutprepOffer,
  resetFutprepSeedThrottleForTests,
  type FutprepRegistrationInput,
} from "./registrations";
import { markFutprepAttendance, rosterExportForTerm, rosterForSession } from "./staff";

// Brief 06 v2, Part A acceptance, against the local Supabase stack CI
// starts. Every row is "TEST — delete" and removed in afterAll. The camp
// is dated in July 2027 so its window is open whenever CI runs.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const SLUG = `test-delete-camp-${crypto.randomUUID().slice(0, 6)}`;
let programId = 0;
let termId = 0;

function child(over: Partial<FutprepRegistrationInput>): FutprepRegistrationInput {
  return {
    parentName: MARK,
    parentEmail: `test-delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
    parentPhone: `+12425${Math.floor(100000 + Math.random() * 899999)}`,
    relationship: "Mother",
    childName: `${MARK} child ${crypto.randomUUID().slice(0, 4)}`,
    childDob: "2021-03-01", // 6 on 12 Jul 2027
    gender: "Female",
    emergencyContactName: MARK,
    emergencyContactPhone: "+12425550199",
    allergies: "TEST peanut",
    medicalConditions: "TEST asthma",
    medications: "TEST inhaler",
    specialNeeds: "",
    authorizedPickup: MARK,
    additionalNotes: "TEST — delete",
    programSlug: SLUG,
    termId,
    paymentFrequency: "weekly", // a camp ignores this: always the full camp fee
    paymentMethod: "cash",
    photoConsent: "no",
    consentAccepted: true,
    signatureName: MARK,
    heardAboutUs: "qr",
    attribution: { ...EMPTY_ATTRIBUTION, utmSource: "portpass", utmMedium: "qr", utmCampaign: "october_camp" },
    ...over,
  };
}

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  const { data: program, error: programError } = await db()
    .from("programs")
    .insert({ organization_id: org!.id, slug: SLUG, name: `${MARK} camp`, program_type: "camp", is_public: true, age_min: 5, age_max: 8, coed: true, location: "TEST field", day_of_week: "Weekdays", start_time: "9:00 AM", end_time: "12:00 PM", capacity: 2, active: true })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  const { data: term, error: termError } = await db()
    .from("program_terms")
    .insert({ program_id: programId, name: "TEST July 2027", start_date: "2027-07-12", end_date: "2027-07-16", break_dates: ["2027-07-14"], weekly_fee_cents: 0, term_fee_cents: 15000, daily_start_time: "9:00 AM", daily_end_time: "12:00 PM", what_to_bring: "TEST water", active: true })
    .select("id")
    .single();
  expect(termError).toBeNull();
  termId = Number(term!.id);
});

afterAll(async () => {
  if (programId) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
});

describe("holiday camps (brief 06 v2, Part A)", () => {
  it("generates one session per weekday, skipping the break date", async () => {
    const { data } = await db().from("sessions").select("session_date").eq("term_id", termId).order("session_date");
    expect((data ?? []).map((s) => s.session_date)).toEqual(["2027-07-12", "2027-07-13", "2027-07-15", "2027-07-16"]);
  });

  it("lists the open public camp with its term", async () => {
    const camp = (await getFutprepAvailability()).find((o) => o.slug === SLUG);
    expect(camp).toMatchObject({ programType: "camp", termId, termFeeCents: 15000, spotsRemaining: 2, whatToBring: "TEST water" });
  });

  let first: FutprepRegistrationInput;
  it("registers a TEST child for the camp fee, with its source recorded", async () => {
    first = child({});
    const result = await createFutprepRegistration(first);
    expect(result.referenceCode).toMatch(/^FP-\d{4}-[A-Z0-9]{8}$/);
    expect(result.amountDueCents).toBe(15000);
    expect(result.paymentFrequency).toBe("term");
    const { data } = await db().from("registrations").select("amount_due_cents,payment_frequency,term_id,source_channel,utm_source,utm_medium,utm_campaign").eq("reference_code", result.referenceCode).single();
    expect(data).toMatchObject({ amount_due_cents: 15000, payment_frequency: "term", term_id: termId, source_channel: "qr", utm_source: "portpass", utm_medium: "qr", utm_campaign: "october_camp" });
  });

  it("refuses a child outside the age range and a duplicate", async () => {
    await expect(createFutprepRegistration(child({ childDob: "2024-01-01" }))).rejects.toThrow("AGE_MISMATCH");
    await expect(createFutprepRegistration({ ...first })).rejects.toThrow(/^DUPLICATE:/);
  });

  it("refuses the (capacity + 1)th registration", async () => {
    await createFutprepRegistration(child({}));
    await expect(createFutprepRegistration(child({}))).rejects.toThrow("PROGRAM_FULL");
  });

  it("puts the campers on each day's roster, takes attendance per day, and exports without medical fields", async () => {
    const { data: days } = await db().from("sessions").select("id,session_date").eq("term_id", termId).order("session_date");
    const roster = await rosterForSession(Number(days![0].id));
    expect(roster).toHaveLength(2);
    await markFutprepAttendance({ sessionId: Number(days![0].id), registrationId: roster[0].registration_id, status: "present", markedBy: "TEST" });
    await markFutprepAttendance({ sessionId: Number(days![1].id), registrationId: roster[0].registration_id, status: "absent", markedBy: "TEST" });

    const exported = await rosterExportForTerm(programId, termId);
    expect(exported!.days).toHaveLength(4);
    expect(exported!.rows).toHaveLength(2);
    const marked = exported!.rows.find((r) => Object.keys(r.attendance).length > 0)!;
    expect(marked.attendance).toEqual({ "2027-07-12": "present", "2027-07-13": "absent" });

    const csv = buildRosterCsv(exported!.rows, exported!.days);
    for (const secret of ["TEST peanut", "TEST asthma", "TEST inhaler", "+12425550199"]) expect(csv).not.toContain(secret);
    expect(JSON.stringify(exported)).not.toMatch(/allerg|medical|medication|emergency/i);
  });

  it("closes at registration_closes_at, and an unlisted camp is reachable only by link", async () => {
    await db().from("programs").update({ is_public: false }).eq("id", programId);
    expect((await getFutprepAvailability()).some((o) => o.slug === SLUG)).toBe(false);
    expect(await getFutprepOffer(SLUG, termId)).not.toBeNull();

    await db().from("program_terms").update({ registration_closes_at: "2020-01-01T00:00:00Z" }).eq("id", termId);
    expect(await getFutprepOffer(SLUG, termId)).toBeNull();
    await expect(createFutprepRegistration(child({}))).rejects.toThrow("TERM_CLOSED");
  });
});

describe("the Futprep seed never re-activates a term staff switched off", () => {
  it("leaves Term 1 inactive after the seed runs again", async () => {
    const { data: program } = await db().from("programs").select("id").eq("slug", "lil-kickers").single();
    const termFilter = () => db().from("program_terms").select("active").eq("program_id", program!.id).eq("name", "Term 1").single();
    await db().from("program_terms").update({ active: false }).eq("program_id", program!.id).eq("name", "Term 1");
    try {
      resetFutprepSeedThrottleForTests();
      await ensureFutprepPilotData();
      await getFutprepAvailability();
      expect((await termFilter()).data!.active).toBe(false);
    } finally {
      await db().from("program_terms").update({ active: true }).eq("program_id", program!.id).eq("name", "Term 1");
    }
  });
});
