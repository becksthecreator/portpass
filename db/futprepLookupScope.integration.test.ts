import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import { POST as lookupPOST } from "@/app/api/futprep/registrations/lookup/route";
import {
  completeFutprepRegistration,
  createFutprepPendingRegistration,
  createFutprepRegistration,
  ensureFutprepPilotData,
  getFutprepPendingRegistration,
  getFutprepRegistrationStatus,
  trialJoinQuote,
  type FutprepCompletionInput,
  type FutprepRegistrationInput,
} from "./registrations";

// Found by the security review of #216: Futprep's three lookups by
// reference code matched the code alone, and codes are unique across every
// business. So the parent lookup (code + date of birth) could return another
// business's parent name, email and phone, and the completion page would
// accept another business's pending_details row (rule 3). All three now
// look only inside Futprep, and another business's code reads as "not
// found", the same as a code nobody has. Against the local Supabase stack
// CI starts; every row is "TEST — delete" and removed in afterAll.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;
const DOB = "2092-03-01";
let futprepId = 0;
let otherOrgId = 0;
type TestClass = { slug: string; programId: number; termId: number };
let futprepClass: TestClass;
let otherClass: TestClass;

async function newClass(organizationId: number, label: string): Promise<TestClass> {
  const slug = `test-delete-lookup-${label}-${TAG}`;
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
    childDob: DOB,
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

function completion(referenceCode: string): FutprepCompletionInput {
  return {
    referenceCode,
    childDob: DOB,
    gender: "Female",
    relationship: "Mother",
    parentName: MARK,
    parentEmail: `test-delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
    parentPhone: "+12425550198",
    emergencyContactName: `${MARK} emergency`,
    emergencyContactPhone: "+12425550199",
    allergies: "",
    medicalConditions: "",
    medications: "",
    specialNeeds: "",
    authorizedPickup: `${MARK} pickup`,
    photoConsent: "no",
    paymentFrequency: "weekly",
    paymentMethod: "cash",
    signatureName: MARK,
  };
}

// Another business's registration, made through that business's own scope,
// and a second one left where the desk's quick add leaves a row.
async function theirRegistration(status: "pending" | "pending_details" = "pending"): Promise<string> {
  const theirs = await createFutprepRegistration(child(otherClass), { organizationId: otherOrgId, referencePrefix: "OC", consentVersion: "TEST" });
  expect(theirs.referenceCode.startsWith("OC-")).toBe(true);
  if (status === "pending_details") {
    const { error } = await db().from("registrations").update({ registration_status: "pending_details" }).eq("reference_code", theirs.referenceCode);
    expect(error).toBeNull();
  }
  return theirs.referenceCode;
}

async function refused(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function statusOf(referenceCode: string): Promise<string> {
  const { data, error } = await db().from("registrations").select("registration_status").eq("reference_code", referenceCode).single();
  expect(error).toBeNull();
  return String(data!.registration_status);
}

function lookup(referenceCode: string, childDob: string, ip: string) {
  return lookupPOST(
    new Request("https://portpass.test/api/futprep/registrations/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ referenceCode, childDob }),
    }),
  );
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

describe("Futprep's lookups by reference code find Futprep's registrations only (rule 3)", () => {
  it("the parent lookup can't read another business's registration, even with the right date of birth", async () => {
    const theirCode = await theirRegistration();
    expect(await getFutprepRegistrationStatus(theirCode, DOB)).toBeNull();
  });

  it("the lookup route answers another business's code exactly as it answers a code nobody has", async () => {
    const theirCode = await theirRegistration();
    const theirs = await lookup(theirCode, DOB, "203.0.113.40");
    const unknown = await lookup(`FP-2098-${TAG.toUpperCase()}XX`, DOB, "203.0.113.41");
    expect(theirs.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await theirs.json()).toEqual(await unknown.json());
  });

  it("the completion page can't open another business's pending_details row", async () => {
    const theirCode = await theirRegistration("pending_details");
    expect(await getFutprepPendingRegistration(theirCode)).toBeNull();
  });

  it("the completion form can't complete another business's pending_details row", async () => {
    const theirCode = await theirRegistration("pending_details");
    expect(await refused(completeFutprepRegistration(completion(theirCode)))).toBe("NOT_FOUND");
    expect(await statusOf(theirCode)).toBe("pending_details");
  });

  it("the join-after-a-taster quote can't price another business's trial row", async () => {
    const theirCode = await theirRegistration();
    const { data: session, error: sessionError } = await db()
      .from("sessions")
      .insert({ program_id: otherClass.programId, term_id: otherClass.termId, session_date: "2098-09-06", start_time: "9:00 AM", location: "TEST field" })
      .select("id")
      .single();
    expect(sessionError).toBeNull();
    const { error } = await db().from("registrations").update({ registration_status: "trial", trial_session_id: Number(session!.id) }).eq("reference_code", theirCode);
    expect(error).toBeNull();
    expect(await trialJoinQuote(theirCode)).toBeNull();
  });

  it("Futprep's own codes still work in all three", async () => {
    const family = await createFutprepRegistration(child(futprepClass));
    const status = await getFutprepRegistrationStatus(family.referenceCode, DOB);
    expect(status?.referenceCode).toBe(family.referenceCode);
    expect((await lookup(family.referenceCode, DOB, "203.0.113.42")).status).toBe(200);

    const desk = await createFutprepPendingRegistration({ childName: `${MARK} desk child`, programSlug: futprepClass.slug, termId: futprepClass.termId, enteredByStaff: MARK });
    const pending = await getFutprepPendingRegistration(desk.referenceCode);
    expect(pending?.programSlug).toBe(futprepClass.slug);

    const completed = await completeFutprepRegistration(completion(desk.referenceCode));
    expect(completed.referenceCode).toBe(desk.referenceCode);
    expect(await statusOf(desk.referenceCode)).toBe("pending");
  });
});
