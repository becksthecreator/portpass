import { describe, expect, it } from "vitest";
import {
  bothPrices,
  cleanPerk,
  cleanSignupSource,
  dollars,
  eligibility,
  isMemberNumber,
  isPerkLive,
  memberEarlyAccessOpen,
  memberFirstName,
  memberPriceCents,
  normalizeMemberNumber,
  perkChip,
  perkConditions,
  PERKS_ROW_MINIMUM,
  signupSourceLabel,
  unlockHref,
  type MemberPerk,
} from "./memberPerks";

const perk = (over: Partial<MemberPerk> = {}): MemberPerk => ({
  id: 1, organizationId: 7, offeringId: null, title: "10% off your first booking", kind: "percent_off", percent: 10, amountCents: null, addonText: null, earlyAccessHours: null,
  firstBookingOnly: false, minSpendCents: null, startsOn: null, endsOn: null, monthlyCap: null, conditionsText: null, status: "live", createdAt: "2026-10-01T12:00:00Z", ...over,
});

describe("what the perk form accepts", () => {
  it("takes a percentage off, and keeps only the number that kind uses", () => {
    const cleaned = cleanPerk({ kind: "percent_off", title: "  10% off   your first booking ", percent: 10, amountCents: 500, addonText: "ignored", firstBookingOnly: true, endsOn: "2026-12-31" });
    expect(cleaned).toEqual({ ok: true, value: { offeringId: null, title: "10% off your first booking", kind: "percent_off", percent: 10, amountCents: null, addonText: null, earlyAccessHours: null, firstBookingOnly: true, minSpendCents: null, startsOn: null, endsOn: "2026-12-31", monthlyCap: null, conditionsText: null } });
  });

  it("needs each kind's own number or words", () => {
    expect(cleanPerk({ kind: "percent_off", title: "TEST percent" })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "amount_off", title: "TEST amount" })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "free_addon", title: "TEST addon" })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "early_access", title: "TEST early" })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "priority", title: "First pick of Saturday slots" })).toMatchObject({ ok: true });
    expect(cleanPerk({ kind: "free_addon", title: "TEST addon", addonText: "extra 30 minutes" })).toMatchObject({ ok: true, value: { addonText: "extra 30 minutes", percent: null } });
    expect(cleanPerk({ kind: "early_access", title: "TEST early", earlyAccessHours: 48 })).toMatchObject({ ok: true, value: { earlyAccessHours: 48 } });
  });

  it("refuses a kind it doesn't know, a title too short, a number out of range and a made-up or backwards date", () => {
    expect(cleanPerk({ kind: "bogof", title: "TEST two for one" })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "priority", title: "abc" })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "percent_off", title: "TEST percent", percent: 150 })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "percent_off", title: "TEST percent", percent: 10.5 })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "percent_off", title: "TEST percent", percent: 10, endsOn: "2026-02-30" })).toMatchObject({ ok: false });
    expect(cleanPerk({ kind: "percent_off", title: "TEST percent", percent: 10, startsOn: "2026-12-01", endsOn: "2026-11-30" })).toMatchObject({ ok: false });
    expect(cleanPerk(null)).toMatchObject({ ok: false });
  });
});

