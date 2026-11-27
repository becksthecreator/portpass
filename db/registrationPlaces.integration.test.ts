import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updateFutprepRegistrationDetail } from "./staff";
import { getSupabaseAdmin } from "./supabase";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import {
  createFutprepPendingRegistration,
  createFutprepRegistration,
  ensureFutprepPilotData,
  setRegistrationStatusWithinCap,
  type FutprepRegistrationInput,
} from "./registrations";

// Audit finding 2 (brief 33): when a term opens, parents press "Register"
// at the same moment. The last place in a class goes to one child only,
// and a double tap makes one registration, whichever server copy answers.
// Every request below is fired at once, against the local Supabase stack
// CI starts. Every row is "TEST — delete" and removed in afterAll.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const programIds: number[] = [];
let organizationId = 0;

type TestClass = { slug: string; programId: number; termId: number; trialSessionId: number };

// A Saturday class far in the future, open now, with `capacity` places
// and `trialSpots` free taster spots on its first Saturday.
async function newClass(capacity: number, trialSpots = 0): Promise<TestClass> {
  const slug = `test-delete-places-${crypto.randomUUID().slice(0, 8)}`;
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
    .insert({ program_id: programId, name: "TEST Term", start_date: "2098-09-06", end_date: "2098-11-22", weekly_fee_cents: 2500, term_fee_cents: 25000, active: true, trial_dates: ["2098-09-06"], trial_spots_per_session: trialSpots })
    .select("id")
    .single();
  expect(termError).toBeNull();
  const { data: session } = await db().from("sessions").select("id").eq("term_id", term!.id).eq("session_date", "2098-09-06").single();
  return { slug, programId, termId: Number(term!.id), trialSessionId: Number(session!.id) };
}

