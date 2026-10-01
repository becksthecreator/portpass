import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import {
  createFutprepRegistration,
  createReturnLink,
  ensureFutprepPilotData,
  getFutprepAvailability,
  listTrialSessions,
  openReturnLink,
  returnLinkPrefill,
  trialJoinQuote,
  type FutprepRegistrationInput,
} from "./registrations";
import { rosterForSession, updateFutprepRegistration } from "./staff";

// Brief 06 v2, Part C acceptance, against the local Supabase stack CI
// starts: return links prefill everything except medical and expire;
// waitlist and promote; the 4th trial on a Saturday and a 2nd trial for
// the same child are refused; joining after a trial is priced for the
// Saturdays left. Every row is "TEST — delete" and removed in afterAll.
//
// A Saturday class (capacity 3) with two terms far in the future so the
// windows hold whenever CI runs:
//   T1  6 Sep - 22 Nov 2098, open now, 12 Saturdays, trials on the first two
//   T2  3 Jan - 21 Mar 2099, opens to everyone 1 Jan 2098; early access
//       (return links) until then
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const SLUG = `test-delete-term2-${crypto.randomUUID().slice(0, 6)}`;
const WEEKLY = 2500;
let programId = 0;
let t1 = 0;
let t2 = 0;
const saturday: Record<string, number> = {};

function child(over: Partial<FutprepRegistrationInput> = {}): FutprepRegistrationInput {
  return {
    parentName: MARK,
    parentEmail: `test-delete-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`,
    parentPhone: `+12425${Math.floor(100000 + Math.random() * 899999)}`,
    relationship: "Father",
    childName: `${MARK} child ${crypto.randomUUID().slice(0, 4)}`,
    childDob: "2092-03-01", // 6 in both terms
    gender: "Male",
    emergencyContactName: `${MARK} emergency`,
    emergencyContactPhone: "+12425550199",
    allergies: "TEST peanut",
    medicalConditions: "TEST asthma",
    medications: "TEST inhaler",
    specialNeeds: "TEST none",
    authorizedPickup: `${MARK} pickup`,
    additionalNotes: "TEST — delete",
    programSlug: SLUG,
    termId: t1,
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
    .insert({ organization_id: org!.id, slug: SLUG, name: `${MARK} class`, program_type: "term", is_public: true, age_min: 4, age_max: 8, coed: true, location: "TEST field", day_of_week: "Saturday", start_time: "9:00 AM", end_time: "10:00 AM", capacity: 3, active: true })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);

  const { data: term1, error: t1Error } = await db()
    .from("program_terms")
    .insert({ program_id: programId, name: "TEST Term A", start_date: "2098-09-06", end_date: "2098-11-22", weekly_fee_cents: WEEKLY, term_fee_cents: 25000, active: true, trial_dates: ["2098-09-06", "2098-09-13"], trial_spots_per_session: 3 })
    .select("id")
    .single();
  expect(t1Error).toBeNull();
  t1 = Number(term1!.id);

  const { data: term2, error: t2Error } = await db()
    .from("program_terms")
    .insert({ program_id: programId, name: "TEST Term B", start_date: "2099-01-03", end_date: "2099-03-21", weekly_fee_cents: WEEKLY, term_fee_cents: 25000, active: true, registration_opens_at: "2098-01-01T05:00:00Z", early_access_until: "2098-01-01T04:59:00Z" })
    .select("id")
    .single();
  expect(t2Error).toBeNull();
  t2 = Number(term2!.id);

  const { data: sessions } = await db().from("sessions").select("id,session_date").eq("term_id", t1).order("session_date");
  for (const s of sessions ?? []) saturday[String(s.session_date)] = Number(s.id);
});

afterAll(async () => {
  if (programId) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
});