describe("how a perk reads", () => {
  it("writes the gold chip for each kind", () => {
    expect(perkChip(perk({ firstBookingOnly: true }))).toBe("Members: 10% off first booking");
    expect(perkChip(perk())).toBe("Members: 10% off");
    expect(perkChip(perk({ kind: "amount_off", percent: null, amountCents: 1000 }))).toBe("Members: $10 off");
    expect(perkChip(perk({ kind: "free_addon", percent: null, addonText: "free extra 30 minutes" }))).toBe("Members: free extra 30 minutes");
    expect(perkChip(perk({ kind: "free_addon", percent: null, addonText: "50 lb of ice" }))).toBe("Members: free 50 lb of ice");
    expect(perkChip(perk({ kind: "early_access", percent: null, earlyAccessHours: 48 }))).toBe("Members: book 2 days early");
    expect(perkChip(perk({ kind: "early_access", percent: null, earlyAccessHours: 12 }))).toBe("Members: book 12 hours early");
    expect(perkChip(perk({ kind: "priority", percent: null, title: "First pick of Saturday slots" }))).toBe("Members: First pick of Saturday slots");
  });

  it("writes the conditions in plain words", () => {
    expect(perkConditions(perk())).toBe("");
    expect(perkConditions(perk({ firstBookingOnly: true, endsOn: "2026-12-31" }))).toBe("First booking only. Ends 31 Dec 2026.");
    expect(perkConditions(perk({ firstBookingOnly: true, minSpendCents: 5000, monthlyCap: 20, endsOn: "2026-12-31", conditionsText: "Weekdays only" }))).toBe("First booking only. When you spend $50 or more. Limited to 20 a month. Ends 31 Dec 2026. Weekdays only.");
  });

  it("shows both prices, both real, and never below zero", () => {
    expect(memberPriceCents(30000, perk())).toBe(27000);
    expect(bothPrices(30000, perk())).toBe("$300 · Members $270");
    expect(bothPrices(4950, perk({ kind: "amount_off", percent: null, amountCents: 1000 }))).toBe("$49.50 · Members $39.50");
    expect(memberPriceCents(500, perk({ kind: "amount_off", percent: null, amountCents: 1000 }))).toBe(0);
    // Below the perk's minimum spend the price doesn't change, and no member price is shown.
    expect(memberPriceCents(5000, perk({ minSpendCents: 10000 }))).toBeNull();
    expect(bothPrices(5000, perk({ minSpendCents: 10000 }))).toBeNull();
    // A free extra, early access and priority change no price.
    expect(bothPrices(30000, perk({ kind: "free_addon", percent: null, addonText: "prints" }))).toBeNull();
    expect(bothPrices(30000, perk({ kind: "early_access", percent: null, earlyAccessHours: 48 }))).toBeNull();
    // A discount that rounds to nothing shows no second price.
    expect(bothPrices(1, perk())).toBeNull();
    expect(dollars(120000)).toBe("$1,200");
  });
});

describe("when a perk applies", () => {
  it("is live only once published, from its first day to its last", () => {
    expect(isPerkLive(perk(), "2026-10-05")).toBe(true);
    expect(isPerkLive(perk({ status: "draft" }), "2026-10-05")).toBe(false);
    expect(isPerkLive(perk({ status: "ended" }), "2026-10-05")).toBe(false);
    expect(isPerkLive(perk({ startsOn: "2026-10-06" }), "2026-10-05")).toBe(false);
    expect(isPerkLive(perk({ startsOn: "2026-10-05", endsOn: "2026-10-05" }), "2026-10-05")).toBe(true);
    expect(isPerkLive(perk({ endsOn: "2026-10-04" }), "2026-10-05")).toBe(false);
  });

  it("gives a first-booking perk once, and stops at the month's limit", () => {
    const none = { byThisMember: 0, thisMonth: 0 };
    expect(eligibility(perk({ firstBookingOnly: true }), "2026-10-05", none)).toEqual({ eligible: true });
    expect(eligibility(perk({ firstBookingOnly: true }), "2026-10-05", { byThisMember: 1, thisMonth: 1 })).toEqual({ eligible: false, reason: "already_used" });
    // Not first-booking-only: the same member can use it again.
    expect(eligibility(perk(), "2026-10-05", { byThisMember: 3, thisMonth: 3 })).toEqual({ eligible: true });
    expect(eligibility(perk({ monthlyCap: 20 }), "2026-10-05", { byThisMember: 0, thisMonth: 20 })).toEqual({ eligible: false, reason: "month_full" });
    expect(eligibility(perk({ monthlyCap: 20 }), "2026-10-05", { byThisMember: 0, thisMonth: 19 })).toEqual({ eligible: true });
    expect(eligibility(perk({ status: "ended" }), "2026-10-05", none)).toEqual({ eligible: false, reason: "not_live" });
  });

  it("opens the members-only window the given hours before the public, and closes it when the public opens", () => {
    const opens = "2026-11-19T05:00:00Z";
    expect(memberEarlyAccessOpen(opens, 48, new Date("2026-11-17T04:59:59Z"))).toBe(false);
    expect(memberEarlyAccessOpen(opens, 48, new Date("2026-11-17T05:00:00Z"))).toBe(true);
    expect(memberEarlyAccessOpen(opens, 48, new Date("2026-11-19T04:59:59Z"))).toBe(true);
    // From the public opening it is simply open: no longer a members' window.
    expect(memberEarlyAccessOpen(opens, 48, new Date("2026-11-19T05:00:00Z"))).toBe(false);
    expect(memberEarlyAccessOpen(null, 48, new Date("2026-11-18T05:00:00Z"))).toBe(false);
    expect(memberEarlyAccessOpen(opens, null, new Date("2026-11-18T05:00:00Z"))).toBe(false);
    expect(memberEarlyAccessOpen(opens, 0, new Date("2026-11-18T05:00:00Z"))).toBe(false);
  });

  it("shows the homepage row from three perks", () => {
    expect(PERKS_ROW_MINIMUM).toBe(3);
  });
});

