import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import { setBusinessRegistrationStatus } from "./businessRegistrations";
import { createFutprepRegistration, ensureFutprepPilotData, type FutprepRegistrationInput } from "./registrations";
import { updateFutprepRegistration } from "./staff";

// After #200 a new registration takes its place under a lock for the class
// and term. Two other ways of giving out a place did not: the staff desk
// promoting a child from the waitlist (or bringing a cancelled one back),
// and a business's "Confirm the place" button. Each counted and then wrote,
// so two promotions at the same moment, or a promotion racing a parent's
// registration, could put a class over its cap. Now they take the same
// lock. Against the local Supabase stack CI starts; every row is "TEST —
// delete" and removed in afterAll.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${TAG}`;
const programIds: number[] = [];
let futprepId = 0;
let otherOrgId = 0;

type TestClass = { slug: string; programId: number; termId: number; organizationId: number };

async function newClass(organizationId: number, capacity: number): Promise<TestClass> {
  const slug = `test-delete-promote-${crypto.randomUUID().slice(0, 8)}`;
  const { data: program, error: programError } = await db()
    .from("programs")
    .insert({ organization_id: organizationId, slug, name: `${MARK} class`, program_type: "term", is_public: true, age_min: 4, age_max: 8, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "10:00 AM", capacity, active: true })
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
  return { slug, programId, termId: Number(term!.id), organizationId };
}

function child(target: TestClass, over: Partial<FutprepRegistrationInput> = {}): FutprepRegistrationInput {
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
    ...over,
  };
}

// A registration's row id from its reference code.
async function idOf(referenceCode: string): Promise<number> {
  const { data } = await db().from("registrations").select("id").eq("reference_code", referenceCode).single();
  return Number(data!.id);
}

// Register through the right door: Futprep's own, or the other business's scoped form.
async function register(target: TestClass, over: Partial<FutprepRegistrationInput> = {}) {
  const scope = target.organizationId === futprepId ? undefined : { organizationId: target.organizationId, referencePrefix: "OC", consentVersion: "TEST" };
  const placed = await createFutprepRegistration(child(target, over), scope);
  return { ...placed, id: await idOf(placed.referenceCode) };
}

async function allAtOnce<T>(requests: Array<() => Promise<T>>) {
  const settled = await Promise.allSettled(requests.map((request) => request()));
  return {
    ok: settled.filter((r) => r.status === "fulfilled").length,
    refused: settled.flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : [])),
  };
}

const TAKES_A_PLACE = ["pending_details", "pending", "confirmed"];

async function placesTaken(target: TestClass): Promise<number> {
  const { count, error } = await db().from("registrations").select("id", { count: "exact", head: true }).eq("program_id", target.programId).eq("term_id", target.termId).in("registration_status", TAKES_A_PLACE);
  expect(error).toBeNull();
  return Number(count ?? 0);
}

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: futprep } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  futprepId = Number(futprep!.id);
  const { data: other, error } = await db()
    .from("organizations")
    .insert({ name: `TEST delete ${TAG} Other Club`, slug: `test-delete-promote-club-${TAG}`, primary_category: "entertainment", status: "draft" })
    .select("id")
    .single();
  expect(error).toBeNull();
  otherOrgId = Number(other!.id);
});

afterAll(async () => {
  if (programIds.length) {
    expect((await db().from("registrations").delete().in("program_id", programIds)).error).toBeNull();
    expect((await db().from("programs").delete().in("id", programIds)).error).toBeNull();
  }
  if (otherOrgId) {
    await db().from("audit_log").delete().eq("organization_id", otherOrgId);
    expect((await db().from("organizations").delete().eq("id", otherOrgId)).error).toBeNull();
  }
});

