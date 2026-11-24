import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import { futprepFamilyFor } from "./futprepFamily";
import { createFutprepRegistration, ensureFutprepPilotData, type FutprepRegistrationInput } from "./registrations";

// "Use my details" (register V4, PR 2) against the local stack CI starts.
// Every row is "TEST — delete" and removed in afterAll.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const EMAIL = `test-delete-family-${crypto.randomUUID().slice(0, 8)}@example.com`;
// Same length and letters, but "_" where the real address has "-": as a
// pattern it would match; as an address it is someone else.
const LOOKALIKE = EMAIL.replace("test-delete-family-", "test_delete_family_");
let programId = 0;
let slug = "";
let termId = 0;

const child = (over: Partial<FutprepRegistrationInput>): FutprepRegistrationInput => ({
  parentName: `${MARK} parent`, parentEmail: EMAIL, parentPhone: "+12425550140", relationship: "Mother",
  childName: `${MARK} Ava`, childDob: "2092-03-01", gender: "Female",
  emergencyContactName: `${MARK} SECRET emergency`, emergencyContactPhone: "+12425550199",
  allergies: "SECRET peanuts", medicalConditions: "SECRET asthma", medications: "SECRET inhaler", specialNeeds: "",
  authorizedPickup: `${MARK} SECRET pickup`, additionalNotes: "SECRET note",
  programSlug: slug, termId, paymentFrequency: "weekly", paymentMethod: "cash", photoConsent: "no",
  consentAccepted: true, signatureName: MARK, heardAboutUs: "instagram", attribution: EMPTY_ATTRIBUTION, ...over,
});

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  slug = `test-delete-family-${crypto.randomUUID().slice(0, 8)}`;
  const { data: program, error } = await db().from("programs").insert({ organization_id: org!.id, slug, name: `${MARK} class`, program_type: "term", is_public: true, age_min: 4, age_max: 8, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "10:00 AM", capacity: 20, active: true }).select("id").single();
  expect(error).toBeNull();
  programId = Number(program!.id);
  const { data: term } = await db().from("program_terms").insert({ program_id: programId, name: "TEST Term", start_date: "2098-09-06", end_date: "2098-11-22", weekly_fee_cents: 2500, term_fee_cents: 25000, active: true }).select("id").single();
  termId = Number(term!.id);
  await createFutprepRegistration(child({}));
  await createFutprepRegistration(child({ childName: `${MARK} Ben`, childDob: "2091-05-02", gender: "Male" }));
  await createFutprepRegistration(child({ parentEmail: LOOKALIKE, childName: `${MARK} Other family`, parentPhone: "+12425550141" }));
});

afterAll(async () => {
  if (programId) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
});

describe("Use my details (register V4)", () => {
  it("gives the parent and both children, by the account's exact email, whatever its capitals", async () => {
    const out = await futprepFamilyFor(EMAIL.toUpperCase());
    expect(out.parent).toMatchObject({ name: `${MARK} parent`, phone: "+12425550140", relationship: "Mother" });
    expect(out.children.map((c) => c.name).sort()).toEqual([`${MARK} Ava`, `${MARK} Ben`]);
    expect(out.children.every((c) => c.lastClass === slug)).toBe(true);
  });

  it("never returns health, emergency, pickup or notes (rule 3)", async () => {
    expect(JSON.stringify(await futprepFamilyFor(EMAIL))).not.toMatch(/SECRET/);
  });

  it("never shows another family whose address only looks alike", async () => {
    expect(JSON.stringify(await futprepFamilyFor(EMAIL))).not.toContain("Other family");
    const other = await futprepFamilyFor(LOOKALIKE);
    expect(other.children.map((c) => c.name)).toEqual([`${MARK} Other family`]);
  });

  it("is empty with no email, or one that can't be matched exactly", async () => {
    expect(await futprepFamilyFor(null)).toEqual({ parent: null, children: [] });
    expect(await futprepFamilyFor("test-delete-*@example.com")).toEqual({ parent: null, children: [] });
  });
});