describe("member numbers", () => {
  it("are PP- and four to six characters that can't be misread", () => {
    expect(isMemberNumber("PP-7K3Q")).toBe(true);
    expect(isMemberNumber("PP-7K3QXZ")).toBe(true);
    for (const bad of ["PP-7K3O", "PP-7K31", "PP-7KI3", "PP-7KL3", "PP-7K0Q", "PP-7K3", "PP-7K3QXZ9", "pp-7k3q", "7K3Q", "", null, 7]) expect(isMemberNumber(bad)).toBe(false);
  });

  it("reads what staff type at the counter, however they type it", () => {
    expect(normalizeMemberNumber("pp 7k3q")).toBe("PP-7K3Q");
    expect(normalizeMemberNumber("PP-7K3Q")).toBe("PP-7K3Q");
    expect(normalizeMemberNumber(" 7k3q ")).toBe("PP-7K3Q");
    // A number whose own characters begin with PP.
    expect(normalizeMemberNumber("PP-PP7K")).toBe("PP-PP7K");
    expect(normalizeMemberNumber("pp7k")).toBe("PP-PP7K");
    expect(normalizeMemberNumber("hello")).toBeNull();
    expect(normalizeMemberNumber("")).toBeNull();
  });
});

describe("where a sign-up came from", () => {
  it("keeps a short tag and nothing else", () => {
    expect(cleanSignupSource("Perk")).toBe("perk");
    expect(cleanSignupSource(" own ")).toBe("own");
    expect(cleanSignupSource("counter_qr")).toBe("counter_qr");
    // Anything else is "other": a link can't put its own identifier on an account.
    expect(cleanSignupSource("jane-doe-2425550100")).toBe("other");
    expect(cleanSignupSource("someone@example.com")).toBe("other");
    expect(cleanSignupSource("constructor")).toBe("other");
    expect(cleanSignupSource("")).toBeNull();
    expect(cleanSignupSource(undefined)).toBeNull();
    expect(cleanSignupSource(42)).toBeNull();
    expect(signupSourceLabel("perk")).toBe("A member perk");
    expect(signupSourceLabel("other")).toBe("Another tagged link");
    expect(signupSourceLabel(null)).toBe("No source recorded");
  });

  it("shows a business a first name, never something that looks like an email or a username", () => {
    expect(memberFirstName("Jane Doe")).toBe("Jane");
    expect(memberFirstName("  Jean-Luc  Picard ")).toBe("Jean-Luc");
    expect(memberFirstName("jane.doe1985")).toBe("Member");
    expect(memberFirstName("jdoe_42")).toBe("Member");
    expect(memberFirstName("jane@example.com")).toBe("Member");
    expect(memberFirstName("")).toBe("Member");
    expect(memberFirstName(null)).toBe("Member");
  });

  it("sends a visitor back to the page they were on after signing up", () => {
    expect(unlockHref("/sports-fitness/futprep-athletics")).toBe("/signup?as=customer&next=%2Fsports-fitness%2Ffutprep-athletics&utm_source=perk");
  });
});