describe("Term 2 early access, trials and the waitlist (brief 06 v2, Part C)", () => {
  it("generates a session for every Saturday of a class term", () => {
    expect(Object.keys(saturday)).toHaveLength(12);
    expect(saturday["2098-09-06"]).toBeGreaterThan(0);
    expect(saturday["2098-11-22"]).toBeGreaterThan(0);
  });

  it("keeps a term that hasn't opened to everyone off the public list", async () => {
    const offers = await getFutprepAvailability();
    expect(offers.some((o) => o.termId === t1)).toBe(true);
    expect(offers.some((o) => o.termId === t2)).toBe(false);
    expect(await refused(createFutprepRegistration(child({ termId: t2 })))).toBe("TERM_CLOSED");
  });

  let token = "";
  let sourceChild: FutprepRegistrationInput;

  it("a return link prefills everything except medical, and opens the next term early", async () => {
    sourceChild = child();
    await createFutprepRegistration(sourceChild);
    const { data: source } = await db().from("registrations").select("id").eq("program_id", programId).eq("child_name", sourceChild.childName).single();
    token = (await createReturnLink(Number(source!.id), MARK)).token;

    // Only the hash is stored.
    const { data: stored } = await db().from("futprep_return_links").select("token_hash").eq("source_registration_id", source!.id).single();
    expect(stored!.token_hash).not.toContain(token);

    const prefill = await returnLinkPrefill(token);
    expect(prefill).not.toBeNull();
    expect(prefill!.childName).toBe(sourceChild.childName);
    expect(prefill!.childDob).toBe(sourceChild.childDob);
    expect(prefill!.parentPhone).toBe(sourceChild.parentPhone);
    expect(prefill!.emergencyContactName).toBe(sourceChild.emergencyContactName);
    expect(prefill!.authorizedPickup).toBe(sourceChild.authorizedPickup);
    const keys = Object.keys(prefill!).join(" ").toLowerCase();
    expect(keys).not.toMatch(/allerg|medic|special|condition/);
    expect(JSON.stringify(prefill)).not.toMatch(/peanut|asthma|inhaler/);

    const view = await openReturnLink(token);
    expect(view.state).toBe("open");
    if (view.state !== "open") return;
    expect(view.preselect).toEqual({ programId, termId: t2 });
    expect(view.offers.find((o) => o.termId === t2)?.earlyAccessOnly).toBe(true);

    const early = await createFutprepRegistration(child({ ...prefill!, programSlug: SLUG, termId: t2, returnToken: token, allergies: "TEST re-entered", medicalConditions: "", medications: "" }));
    expect(early.registrationStatus).toBe("pending");
    expect(early.term.id).toBe(t2);
    const { data: link } = await db().from("futprep_return_links").select("used_registration_id,last_used_at").eq("source_registration_id", source!.id).single();
    expect(link!.used_registration_id).not.toBeNull();
    expect(link!.last_used_at).not.toBeNull();

    // A link does not live for ever: one made more than 120 days ago is as
    // good as unknown, so a forwarded link stops showing a family's details.
    const oldToken = (await createReturnLink(Number(source!.id), MARK)).token;
    const { data: newest } = await db().from("futprep_return_links").select("id").eq("source_registration_id", source!.id).order("id", { ascending: false }).limit(1);
    const oldId = Number(newest![0].id);
    expect(await returnLinkPrefill(oldToken)).not.toBeNull();
    await db().from("futprep_return_links").update({ created_at: new Date(Date.now() - 121 * 24 * 60 * 60 * 1000).toISOString() }).eq("id", oldId);
    expect(await returnLinkPrefill(oldToken)).toBeNull();
    expect((await openReturnLink(oldToken)).state).toBe("invalid");
    await db().from("futprep_return_links").delete().eq("id", oldId);
  });

  it("a made-up link is refused, and a link expires with early access", async () => {
    expect(await refused(createFutprepRegistration(child({ termId: t2, returnToken: "not-a-real-token-at-all" })))).toBe("RETURN_LINK_INVALID");
    expect((await openReturnLink("not-a-real-token-at-all")).state).toBe("invalid");
    // After early_access_until (1 Jan 2098) the term is open to everyone
    // and the link has done its job.
    expect((await openReturnLink(token, new Date("2098-06-01T12:00:00Z"))).state).toBe("expired");
    // A term switched off offers no early access at all.
    await db().from("program_terms").update({ active: false }).eq("id", t2);
    expect((await openReturnLink(token)).state).toBe("expired");
    await db().from("program_terms").update({ active: true }).eq("id", t2);
  });

  let trialChild: FutprepRegistrationInput;
  let trialReference = "";

  it("a free trial needs a signed-in parent and one of the trial Saturdays", async () => {
    expect(await refused(createFutprepRegistration(child({ mode: "trial", trialSessionId: saturday["2098-09-06"] })))).toBe("TRIAL_SIGN_IN_REQUIRED");
    expect(await refused(createFutprepRegistration(child({ mode: "trial", trialSessionId: saturday["2098-09-20"], signedInUserId: "test-user" })))).toBe("TRIAL_NOT_AVAILABLE");
    const trials = await listTrialSessions(programId, t1);
    expect(trials.map((t) => t.date)).toEqual(["2098-09-06", "2098-09-13"]);
    expect(trials.every((t) => t.spotsLeft === 3)).toBe(true);
  });

  it("books three trials on a Saturday, refuses the fourth, and flags them on that Saturday's roster only", async () => {
    trialChild = child({ mode: "trial", trialSessionId: saturday["2098-09-06"], signedInUserId: "test-user" });
    const first = await createFutprepRegistration(trialChild);
    trialReference = first.referenceCode;
    expect(first.registrationStatus).toBe("trial");
    expect(first.amountDueCents).toBe(0);
    expect(first.paymentStatus).toBe("waived");
    await createFutprepRegistration(child({ mode: "trial", trialSessionId: saturday["2098-09-06"], signedInUserId: "test-user" }));
    await createFutprepRegistration(child({ mode: "trial", trialSessionId: saturday["2098-09-06"], signedInUserId: "test-user" }));
    expect(await refused(createFutprepRegistration(child({ mode: "trial", trialSessionId: saturday["2098-09-06"], signedInUserId: "test-user" })))).toBe("TRIAL_FULL");

    const { data: row } = await db().from("registrations").select("source_channel,commission_eligible,payment_status,trial_session_id").eq("reference_code", trialReference).single();
    expect(row).toMatchObject({ source_channel: "member_perk", commission_eligible: false, payment_status: "waived", trial_session_id: saturday["2098-09-06"] });

    const onTrialDay = await rosterForSession(saturday["2098-09-06"]);
    expect(onTrialDay.filter((r) => r.is_trial)).toHaveLength(3);
    const later = await rosterForSession(saturday["2098-09-20"]);
    expect(later.some((r) => r.is_trial)).toBe(false);
    expect(later.some((r) => r.child_name === trialChild.childName)).toBe(false);

    // Trials don't take term places.
    const offer = (await getFutprepAvailability()).find((o) => o.termId === t1);
    expect(offer?.registered).toBe(1);
  });

  it("refuses a second free trial for the same child", async () => {
    expect(await refused(createFutprepRegistration({ ...trialChild, trialSessionId: saturday["2098-09-13"] }))).toBe("TRIAL_ALREADY_USED");
  });

  it("prices joining after the trial for the Saturdays left", async () => {
    const quote = await trialJoinQuote(trialReference);
    expect(quote).not.toBeNull();
    expect(quote!.remainingSessions).toBe(11);
    // 11 Saturdays at the weekly fee would be 275; the family never pays
    // more than the full-term price (brief 12).
    expect(quote!.amountCents).toBe(Math.min(11 * WEEKLY, 25000));

    const joined = await createFutprepRegistration({ ...trialChild, mode: "standard", trialSessionId: null, signedInUserId: null, joinFromTrialCode: trialReference });
    expect(joined.registrationStatus).toBe("pending");
    expect(joined.amountDueCents).toBe(Math.min(11 * WEEKLY, 25000));
    expect(joined.paymentFrequency).toBe("term");
    const { data: row } = await db().from("registrations").select("joined_from_registration_id").eq("reference_code", joined.referenceCode).single();
    expect(row!.joined_from_registration_id).not.toBeNull();

    // A join code only works for its own class and term.
    expect(await refused(createFutprepRegistration(child({ termId: t2, returnToken: token, joinFromTrialCode: trialReference })))).toBe("JOIN_LINK_INVALID");
  });

  it("puts a child on the waitlist when the class is full, and staff promote when a spot opens", async () => {
    // Two places taken (the return-link source and the join); one left.
    expect(await refused(createFutprepRegistration(child({ mode: "waitlist" })))).toBe("SPOT_OPEN");
    const third = await createFutprepRegistration(child());
    expect(await refused(createFutprepRegistration(child()))).toBe("PROGRAM_FULL");

    const waiting = await createFutprepRegistration(child({ mode: "waitlist" }));
    expect(waiting.registrationStatus).toBe("waitlist");
    const { data: waitRow } = await db().from("registrations").select("id,registration_status").eq("reference_code", waiting.referenceCode).single();
    expect(waitRow!.registration_status).toBe("waitlist");

    // Still full: promotion is refused.
    expect(await refused(updateFutprepRegistration({ registrationId: Number(waitRow!.id), registrationStatus: "pending" }))).toBe("PROGRAM_FULL");

    const { data: thirdRow } = await db().from("registrations").select("id").eq("reference_code", third.referenceCode).single();
    await updateFutprepRegistration({ registrationId: Number(thirdRow!.id), registrationStatus: "cancelled" });
    await updateFutprepRegistration({ registrationId: Number(waitRow!.id), registrationStatus: "pending" });
    const { data: promoted } = await db().from("registrations").select("registration_status").eq("id", waitRow!.id).single();
    expect(promoted!.registration_status).toBe("pending");
  });
});
