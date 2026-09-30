import { describe, expect, it } from "vitest";
import { amountDueCents, campDays, formatDateRange, isTermOpen, nassauToday, offerHeadline } from "./futprepTerms";

const NOW = new Date("2026-10-05T15:00:00Z"); // Mon 5 Oct, 11:00 in Nassau

describe("isTermOpen", () => {
  const base = { active: true, endDate: "2026-10-16", registrationOpensAt: null, registrationClosesAt: null };

  it("is open with no window", () => {
    expect(isTermOpen(base, NOW)).toBe(true);
  });

  it("is closed when inactive, finished, not yet open or past its close", () => {
    expect(isTermOpen({ ...base, active: false }, NOW)).toBe(false);
    expect(isTermOpen({ ...base, endDate: "2026-10-04" }, NOW)).toBe(false);
    expect(isTermOpen({ ...base, registrationOpensAt: "2026-10-06T00:00:00Z" }, NOW)).toBe(false);
    expect(isTermOpen({ ...base, registrationClosesAt: "2026-10-05T14:00:00Z" }, NOW)).toBe(false);
  });

  it("closes the October camp at 6 pm Nassau on Mon 12 Oct", () => {
    const camp = { ...base, registrationClosesAt: "2026-10-12T22:00:00Z" };
    expect(isTermOpen(camp, new Date("2026-10-12T21:59:00Z"))).toBe(true);
    expect(isTermOpen(camp, new Date("2026-10-12T22:00:00Z"))).toBe(false);
  });

  it("uses the Nassau date, not UTC, for the end-date check", () => {
    // 01:30 UTC on 17 Oct is still 16 Oct (21:30) in Nassau.
    expect(nassauToday(new Date("2026-10-17T01:30:00Z"))).toBe("2026-10-16");
    expect(isTermOpen(base, new Date("2026-10-17T01:30:00Z"))).toBe(true);
  });
});

describe("camp days and labels", () => {
  it("runs Tue 13 to Fri 16 Oct as four days", () => {
    expect(campDays("2026-10-13", "2026-10-16")).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("skips weekends and break dates", () => {
    expect(campDays("2026-12-14", "2026-12-22", ["2026-12-21"])).toEqual(["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18", "2026-12-22"]);
  });

  it("formats date ranges", () => {
    expect(formatDateRange("2026-10-13", "2026-10-16")).toBe("13–16 Oct");
    expect(formatDateRange("2026-12-28", "2027-01-02")).toBe("28 Dec – 2 Jan");
    expect(formatDateRange("2026-12-14", "2026-12-14")).toBe("14 Dec");
  });

  it("writes the headline from the program and term, never a fixed term name", () => {
    const camp = { name: "October Mid-Term Camp", programType: "camp" as const, termName: "October 2026", termStartDate: "2026-10-13", termEndDate: "2026-10-16", day: "Daily", time: "9:00 AM", endTime: "12:00 PM", dailyStartTime: "9:00 AM", dailyEndTime: "12:00 PM" };
    expect(offerHeadline(camp)).toBe("October Mid-Term Camp · 13–16 Oct · 9:00 AM–12:00 PM");
    expect(offerHeadline({ ...camp, name: "Futprep Kickers", programType: "term", termName: "Term 2", day: "Saturday", time: "10:00 AM", endTime: "10:45 AM" })).toBe("Futprep Kickers · Term 2 · Saturdays 10:00 AM–10:45 AM");
  });
});

describe("amountDueCents", () => {
  it("charges the full camp fee whatever plan was sent", () => {
    expect(amountDueCents({ programType: "camp", weeklyFeeCents: 0, termFeeCents: 15000 }, "weekly")).toBe(15000);
  });
  it("keeps the weekly/term choice for term programs", () => {
    expect(amountDueCents({ programType: "term", weeklyFeeCents: 3500, termFeeCents: 30000 }, "weekly")).toBe(3500);
    expect(amountDueCents({ programType: "term", weeklyFeeCents: 3500, termFeeCents: 30000 }, "term")).toBe(30000);
  });
});

describe("nassauLocalToIso", () => {
  it("reads 6 pm on Mon 12 Oct as 22:00 UTC (EDT) and 6 pm in January as 23:00 UTC (EST)", async () => {
    const { nassauLocalToIso } = await import("./futprepTerms");
    expect(nassauLocalToIso("2026-10-12T18:00")).toBe("2026-10-12T22:00:00.000Z");
    expect(nassauLocalToIso("2027-01-08T18:00")).toBe("2027-01-08T23:00:00.000Z");
    expect(nassauLocalToIso("12 Oct")).toBeNull();
  });
});
