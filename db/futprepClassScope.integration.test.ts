import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import {
  createFutprepPendingRegistration,
  createFutprepRegistration,
  ensureFutprepPilotData,
  type FutprepRegistrationInput,
} from "./registrations";

// Found by the security review of #200: Futprep's own two doors found a
// class by its slug alone, and slugs are unique across every business. So
// the Futprep public form could register a child into another business's
// class, and the staff desk's quick add could put a row there and learn
// that business's reference codes by guessing names (rule 3). Both now
// look only inside Futprep. Against the local Supabase stack CI starts;
// every row is "TEST — delete" and removed in afterAll.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;
let futprepId = 0;
let otherOrgId = 0;
type TestClass = { slug: string; programId: number; termId: number };
let futprepClass: TestClass;
let otherClass: TestClass;

async function newClass(organizationId: number, label: string): Promise<TestClass> {
  const slug = `test-delete-scope-${label}-${TAG}`;
  const { data: program, error: programError } = await db()
    .from("programs")
    .insert({ organization_id: organizationId, slug, name: `${MARK} ${label} class`, program_type: "term", is_public: true, age_min: 4, age_max: 8, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "10:00 AM", capacity: 10, active: true })
    .select("id")
    .single();
  expect(programError).toBeNull();
  const programId = Number(program!.id);
  const { data: term, error: termError } = await db()
    .from("program_terms")
    .insert({ program_id: programId, name: "TEST Term", start_date: "2098-09-06", end_date: "2098-11-22", weekly_fee_cents: 2500, term_fee_cents: 25000, active: true })
    .select("id")
    .single();
  expect(termError).toBeNull();
  return { slug, programId, termId: Number(term!.id) };
}

function child(target: TestClass): FutprepRegistrationInput {
  return {
    parentName: MARK,
    parentEmail: `test-delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
    parentPhone: `+124255501${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`,
    relationship: "Mother",
    childName: `${MARK} child ${crypto.randomUUID().slice(0, 6)}`,
    childDob: "2092-03-01",
    gender: "Female",
    emergencyContactName: `${MARK} emergency`,
    emergencyContactPhone: "+12425550199",
    allergies: "",
    medicalConditions: "",
    medications: "",
    specialNeeds: "",
    authorizedPickup: `${MARK} pickup`,
    additionalNotes: "",
    programSlug: target.slug,
    termId: target.termId,
    paymentFrequency: "weekly",
    paymentMethod: "cash",
    photoConsent: "no",
    consentAccepted: true,
    signatureName: MARK,
    heardAboutUs: "instagram",
    attribution: EMPTY_ATTRIBUTION,
  };
}

async function refused(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function rowCount(target: TestClass): Promise<number> {
  const { count, error } = await db().from("registrations").select("id", { count: "exact", head: true }).eq("program_id", target.programId);
  expect(error).toBeNull();
  return Number(count ?? 0);
}

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: futprep } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  futprepId = Number(futprep!.id);
  const { data: other, error } = await db()
    .from("organizations")
    .insert({ name: `TEST delete ${TAG} Other Club`, slug: `test-delete-other-club-${TAG}`, primary_category: "entertainment", status: "draft" })
    .select("id")
    .single();
  expect(error).toBeNull();
  otherOrgId = Number(other!.id);
  futprepClass = await newClass(futprepId, "futprep");
  otherClass = await newClass(otherOrgId, "other");
});

afterAll(async () => {
  const programIds = [futprepClass?.programId, otherClass?.programId].filter(Boolean);
  if (programIds.length) {
    expect((await db().from("registrations").delete().in("program_id", programIds)).error).toBeNull();
    expect((await db().from("programs").delete().in("id", programIds)).error).toBeNull();
  }
  if (otherOrgId) {
    await db().from("audit_log").delete().eq("organization_id", otherOrgId);
    expect((await db().from("organizations").delete().eq("id", otherOrgId)).error).toBeNull();
  }
});

describe("Futprep's doors open Futprep's classes only (rule 3)", () => {
  it("the Futprep public form can't register a child into another business's class", async () => {
    expect(await refused(createFutprepRegistration(child(otherClass)))).toBe("INVALID_PROGRAM");
    expect(await rowCount(otherClass)).toBe(0);
  });

  it("the staff desk's quick add can't put a child in another business's class, and learns no reference code", async () => {
    // A child the other business already has: the quick add must not even
    // say "duplicate", because that answer carries the reference code.
    const theirs = await createFutprepRegistration(child(otherClass), { organizationId: otherOrgId, referencePrefix: "OC", consentVersion: "TEST" });
    expect(theirs.referenceCode.startsWith("OC-")).toBe(true);
    const { data: theirRow } = await db().from("registrations").select("child_name").eq("reference_code", theirs.referenceCode).single();

    expect(await refused(createFutprepPendingRegistration({ childName: String(theirRow!.child_name), programSlug: otherClass.slug, termId: otherClass.termId, enteredByStaff: MARK }))).toBe("INVALID_PROGRAM");
    expect(await refused(createFutprepPendingRegistration({ childName: `${MARK} desk child`, programSlug: otherClass.slug, enteredByStaff: MARK }))).toBe("INVALID_PROGRAM");
    expect(await rowCount(otherClass)).toBe(1);
  });

  it("Futprep's own classes still take a family and a quick add", async () => {
    const family = await createFutprepRegistration(child(futprepClass));
    expect(family.registrationStatus).toBe("pending");
    expect(family.organizationId).toBe(futprepId);
    const desk = await createFutprepPendingRegistration({ childName: `${MARK} desk child`, programSlug: futprepClass.slug, termId: futprepClass.termId, enteredByStaff: MARK });
    expect(desk.registrationId).toBeGreaterThan(0);
    expect(await rowCount(futprepClass)).toBe(2);
  });

  it("another business's own form still works through its scope", async () => {
    const theirs = await createFutprepRegistration(child(otherClass), { organizationId: otherOrgId, referencePrefix: "OC", consentVersion: "TEST" });
    expect(theirs.organizationId).toBe(otherOrgId);
    // And Futprep's scope on their class is refused the same way.
    expect(await refused(createFutprepRegistration(child(otherClass), { organizationId: futprepId, referencePrefix: "FP", consentVersion: "TEST" }))).toBe("INVALID_PROGRAM");
  });
});
