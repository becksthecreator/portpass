import { describe, expect, it } from "vitest";
import { ageInMonths, ageLabel, ageRangeMonths, coachesNeeded, effectiveCap, fitsAgeRule, ratioSummary, tasterCardCopy, upcomingTaster } from "./futprepClasses";

const LIL_KICKERS = { ageMin: 1, ageMax: 3, ageMinMonths: 18, ageMaxMonths: 47 };
const KICKERS = { ageMin: 3, ageMax: 6, ageMinMonths: 36, ageMaxMonths: 83 };

describe("ageInMonths", () => {
  it("counts whole months, not started ones", () => {
    expect(ageInMonths("2025-01-10", "2026-07-10")).toBe(18);
    expect(ageInMonths("2025-01-10", "2026-07-09")).toBe(17);
    expect(ageInMonths("2020-02-29", "2021-02-28")).toBe(11);
    expect(ageInMonths("not a date", "2026-07-10")).toBe(-1);
  });
});

describe("age rules in months (brief 12)", () => {
  it("refuses a 17-month-old for Lil Kickers and accepts an 18-month-old", () => {
    // Term 2 starts Sat 9 Jan 2027.
    expect(fitsAgeRule("2025-08-10", "2027-01-09", LIL_KICKERS)).toBe(false); // 16 months
    expect(fitsAgeRule("2025-07-10", "2027-01-09", LIL_KICKERS)).toBe(false); // 17 months
    expect(fitsAgeRule("2025-07-09", "2027-01-09", LIL_KICKERS)).toBe(true); // 18 months
  });

  it("takes a child up to the day before their fourth birthday for Lil Kickers", () => {
    expect(fitsAgeRule("2023-01-10", "2027-01-09", LIL_KICKERS)).toBe(true); // 47 months
    expect(fitsAgeRule("2023-01-09", "2027-01-09", LIL_KICKERS)).toBe(false); // 48 months
  });

  it("falls back to whole years when months are not set", () => {
    expect(ageRangeMonths({ ageMin: 6, ageMax: 15 })).toEqual({ min: 72, max: 191 });
    expect(fitsAgeRule("2010-10-15", "2026-10-15", { ageMin: 6, ageMax: 15 })).toBe(false); // 16 today
    expect(fitsAgeRule("2011-10-16", "2026-10-15", { ageMin: 6, ageMax: 15 })).toBe(true); // 15
  });

  it("labels the ranges the way Futprep writes them", () => {
    expect(ageLabel(LIL_KICKERS)).toBe("1½–3");
    expect(ageLabel(KICKERS)).toBe("3–6");
    expect(ageLabel({ ageMin: 6, ageMax: 15 })).toBe("6–15");
    expect(ageLabel({ ageMin: 1, ageMax: 3, ageMinMonths: 30, ageMaxMonths: 47 })).toBe("2½–3");
  });
});

describe("class caps from coaches on duty (brief 12)", () => {
  it("is the smaller of capacity and coaches × ratio", () => {
    expect(effectiveCap({ capacity: 20, childrenPerCoach: 6, coachesOnDuty: null, defaultCoaches: 1 })).toBe(6);
    expect(effectiveCap({ capacity: 20, childrenPerCoach: 8, coachesOnDuty: 2, defaultCoaches: 1 })).toBe(16);
    expect(effectiveCap({ capacity: 20, childrenPerCoach: 8, coachesOnDuty: 3, defaultCoaches: 1 })).toBe(20);
    expect(effectiveCap({ capacity: 20, childrenPerCoach: 8, coachesOnDuty: 0, defaultCoaches: 2 })).toBe(0);
  });

  it("uses capacity alone when no ratio is set", () => {
    expect(effectiveCap({ capacity: 40, childrenPerCoach: null, coachesOnDuty: 1, defaultCoaches: 1 })).toBe(40);
  });

  it("says how many more coaches a session needs", () => {
    expect(coachesNeeded(20, 8)).toBe(3);
    expect(coachesNeeded(16, 8)).toBe(2);
    expect(coachesNeeded(0, 8)).toBe(0);
    expect(coachesNeeded(20, null)).toBeNull();
    expect(ratioSummary(20, 3, 8)).toEqual({ text: "20 children · 3 coaches · ratio OK", ok: true });
    expect(ratioSummary(20, 1, 8)).toEqual({ text: "20 children · 1 coach · needs 2 more", ok: false });
    expect(ratioSummary(1, 1, null)).toEqual({ text: "1 child · 1 coach", ok: true });
  });
});

describe("the free taster card (brief 12)", () => {
  const offers = [
    { programType: "term", tasterDate: "2026-12-12", name: "Futprep Lil Kickers" },
    { programType: "term", tasterDate: "2026-12-12", name: "Futprep Kickers" },
    { programType: "camp", tasterDate: null, name: "Christmas Futsal & Ball Mastery Camp" },
  ];

  it("finds the next taster Saturday and its classes", () => {
    expect(upcomingTaster(offers, "2026-11-19")).toEqual({ date: "2026-12-12", classNames: ["Lil Kickers", "Kickers"] });
    expect(upcomingTaster(offers, "2026-12-13")).toBeNull();
  });

  it("writes the card the way the brief does", () => {
    expect(tasterCardCopy({ date: "2026-12-12", classNames: ["Lil Kickers", "Kickers"] })).toEqual({
      title: "Free taster Saturday, 12 Dec.",
      body: "Bring your little one to try Lil Kickers or Kickers with Coach Bex. Free with a PortPass account. Limited spots.",
    });
  });
});