function child(target: TestClass, over: Partial<FutprepRegistrationInput> = {}): FutprepRegistrationInput {
  const n = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return {
    parentName: MARK,
    parentEmail: `test-delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
    parentPhone: `+124255501${n}`,
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

function staffChild(target: TestClass, childName = `${MARK} desk child ${crypto.randomUUID().slice(0, 6)}`) {
  return { childName, programSlug: target.slug, termId: target.termId, enteredByStaff: MARK };
}

// Fire every request at the same moment; sort what came back.
async function allAtOnce<T>(requests: Array<() => Promise<T>>) {
  const settled = await Promise.allSettled(requests.map((request) => request()));
  return {
    placed: settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    refused: settled.flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : [])),
  };
}

async function rowsIn(target: TestClass) {
  const { data, error } = await db().from("registrations").select("id,child_name,registration_status,reference_code").eq("program_id", target.programId).eq("term_id", target.termId);
  expect(error).toBeNull();
  return data ?? [];
}

const TAKES_A_PLACE = new Set(["pending_details", "pending", "confirmed"]);

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  organizationId = Number(org!.id);
});

afterAll(async () => {
  if (programIds.length) {
    expect((await db().from("registrations").delete().in("program_id", programIds)).error).toBeNull();
    expect((await db().from("programs").delete().in("id", programIds)).error).toBeNull();
  }
});

describe("the last place in a class goes to one child (audit finding 2)", () => {
  it("eight parents pressing for the last place at once: one gets it, seven are told the class is full", async () => {
    const target = await newClass(3);
    await createFutprepRegistration(child(target));
    await createFutprepRegistration(child(target));

    const { placed, refused } = await allAtOnce(Array.from({ length: 8 }, () => () => createFutprepRegistration(child(target))));

    expect(placed).toHaveLength(1);
    expect(placed[0].registrationStatus).toBe("pending");
    expect(refused).toEqual(Array(7).fill("PROGRAM_FULL"));
    expect((await rowsIn(target)).filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(3);
  });

  it("twenty parents for a class of ten, all at once: ten get a place, ten are told the class is full (brief 34)", async () => {
    const target = await newClass(10);

    const { placed, refused } = await allAtOnce(Array.from({ length: 20 }, () => () => createFutprepRegistration(child(target))));

    expect(placed).toHaveLength(10);
    expect(refused).toEqual(Array(10).fill("PROGRAM_FULL"));
    expect((await rowsIn(target)).filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(10);
  });

  it("a full class still takes everyone who asks for the waitlist, all at once", async () => {
    const target = await newClass(1);
    await createFutprepRegistration(child(target));

    const { placed, refused } = await allAtOnce(Array.from({ length: 5 }, () => () => createFutprepRegistration(child(target, { mode: "waitlist" }))));

    expect(refused).toEqual([]);
    expect(placed.map((r) => r.registrationStatus)).toEqual(Array(5).fill("waitlist"));
    const rows = await rowsIn(target);
    expect(rows.filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(1);
    expect(rows.filter((r) => r.registration_status === "waitlist")).toHaveLength(5);
  });

  it("the staff desk adding six children at once to the last place: one is added", async () => {
    const target = await newClass(2);
    await createFutprepPendingRegistration(staffChild(target));

    const { placed, refused } = await allAtOnce(Array.from({ length: 6 }, () => () => createFutprepPendingRegistration(staffChild(target))));

    expect(placed).toHaveLength(1);
    expect(refused).toEqual(Array(5).fill("PROGRAM_FULL"));
    expect((await rowsIn(target)).filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(2);
  });

  it("parents and the desk at the same moment share the one place left", async () => {
    const target = await newClass(2);
    await createFutprepRegistration(child(target));

    const { placed, refused } = await allAtOnce<unknown>([
      ...Array.from({ length: 4 }, () => () => createFutprepRegistration(child(target))),
      ...Array.from({ length: 4 }, () => () => createFutprepPendingRegistration(staffChild(target))),
    ]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual(Array(7).fill("PROGRAM_FULL"));
    expect((await rowsIn(target)).filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(2);
  });

  it("the last free taster spot goes to one child", async () => {
    const target = await newClass(10, 2);
    await createFutprepRegistration(child(target, { mode: "trial", trialSessionId: target.trialSessionId, signedInUserId: "test-user" }));

    const { placed, refused } = await allAtOnce(Array.from({ length: 5 }, () => () => createFutprepRegistration(child(target, { mode: "trial", trialSessionId: target.trialSessionId, signedInUserId: "test-user" }))));

    expect(placed).toHaveLength(1);
    expect(placed[0].registrationStatus).toBe("trial");
    expect(refused).toEqual(Array(4).fill("TRIAL_FULL"));
    expect((await rowsIn(target)).filter((r) => r.registration_status === "trial")).toHaveLength(2);
  });
});

describe("only the server takes a place", () => {
  it("a browser can't call the database function", async () => {
    const target = await newClass(10);
    const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const name = `${MARK} from a browser`;
    const { data, error } = await browser.rpc("create_registration_within_cap", {
      p_row: { reference_code: `FP-2098-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, organization_id: organizationId, program_id: target.programId, term_id: target.termId, child_name: name, payment_frequency: "weekly", amount_due_cents: 0, registration_status: "pending_details", payment_status: "pending", consent_version: "TEST", consent_accepted: false, submitted_at: new Date().toISOString() },
      p_mode: "standard",
      p_cap: 10,
      p_trial_spots: null,
      p_active_statuses: ["pending_details", "pending", "confirmed"],
      p_family_duplicate: false,
    });
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
    expect((await rowsIn(target)).filter((r) => r.child_name === name)).toHaveLength(0);
  });
});

