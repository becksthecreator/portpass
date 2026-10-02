import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { passCode, passSecret, passWindow } from "@/lib/memberPass";
import { cleanPerk, isMemberNumber, type PerkInput } from "@/lib/memberPerks";
import { publishForOwner } from "./adminBusinessActions";
import { createDraftBusiness, updateBusinessDetails, updatePaymentMethods, upsertBusinessOffering } from "./business";
import {
  checkMemberPass,
  endPerk,
  getMemberCard,
  getPerkStats,
  listAllPerks,
  listBusinessPerks,
  listBusinessRedemptions,
  listLivePerks,
  listMemberRedemptions,
  canUsePerks,
  claimPassCheck,
  logPassCheck,
  memberEarlyAccess,
  PASS_CHECK_FAILURES_ALLOWED,
  passChecksBlocked,
  prunePassChecks,
  publishPerk,
  recordOnlineRedemption,
  recordRedemption,
  savePerk,
  setSignupSource,
} from "./memberPerks";

// Member perks (brief 10) against CI's local Supabase stack: member
// numbers, a perk's life (draft, live, ended), what the public and a
// business each see, the pass check, and recording a perk used. Every
// business and person is "TEST — delete" and removed afterwards.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let founder = "";
let member = "";
let second = "";
let liveOrg = 0;
let draftOrg = 0;
let offeringId = 0;
let otherOffering = 0;
let memberNumber = "";
let secondNumber = "";
let firstBooking = 0;

