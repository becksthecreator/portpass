import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import {
  createFutprepRegistration,
  ensureFutprepPilotData,
  getFutprepAvailability,
  listTrialSessions,
  trialJoinQuote,
  type FutprepRegistrationInput,
} from "./registrations";
import { listFutprepStaffSessions, rosterForSession, setSessionCoaches, updateFutprepRegistration } from "./staff";

// Brief 12 acceptance against the local Supabase stack CI starts: ages in
// months (a 17-month-old is refused for a 1½–3 class, an 18-month-old is
// accepted), class caps from the coaches on duty (past the cap a family
// goes on the waitlist), and the pre-term taster Saturday. Every row is
// "TEST — delete" and removed in afterAll.
//
// A Saturday class far in the future so the windows hold whenever CI runs:
// term Sat 3 Jan – Sat 21 Mar 2099 (12 Saturdays), taster Sat 27 Dec 2098, capacity 20,
// 2 children per coach, 1 coach by default (so a cap of 2).
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const SLUG = `test-delete-classes-${crypto.randomUUID().slice(0, 6)}`;
const WEEKLY = 2500;
const TERM_FEE = 25000;
let programId = 0;
let termId = 0;
const sessionOn: Record<string, number> = {};

function child(over: Partial<FutprepRegistrationInput> = {}): FutprepRegistrationInput {
  return {
    parentName: MARK,
    parentEmail: `test-delete-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`,
    parentPhone: `+12425${Math.floor(100000 + Math.random() * 899999)}`,
    relationship: "Mother",
    childName: `${MARK} child ${crypto.randomUUID().slice(0, 4)}`,
    childDob: "2097-01-03", // 24 months on 3 Jan 2099
    gender: "Female",
    emergencyContactName: `${MARK} emergency`,
    emergencyContactPhone: "+12425550199",
    allergies: "",
    medicalConditions: "",
    medications: "",
    specialNeeds: "",
    authorizedPickup: `${MARK} pickup`,
    additionalNotes: "TEST — delete",
    programSlug: SLUG,
    termId,
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

async function refused(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  const { data: program, error: programError } = await db()
    .from("programs")
    .insert({
      organization_id: org!.id, slug: SLUG, name: `${MARK} Lil Kickers`, program_type: "term", is_public: true,
      age_min: 1, age_max: 3, age_min_months: 18, age_max_months: 47, coed: true, location: "TEST field",
      day_of_week: "Saturday", start_time: "9:00 AM", end_time: "9:35 AM", capacity: 20,
      children_per_coach: 2, default_coaches: 1, active: true,
    })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  const { data: term, error: termError } = await db()
    .from("program_terms")
    .insert({ program_id: programId, name: "TEST Term 2", start_date: "2099-01-03", end_date: "2099-03-21", weekly_fee_cents: WEEKLY, term_fee_cents: TERM_FEE, active: true, taster_date: "2098-12-27", trial_spots_per_session: 3 })
    .select("id")
    .single();
  expect(termError).toBeNull();
  termId = Number(term!.id);
  const { data: sessions } = await db().from("sessions").select("id,session_date").eq("term_id", termId).order("session_date");
  for (const s of sessions ?? []) sessionOn[String(s.session_date)] = Number(s.id);
});

afterAll(async () => {
  if (programId) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
});

describe("ages in months (brief 12)", () => {
  it("refuses a 17-month-old and accepts an 18-month-old for a 1½–3 class", async () => {
    expect(await refused(createFutprepRegistration(child({ childDob: "2097-08-03" })))).toBe("AGE_MISMATCH"); // 17 months on 3 Jan 2099
    const ok = await createFutprepRegistration(child({ childDob: "2097-07-03" })); // 18 months
    expect(ok.registrationStatus).toBe("pending");
  });

  it("shows the range the way Futprep writes it", async () => {
    const offer = (await getFutprepAvailability()).find((o) => o.termId === termId);
    expect(offer?.ageLabel).toBe("1½–3");
  });
});

describe("class caps from coaches on duty (brief 12)", () => {
  it("caps registration at coaches × children per coach, then waitlists", async () => {
    // One place is taken by the 18-month-old above; one coach allows two.
    const offer = (await getFutprepAvailability()).find((o) => o.termId === termId);
    expect(offer).toMatchObject({ capacity: 20, effectiveCap: 2, registered: 1, spotsRemaining: 1 });
    await createFutprepRegistration(child());
    expect(await refused(createFutprepRegistration(child()))).toBe("PROGRAM_FULL");
    const waiting = await createFutprepRegistration(child({ mode: "waitlist" }));
    expect(waiting.registrationStatus).toBe("waitlist");

    // Still full: staff can't promote until there is room.
    const { data: waitRow } = await db().from("registrations").select("id").eq("reference_code", waiting.referenceCode).single();
    expect(await refused(updateFutprepRegistration({ registrationId: Number(waitRow!.id), registrationStatus: "pending" }))).toBe("PROGRAM_FULL");

    // A second coach at the next session (the first term Saturday, not the
    // taster) raises the cap to 4.
    const saved = await setSessionCoaches(sessionOn["2099-01-03"], 2);
    expect(saved).toEqual({ coaches: 2, effectiveCap: 4 });
    expect((await getFutprepAvailability()).find((o) => o.termId === termId)).toMatchObject({ effectiveCap: 4, spotsRemaining: 2 });
    await updateFutprepRegistration({ registrationId: Number(waitRow!.id), registrationStatus: "pending" });
    const { data: promoted } = await db().from("registrations").select("registration_status").eq("id", waitRow!.id).single();
    expect(promoted!.registration_status).toBe("pending");
  });

  it("flags a session whose registrations exceed its cap on the staff side", async () => {
    // Three registered; back to one coach on the first Saturday -> cap 2.
    await setSessionCoaches(sessionOn["2099-01-03"], 1);
    const staff = (await listFutprepStaffSessions()).filter((s) => s.term_id === termId);
    const first = staff.find((s) => s.session_date === "2099-01-03");
    expect(first).toMatchObject({ coaches_on_duty: 1, coaches_set: true, children_per_coach: 2, effective_cap: 2, registered: 3, over_cap: true, is_taster: false });
    // A Saturday nobody has set follows the program's default of one coach.
    expect(staff.find((s) => s.session_date === "2099-01-10")).toMatchObject({ coaches_on_duty: 1, coaches_set: false, over_cap: true });
    // Back to the default.
    expect(await setSessionCoaches(sessionOn["2099-01-03"], null)).toEqual({ coaches: 1, effectiveCap: 2 });
    await expect(setSessionCoaches(sessionOn["2099-01-03"], 21)).rejects.toThrow("INVALID_COACHES");
  });
});

describe("the free taster Saturday (brief 12)", () => {
  let tasterRef = "";

  it("creates the taster Saturday before the term, as data", async () => {
    expect(sessionOn["2098-12-27"]).toBeGreaterThan(0);
    expect(Object.keys(sessionOn)).toHaveLength(13); // 12 term Saturdays + the taster
    expect(await listTrialSessions(programId, termId)).toEqual([{ sessionId: sessionOn["2098-12-27"], date: "2098-12-27", spotsLeft: 3 }]);
    const offer = (await getFutprepAvailability()).find((o) => o.termId === termId);
    expect(offer).toMatchObject({ tasterDate: "2098-12-27", trialDates: ["2098-12-27"] });
  });

  it("books a taster child only on the taster Saturday and flags them there", async () => {
    expect(await refused(createFutprepRegistration(child({ mode: "trial", trialSessionId: sessionOn["2099-01-10"], signedInUserId: "test-user" })))).toBe("TRIAL_NOT_AVAILABLE");
    const taster = await createFutprepRegistration(child({ mode: "trial", trialSessionId: sessionOn["2098-12-27"], signedInUserId: "test-user" }));
    tasterRef = taster.referenceCode;
    expect(taster).toMatchObject({ registrationStatus: "trial", amountDueCents: 0 });

    // The taster Saturday's roster is the taster children only; the term's
    // families start on 3 Jan.
    const tasterDay = await rosterForSession(sessionOn["2098-12-27"]);
    expect(tasterDay).toHaveLength(1);
    expect(tasterDay[0]).toMatchObject({ is_trial: true, reference_code: tasterRef });
    const firstSaturday = await rosterForSession(sessionOn["2099-01-03"]);
    expect(firstSaturday.some((r) => r.is_trial)).toBe(false);
    expect(firstSaturday).toHaveLength(3);
  });

  it("prices joining after the taster at no more than the full term", async () => {
    const quote = await trialJoinQuote(tasterRef);
    expect(quote!.remainingSessions).toBe(12);
    expect(quote!.amountCents).toBe(TERM_FEE); // 12 × $25 = $300, capped at the $250 term
  });

  it("keeps the taster Saturday when the term's dates change", async () => {
    await db().from("program_terms").update({ end_date: "2099-03-14" }).eq("id", termId);
    const { data: sessions } = await db().from("sessions").select("session_date").eq("term_id", termId);
    const dates = (sessions ?? []).map((s) => String(s.session_date));
    expect(dates).toContain("2098-12-27");
    expect(dates).not.toContain("2099-03-21");
  });
});