describe("the staff desk gives out a place under the class's lock", () => {
  it("five children promoted from the waitlist at once for one free place: one is promoted", async () => {
    const target = await newClass(futprepId, 2);
    const first = await register(target);
    await register(target);
    const waiting = await Promise.all(Array.from({ length: 5 }, () => register(target, { mode: "waitlist" })));
    expect(waiting.every((w) => w.registrationStatus === "waitlist")).toBe(true);
    await updateFutprepRegistration({ registrationId: first.id, registrationStatus: "cancelled" });
    expect(await placesTaken(target)).toBe(1);

    const { ok, refused } = await allAtOnce(waiting.map((w) => () => updateFutprepRegistration({ registrationId: w.id, registrationStatus: "pending" })));

    expect(ok).toBe(1);
    expect(refused).toEqual(Array(4).fill("PROGRAM_FULL"));
    expect(await placesTaken(target)).toBe(2);
  });

  it("a cancelled child can't come back into a full class", async () => {
    const target = await newClass(futprepId, 2);
    const gone = await register(target);
    await register(target);
    await updateFutprepRegistration({ registrationId: gone.id, registrationStatus: "cancelled" });
    await register(target); // takes the freed place
    expect(await placesTaken(target)).toBe(2);

    await expect(updateFutprepRegistration({ registrationId: gone.id, registrationStatus: "pending" })).rejects.toThrow("PROGRAM_FULL");
    await expect(updateFutprepRegistration({ registrationId: gone.id, registrationStatus: "confirmed" })).rejects.toThrow("PROGRAM_FULL");
    expect(await placesTaken(target)).toBe(2);
  });

  it("a child who already has a place is confirmed even when the class is full", async () => {
    const target = await newClass(futprepId, 1);
    const only = await register(target);
    const confirmed = await updateFutprepRegistration({ registrationId: only.id, registrationStatus: "confirmed" });
    expect(confirmed?.childName).toBeTruthy();
    const { data } = await db().from("registrations").select("registration_status").eq("id", only.id).single();
    expect(data!.registration_status).toBe("confirmed");
  });

  it("a promotion and a parent's registration racing for the last place: one place is used", async () => {
    const target = await newClass(futprepId, 2);
    await register(target);
    const waiting = await register(target, { mode: "waitlist" });

    const { ok, refused } = await allAtOnce<unknown>([
      () => updateFutprepRegistration({ registrationId: waiting.id, registrationStatus: "pending" }),
      () => createFutprepRegistration(child(target)),
    ]);

    expect(ok).toBe(1);
    expect(refused).toEqual(["PROGRAM_FULL"]);
    expect(await placesTaken(target)).toBe(2);
  });
});

describe("a business's 'Confirm the place' respects the cap", () => {
  it("confirming a waitlisted child into a full class is refused", async () => {
    const target = await newClass(otherOrgId, 1);
    await register(target);
    const waiting = await register(target, { mode: "waitlist" });

    await expect(setBusinessRegistrationStatus(otherOrgId, waiting.id, "confirmed", null)).rejects.toThrow("PROGRAM_FULL");
    await expect(setBusinessRegistrationStatus(otherOrgId, waiting.id, "pending", null)).rejects.toThrow("PROGRAM_FULL");
    expect(await placesTaken(target)).toBe(1);
  });

  it("four waitlisted children confirmed at once for one free place: one gets it", async () => {
    const target = await newClass(otherOrgId, 1);
    const waiting = await Promise.all(Array.from({ length: 4 }, () => register(target, { mode: "waitlist" })));

    const { ok, refused } = await allAtOnce(waiting.map((w) => () => setBusinessRegistrationStatus(otherOrgId, w.id, "confirmed", null)));

    expect(ok).toBe(1);
    expect(refused).toEqual(Array(3).fill("PROGRAM_FULL"));
    expect(await placesTaken(target)).toBe(1);
  });

  it("a placed child is confirmed or re-opened freely, and cancelling always works", async () => {
    const target = await newClass(otherOrgId, 1);
    const only = await register(target);
    expect((await setBusinessRegistrationStatus(otherOrgId, only.id, "confirmed", null)).status).toBe("confirmed");
    expect((await setBusinessRegistrationStatus(otherOrgId, only.id, "pending", null)).status).toBe("pending");
    expect((await setBusinessRegistrationStatus(otherOrgId, only.id, "cancelled", null)).status).toBe("cancelled");
    expect(await placesTaken(target)).toBe(0);
  });
});