async function user(label: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email: `test-delete-perks-${label}-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  await admin.from("profiles").upsert({ user_id: created.data.user.id, full_name: `TEST delete${label}`, phone_e164: "+12425550100" });
  return created.data.user.id;
}

async function business(name: string): Promise<{ id: number; offeringId: number }> {
  const draft = await createDraftBusiness({ name: `TEST delete ${TAG} ${name}`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder });
  await updateBusinessDetails(draft.id, { oneLiner: "TEST one line.", whatsappE164: "+12425550100" }, founder);
  await updatePaymentMethods(draft.id, founder, { paymentMethods: ["cash"], bankTransferDetails: null });
  const offering = await upsertBusinessOffering(draft.id, null, { name: "TEST photo booth", summary: null, priceCents: 30000, priceUnit: null, scheduleText: null, capacity: null, type: "service" }, founder);
  return { id: draft.id, offeringId: offering.id };
}

const perk = (over: Record<string, unknown> = {}): PerkInput => {
  const cleaned = cleanPerk({ kind: "percent_off", title: "TEST 10% off your first booking", percent: 10, firstBookingOnly: true, ...over });
  if (!cleaned.ok) throw new Error(cleaned.error);
  return cleaned.value;
};

const codeNow = (number: string) => passCode(passSecret(), number, passWindow());

async function refused(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeAll(async () => {
  founder = await user("founder");
  member = await user("member");
  second = await user("second");
  const live = await business("Perks Live");
  liveOrg = live.id;
  offeringId = live.offeringId;
  await publishForOwner(liveOrg, founder);
  const draft = await business("Perks Draft");
  draftOrg = draft.id;
  otherOffering = draft.offeringId;
});

afterAll(async () => {
  for (const id of [liveOrg, draftOrg]) {
    if (!id) continue;
    await admin.from("member_pass_checks").delete().eq("organization_id", id);
    await admin.from("audit_log").delete().eq("organization_id", id);
    await admin.from("organizations").delete().eq("id", id);
  }
  for (const id of [founder, member, second]) {
    if (!id) continue;
    await admin.from("audit_log").delete().eq("actor_user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe("member numbers", () => {
  it("gives every account one, short and unmistakable, and never the same one twice", async () => {
    const { data } = await admin.from("profiles").select("user_id,member_number").in("user_id", [member, second]);
    const numbers = new Map((data ?? []).map((row) => [String(row.user_id), String(row.member_number)]));
    memberNumber = numbers.get(member)!;
    secondNumber = numbers.get(second)!;
    expect(isMemberNumber(memberNumber)).toBe(true);
    expect(isMemberNumber(secondNumber)).toBe(true);
    expect(memberNumber).not.toBe(secondNumber);
    const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true }).is("member_number", null);
    expect(count).toBe(0);
    // The database refuses a duplicate and a number that could be misread.
    expect((await admin.from("profiles").update({ member_number: secondNumber }).eq("user_id", member)).error?.code).toBe("23505");
    expect((await admin.from("profiles").update({ member_number: "PP-0O1I" }).eq("user_id", member)).error?.code).toBe("23514");
    // Saving the profile again keeps the number: it is permanent.
    await admin.from("profiles").upsert({ user_id: member, full_name: "TEST deletemember" });
    expect((await admin.from("profiles").select("member_number").eq("user_id", member).single()).data!.member_number).toBe(memberNumber);
  });

  it("puts only a first name, the number and the joining date on the pass", async () => {
    const card = await getMemberCard(member);
    expect(card).toMatchObject({ firstName: "TEST", memberNumber });
    expect(Object.keys(card!).sort()).toEqual(["firstName", "memberNumber", "memberSince", "userId"]);
    expect(await getMemberCard(crypto.randomUUID())).toBeNull();
  });
});

describe("a perk's life", () => {
  it("starts as a draft nobody else can see, and must be for one of the business's own offerings", async () => {
    const draft = await savePerk(liveOrg, null, perk(), founder);
    firstBooking = draft.id;
    expect(draft).toMatchObject({ status: "draft", kind: "percent_off", percent: 10, firstBookingOnly: true, offeringId: null });
    expect((await listLivePerks({ fresh: true })).map((p) => p.id)).not.toContain(firstBooking);
    expect(await refused(savePerk(liveOrg, null, perk({ offeringId: otherOffering }), founder))).toBe("BAD_OFFERING");
    // A draft can be changed, by its own business only.
    const edited = await savePerk(liveOrg, firstBooking, perk({ offeringId, endsOn: "2099-12-31" }), founder);
    expect(edited).toMatchObject({ offeringId, endsOn: "2099-12-31", status: "draft" });
    expect(await refused(savePerk(draftOrg, firstBooking, perk(), founder))).toBe("NOT_FOUND");
    expect(await refused(publishPerk(draftOrg, firstBooking, founder))).toBe("NOT_FOUND");
  });

  it("goes public when published, with the business's public details, and can't be changed afterwards", async () => {
    await savePerk(liveOrg, firstBooking, perk(), founder);
    expect(await publishPerk(liveOrg, firstBooking, founder)).toMatchObject({ status: "live" });
    const shown = (await listLivePerks({ fresh: true })).find((p) => p.id === firstBooking);
    expect(shown).toMatchObject({ businessName: `TEST delete ${TAG} Perks Live`, section: "entertainment", title: "TEST 10% off your first booking" });
    expect(shown!.businessSlug).toBeTruthy();
    expect(await refused(savePerk(liveOrg, firstBooking, perk({ percent: 5 }), founder))).toBe("NOT_DRAFT");
    expect(await refused(publishPerk(liveOrg, firstBooking, founder))).toBe("NOT_DRAFT");
    const { data: logged } = await admin.from("audit_log").select("action").eq("organization_id", liveOrg).like("action", "perk.%");
    expect(logged!.map((row) => row.action)).toEqual(expect.arrayContaining(["perk.created", "perk.updated", "perk.published"]));
  });

  it("never shows a perk of a business that isn't public, or one not yet started or past its last day", async () => {
    const hidden = await savePerk(draftOrg, null, perk({ title: "TEST perk of a draft business" }), founder);
    await publishPerk(draftOrg, hidden.id, founder);
    const later = await savePerk(liveOrg, null, perk({ title: "TEST starts later", startsOn: "2099-01-01" }), founder);
    await publishPerk(liveOrg, later.id, founder);
    const past = await savePerk(liveOrg, null, perk({ title: "TEST finished", endsOn: "2020-12-31" }), founder);
    await publishPerk(liveOrg, past.id, founder);
    const ids = (await listLivePerks({ fresh: true })).map((p) => p.id);
    expect(ids).toContain(firstBooking);
    for (const id of [hidden.id, later.id, past.id]) expect(ids).not.toContain(id);
    // The business still sees all of its own, and platform staff see every one.
    expect((await listBusinessPerks(liveOrg)).map((p) => p.id)).toEqual(expect.arrayContaining([firstBooking, later.id, past.id]));
    expect((await listAllPerks()).map((p) => p.id)).toEqual(expect.arrayContaining([firstBooking, hidden.id, later.id, past.id]));
  });
});

describe("checking a Member Pass", () => {
  it("says valid with a first name, the member number and what applies: never an email or a phone", async () => {
    const result = await checkMemberPass(liveOrg, memberNumber.toLowerCase().replace("-", " "), codeNow(memberNumber));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result).toMatchObject({ firstName: "TEST", memberNumber });
    expect(result.perks.map((entry) => [entry.perk.id, entry.eligibility.eligible])).toEqual([[firstBooking, true]]);
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/@|test\.portpass\.local|\+1242|deletemember|phone|email/i);
  });

  it("says not valid, and nothing more, for a wrong code, an old code or a number that doesn't exist", async () => {
    const code = codeNow(memberNumber);
    const wrong = String((Number(code) + 500_000) % 1_000_000).padStart(6, "0");
    expect(await checkMemberPass(liveOrg, memberNumber, wrong)).toEqual({ valid: false });
    // A code older than 90 seconds, as a screenshot would be.
    expect(await checkMemberPass(liveOrg, memberNumber, code, Date.now() + 150_000)).toEqual({ valid: false });
    // Another member's code doesn't open this member's pass.
    expect(await checkMemberPass(liveOrg, memberNumber, codeNow(secondNumber))).toEqual({ valid: codeNow(secondNumber) === code });
    expect(await checkMemberPass(liveOrg, "not a number", code)).toEqual({ valid: false });
    // A right code for a number nobody has is still not valid.
    await admin.from("profiles").select("user_id").eq("member_number", "PP-2222").maybeSingle().then(async ({ data }) => {
      if (!data) expect(await checkMemberPass(liveOrg, "PP-2222", codeNow("PP-2222"))).toEqual({ valid: false });
    });
  });

  it("checks passes only for a business that is public and has a perk running", async () => {
    expect(await canUsePerks(liveOrg)).toBe(true);
    // The draft business has a live perk, but its page isn't public.
    expect(await canUsePerks(draftOrg)).toBe(false);
  });

  it("claims each check before it is made, so checks sent all at once can't pass the limit", async () => {
    const claims = await Promise.all(Array.from({ length: 12 }, () => claimPassCheck(draftOrg, second)));
    expect(claims.filter((id) => id !== null)).toHaveLength(PASS_CHECK_FAILURES_ALLOWED);
    expect(await claimPassCheck(draftOrg, founder)).toBeNull();
    await admin.from("member_pass_checks").delete().eq("organization_id", draftOrg);
  });

  it("shows a business 'Member' rather than a name that came from an email address", async () => {
    await admin.from("profiles").update({ full_name: "jane.doe1985" }).eq("user_id", second);
    const result = await checkMemberPass(liveOrg, secondNumber, codeNow(secondNumber));
    expect(result.valid && result.firstName).toBe("Member");
    expect(JSON.stringify(result)).not.toContain("jane.doe1985");
    // A stand-in name made at sign-up, however it looks, is never shown either.
    await admin.from("profiles").update({ full_name: "jane-doe", name_from_email: true }).eq("user_id", second);
    const flagged = await checkMemberPass(liveOrg, secondNumber, codeNow(secondNumber));
    expect(flagged.valid && flagged.firstName).toBe("Member");
    expect((await getMemberCard(second))!.firstName).toBe("Member");
    await admin.from("profiles").update({ full_name: "TEST deletesecond", name_from_email: false }).eq("user_id", second);
  });

  it("stops a business that keeps getting it wrong, without touching another business", async () => {
    expect(await passChecksBlocked(liveOrg)).toBe(false);
    for (let i = 0; i < PASS_CHECK_FAILURES_ALLOWED; i += 1) await logPassCheck(liveOrg, founder, false);
    await logPassCheck(liveOrg, founder, true);
    expect(await passChecksBlocked(liveOrg)).toBe(true);
    expect(await passChecksBlocked(draftOrg)).toBe(false);
    // Ten minutes on, it may try again.
    expect(await passChecksBlocked(liveOrg, Date.now() + 11 * 60_000)).toBe(false);
    // Checks are kept 30 days.
    expect(await prunePassChecks(Date.now() + 29 * 24 * 60 * 60_000)).toBe(0);
    expect(await prunePassChecks(Date.now() + 31 * 24 * 60 * 60_000)).toBeGreaterThanOrEqual(PASS_CHECK_FAILURES_ALLOWED + 1);
    expect(await passChecksBlocked(liveOrg)).toBe(false);
  });
});

describe("recording a perk used", () => {
  it("stores the perk and the discount, and gives a first-booking perk once", async () => {
    const used = await recordRedemption(liveOrg, firstBooking, memberNumber, { method: "pass_scan", bookingRef: "TEST-BOOKING-1", priceCents: 30000, recordedBy: "TEST" });
    expect(used.discountCents).toBe(3000);
    expect(await refused(recordRedemption(liveOrg, firstBooking, memberNumber, { method: "pass_scan", bookingRef: null, priceCents: 30000, recordedBy: "TEST" }))).toBe("ALREADY_USED");
    // The database holds the rule too: two tills at once can't both record it.
    const { error } = await admin.from("perk_redemptions").insert({ perk_id: firstBooking, profile_id: member, organization_id: liveOrg, method: "pass_scan", first_booking: true });
    expect(error?.code).toBe("23505");
    // The pass check now says so.
    const again = await checkMemberPass(liveOrg, memberNumber, codeNow(memberNumber));
    expect(again.valid && again.perks.find((entry) => entry.perk.id === firstBooking)?.eligibility).toEqual({ eligible: false, reason: "already_used" });
    // Another member still gets it.
    expect((await recordRedemption(liveOrg, firstBooking, secondNumber, { method: "pass_scan", bookingRef: null, priceCents: null, recordedBy: "TEST" })).discountCents).toBeNull();
    expect(await refused(recordRedemption(liveOrg, firstBooking, "PP-2222", { method: "pass_scan", bookingRef: null, priceCents: null, recordedBy: "TEST" }))).toMatch(/NOT_A_MEMBER|ALREADY_USED|OK/);
    expect(await refused(recordRedemption(draftOrg, firstBooking, secondNumber, { method: "pass_scan", bookingRef: null, priceCents: null, recordedBy: "TEST" }))).toBe("NOT_FOUND");
  });

  it("shows the business a first name and member number, and the member their own perks used", async () => {
    const list = await listBusinessRedemptions(liveOrg);
    expect(list).toHaveLength(2);
    expect(list.find((row) => row.memberNumber === memberNumber)).toMatchObject({ firstName: "TEST", perkTitle: "TEST 10% off your first booking", method: "pass_scan", bookingRef: "TEST-BOOKING-1", discountCents: 3000 });
    expect(JSON.stringify(list)).not.toMatch(/@|test\.portpass\.local|\+1242|deletemember|deletesecond/i);
    expect(await listBusinessRedemptions(draftOrg)).toEqual([]);
    const mine = await listMemberRedemptions(member);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ businessName: `TEST delete ${TAG} Perks Live`, perkTitle: "TEST 10% off your first booking", discountCents: 3000 });
    expect(await listMemberRedemptions(founder)).toEqual([]);
  });

  it("keeps to a minimum spend and to the month's limit", async () => {
    const spend = await savePerk(liveOrg, null, perk({ kind: "amount_off", title: "TEST $10 off a two-hour booking", amountCents: 1000, firstBookingOnly: false, minSpendCents: 5000, monthlyCap: 2 }), founder);
    await publishPerk(liveOrg, spend.id, founder);
    expect(await refused(recordRedemption(liveOrg, spend.id, memberNumber, { method: "pass_scan", bookingRef: null, priceCents: 4000, recordedBy: "TEST" }))).toBe("BELOW_MINIMUM");
    expect((await recordRedemption(liveOrg, spend.id, memberNumber, { method: "pass_scan", bookingRef: null, priceCents: 6000, recordedBy: "TEST" })).discountCents).toBe(1000);
    // Not first-booking-only: the same member can use it again.
    expect((await recordRedemption(liveOrg, spend.id, memberNumber, { method: "pass_scan", bookingRef: null, priceCents: 6000, recordedBy: "TEST" })).discountCents).toBe(1000);
    expect(await refused(recordRedemption(liveOrg, spend.id, secondNumber, { method: "pass_scan", bookingRef: null, priceCents: 6000, recordedBy: "TEST" }))).toBe("MONTH_FULL");
  });

  it("stops when the perk is ended, keeps what was already used, and logs why platform staff ended one", async () => {
    await expect(endPerk(firstBooking, founder, { organizationId: draftOrg })).rejects.toThrow("NOT_FOUND");
    expect(await endPerk(firstBooking, founder, { reason: "  TEST the price shown was not real  " })).toMatchObject({ status: "ended" });
    await expect(endPerk(firstBooking, founder, { organizationId: liveOrg })).rejects.toThrow("ALREADY_ENDED");
    expect((await listLivePerks({ fresh: true })).map((p) => p.id)).not.toContain(firstBooking);
    expect(await refused(recordRedemption(liveOrg, firstBooking, secondNumber, { method: "pass_scan", bookingRef: null, priceCents: null, recordedBy: "TEST" }))).toBe("NOT_LIVE");
    expect((await listBusinessRedemptions(liveOrg)).filter((row) => row.perkTitle === "TEST 10% off your first booking")).toHaveLength(2);
    expect((await listBusinessPerks(liveOrg)).find((p) => p.id === firstBooking)).toMatchObject({ status: "ended", endedReason: "TEST the price shown was not real" });
    const { data: logged } = await admin.from("audit_log").select("after").eq("organization_id", liveOrg).eq("action", "perk.ended");
    expect(logged).toHaveLength(1);
    expect(logged![0].after).toMatchObject({ status: "ended", reason: "TEST the price shown was not real" });
  });
});

describe("early access for members", () => {
  it("is the longest early-access perk the business has running, and stops when it is ended", async () => {
    expect(await memberEarlyAccess(liveOrg)).toBeNull();
    const short = await savePerk(liveOrg, null, perk({ kind: "early_access", title: "TEST members book a day early", earlyAccessHours: 24, firstBookingOnly: false }), founder);
    const long = await savePerk(liveOrg, null, perk({ kind: "early_access", title: "TEST members book two days early", earlyAccessHours: 48, firstBookingOnly: false }), founder);
    await publishPerk(liveOrg, short.id, founder);
    expect(await memberEarlyAccess(liveOrg)).toEqual({ perkId: short.id, hours: 24 });
    await publishPerk(liveOrg, long.id, founder);
    expect(await memberEarlyAccess(liveOrg)).toEqual({ perkId: long.id, hours: 48 });
    // A place booked online in the members' window is on the record, once.
    await recordOnlineRedemption(liveOrg, long.id, member, "FP-TEST-EARLY");
    expect((await listBusinessRedemptions(liveOrg)).find((row) => row.bookingRef === "FP-TEST-EARLY")).toMatchObject({ method: "online", firstName: "TEST", discountCents: null });
    await endPerk(long.id, founder, { organizationId: liveOrg });
    await endPerk(short.id, founder, { organizationId: liveOrg });
    expect(await memberEarlyAccess(liveOrg)).toBeNull();
  });
});

describe("sign-ups by source", () => {
  it("keeps the tag a new account came with, once, and counts by it", async () => {
    await setSignupSource(member, "perk");
    await setSignupSource(member, "own");
    expect((await admin.from("profiles").select("signup_source").eq("user_id", member).single()).data!.signup_source).toBe("perk");
    // Only a known tag is stored.
    expect((await admin.from("profiles").update({ signup_source: "jane-doe-2425550100" }).eq("user_id", second)).error?.code).toBe("23514");
    const stats = await getPerkStats(new Date(Date.now() - 60 * 60_000).toISOString());
    expect(stats.signUps).toBeGreaterThanOrEqual(3);
    expect(stats.bySource.find((entry) => entry.source === "perk")!.count).toBeGreaterThanOrEqual(1);
    expect(stats.bySource.find((entry) => entry.source === null)!.count).toBeGreaterThanOrEqual(2);
    expect(stats.redemptions).toBeGreaterThanOrEqual(5);
  });

  it("leaves a redemption with the business, with nobody on it, when the account is closed", async () => {
    await admin.auth.admin.deleteUser(second);
    second = "";
    const list = await listBusinessRedemptions(liveOrg);
    expect(list.filter((row) => row.memberNumber === secondNumber)).toEqual([]);
    expect(list.some((row) => row.firstName === "A former member" && row.memberNumber === null)).toBe(true);
  });
});