describe("a double tap makes one registration (audit finding 2)", () => {
  it("the same form sent twice at once: one row, and the second is told it is a duplicate", async () => {
    const target = await newClass(10);
    const form = child(target);

    const { placed, refused } = await allAtOnce([() => createFutprepRegistration(form), () => createFutprepRegistration(form)]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual([`DUPLICATE:${placed[0].referenceCode}`]);
    expect((await rowsIn(target)).filter((r) => r.child_name === form.childName)).toHaveLength(1);
  });

  it("the same form sent twice at once for the last place: one row, and the second is told the class is full", async () => {
    const target = await newClass(1);
    const form = child(target);

    const { placed, refused } = await allAtOnce([() => createFutprepRegistration(form), () => createFutprepRegistration(form)]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual(["PROGRAM_FULL"]);
    expect((await rowsIn(target)).filter((r) => r.child_name === form.childName)).toHaveLength(1);
  });

  it("a name is matched whatever its capitals, and % and _ in it are only letters", async () => {
    const target = await newClass(10);
    const form = child(target, { childName: `${MARK} AnnXe!` });
    const first = await createFutprepRegistration(form);

    // Other capitals, same family: the same child.
    await expect(createFutprepRegistration({ ...form, childName: `${MARK} annxE!` })).rejects.toThrow(`DUPLICATE:${first.referenceCode}`);
    // As a pattern "Ann_e%" would match "AnnXe!"; as a name it is another child.
    expect(await createFutprepRegistration({ ...form, childName: `${MARK} Ann_e%` })).toMatchObject({ registrationStatus: "pending" });
  });

  it("the three-tap form with no email, sent twice at once: one row", async () => {
    const target = await newClass(10);
    const form = child(target, { parentEmail: "" });

    const { placed, refused } = await allAtOnce([() => createFutprepRegistration(form), () => createFutprepRegistration(form)]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual([`DUPLICATE:${placed[0].referenceCode}`]);
    expect((await rowsIn(target)).filter((r) => r.child_name === form.childName)).toHaveLength(1);
  });

  it("the waitlist form sent twice at once: one waitlist row", async () => {
    const target = await newClass(1);
    await createFutprepRegistration(child(target));
    const form = child(target, { mode: "waitlist" });

    const { placed, refused } = await allAtOnce([() => createFutprepRegistration(form), () => createFutprepRegistration(form)]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual([`DUPLICATE:${placed[0].referenceCode}`]);
    expect((await rowsIn(target)).filter((r) => r.child_name === form.childName)).toHaveLength(1);
  });

  it("the staff desk adding the same child twice at once: one row", async () => {
    const target = await newClass(10);
    const name = `${MARK} desk twin ${crypto.randomUUID().slice(0, 6)}`;

    const { placed, refused } = await allAtOnce([() => createFutprepPendingRegistration(staffChild(target, name)), () => createFutprepPendingRegistration(staffChild(target, name))]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual([`DUPLICATE:${placed[0].referenceCode}`]);
    expect((await rowsIn(target)).filter((r) => r.child_name === name)).toHaveLength(1);
  });

  it("a free taster booked twice at once: one taster", async () => {
    const target = await newClass(10, 5);
    const form = child(target, { mode: "trial", trialSessionId: target.trialSessionId, signedInUserId: "test-user" });

    const { placed, refused } = await allAtOnce([() => createFutprepRegistration(form), () => createFutprepRegistration(form)]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual(["TRIAL_ALREADY_USED"]);
    expect((await rowsIn(target)).filter((r) => r.child_name === form.childName)).toHaveLength(1);
  });
});

// Left open by the reviews of #200-#222, fixed by migration 202610280010.
describe("one taster per child, whichever class (202610280010)", () => {
  it("the same child's taster asked for in two classes at once: one taster, one refusal", async () => {
    const first = await newClass(10, 5);
    const second = await newClass(10, 5);
    const same = { childName: `${MARK} taster twin ${crypto.randomUUID().slice(0, 6)}`, childDob: "2092-04-02", parentPhone: "+12425550142", mode: "trial" as const, signedInUserId: "test-user" };

    const { placed, refused } = await allAtOnce([
      () => createFutprepRegistration(child(first, { ...same, trialSessionId: first.trialSessionId })),
      () => createFutprepRegistration(child(second, { ...same, trialSessionId: second.trialSessionId })),
    ]);

    expect(placed).toHaveLength(1);
    expect(refused).toEqual(["TRIAL_ALREADY_USED"]);
    const tasters = [...(await rowsIn(first)), ...(await rowsIn(second))].filter((r) => r.child_name === same.childName);
    expect(tasters).toHaveLength(1);
  });
});

describe("moving a child to another class respects that class's cap (202610280010)", () => {
  const deskName = "TEST — delete desk";
  const rowOf = async (id: number) => (await db().from("registrations").select("program_id,term_id,child_name,registration_status").eq("id", id).single()).data!;

  it("a child with a place can't be moved into a full class, and nothing in the edit is saved", async () => {
    const full = await newClass(1);
    await createFutprepPendingRegistration(staffChild(full));
    const from = await newClass(5);
    const moving = await createFutprepPendingRegistration(staffChild(from));

    await expect(updateFutprepRegistrationDetail(moving.registrationId, { programSlug: full.slug, childName: `${MARK} renamed` }, deskName)).rejects.toThrow("PROGRAM_FULL");

    const row = await rowOf(moving.registrationId);
    expect(Number(row.program_id)).toBe(from.programId);
    expect(row.child_name).not.toBe(`${MARK} renamed`);
    expect((await rowsIn(full)).filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(1);
  });

  it("a move into a class with room goes through, with the rest of the edit", async () => {
    const room = await newClass(3);
    const from = await newClass(3);
    const moving = await createFutprepPendingRegistration(staffChild(from));

    await updateFutprepRegistrationDetail(moving.registrationId, { programSlug: room.slug, childName: `${MARK} moved` }, deskName);

    expect(await rowOf(moving.registrationId)).toMatchObject({ program_id: room.programId, term_id: room.termId, child_name: `${MARK} moved` });
  });

  it("a waitlisted child can be moved to a full class: they take no place", async () => {
    const full = await newClass(1);
    await createFutprepPendingRegistration(staffChild(full));
    const from = await newClass(3);
    const waiting = await createFutprepPendingRegistration(staffChild(from));
    expect((await db().from("registrations").update({ registration_status: "waitlist" }).eq("id", waiting.registrationId)).error).toBeNull();

    await updateFutprepRegistrationDetail(waiting.registrationId, { programSlug: full.slug }, deskName);

    expect(await rowOf(waiting.registrationId)).toMatchObject({ program_id: full.programId, registration_status: "waitlist" });
  });

  it("four children moved at once into the last place: one moves, three are refused", async () => {
    const target = await newClass(2);
    await createFutprepPendingRegistration(staffChild(target));
    const movers = await Promise.all(Array.from({ length: 4 }, async () => (await createFutprepPendingRegistration(staffChild(await newClass(3)))).registrationId));

    const { placed, refused } = await allAtOnce(movers.map((id) => () => updateFutprepRegistrationDetail(id, { programSlug: target.slug }, deskName)));

    expect(placed).toHaveLength(1);
    expect(refused).toEqual(Array(3).fill("PROGRAM_FULL"));
    expect((await rowsIn(target)).filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(2);
  });

  it("a move and a reactivation at the same moment never put the new class over its cap (Security & QA on #293)", async () => {
    for (let round = 0; round < 5; round += 1) {
      const full = await newClass(1);
      await createFutprepPendingRegistration(staffChild(full));
      const from = await newClass(3);
      const child = await createFutprepPendingRegistration(staffChild(from));
      expect((await db().from("registrations").update({ registration_status: "cancelled" }).eq("id", child.registrationId)).error).toBeNull();

      await allAtOnce([
        () => updateFutprepRegistrationDetail(child.registrationId, { programSlug: full.slug }, deskName),
        async () => { await setRegistrationStatusWithinCap(getSupabaseAdmin(), { registrationId: child.registrationId, organizationId, status: "pending" }); },
      ]);

      expect((await rowsIn(full)).filter((r) => TAKES_A_PLACE.has(r.registration_status))).toHaveLength(1);
    }
  });

  it("a browser can't call the move function", async () => {
    const target = await newClass(3);
    const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await browser.rpc("move_registration_within_cap", { p_registration_id: 1, p_organization_id: organizationId, p_program_id: target.programId, p_term_id: target.termId, p_cap: 99, p_active_statuses: ["pending"] });
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });
});
