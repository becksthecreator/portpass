import { describe, expect, it } from "vitest";
import { ageOnDay, classesForBirthday, priceFor, termDates } from "./registerV4";

// Live Term 2 (24 Nov): Lil Kickers 18 months to 3, Kickers 3 to 6, both
// Saturdays 9 Jan to 13 Mar 2027, $34/$340 and $42/$420.
const lilKickers = { slug: "lil-kickers", ageMin: 1, ageMax: 3, ageMinMonths: 18, ageMaxMonths: 35, termStartDate: "2027-01-09", termEndDate: "2027-03-13", day: "Saturday", breakDates: [] as string[], programType: "term", weeklyFeeCents: 3400, termFeeCents: 34000 };
const kickers = { ...lilKickers, slug: "kickers", ageMin: 3, ageMax: 6, ageMinMonths: 36, ageMaxMonths: 83 };

describe("register V4: the term's dates", () => {
  it("lists the ten Saturdays of Term 2", () => {
    const dates = termDates(lilKickers);
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe("2027-01-09");
    expect(dates[9]).toBe("2027-03-13");
  });

  it("leaves out a break day, and a camp runs every weekday", () => {
    expect(termDates({ ...lilKickers, breakDates: ["2027-02-13"] })).toHaveLength(9);
    expect(termDates({ ...lilKickers, programType: "camp", termStartDate: "2026-12-14", termEndDate: "2026-12-20" })).toEqual(["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"]);
  });
});

describe("register V4: the birthday picks the class", () => {
  it("by age on the term's first day", () => {
    expect(classesForBirthday("2024-08-14", [lilKickers, kickers]).map((o) => o.slug)).toEqual(["lil-kickers"]);
    expect(classesForBirthday("2023-01-09", [lilKickers, kickers]).map((o) => o.slug)).toEqual(["kickers"]);
    expect(classesForBirthday("2025-12-01", [lilKickers, kickers])).toEqual([]);
    expect(classesForBirthday("not a date", [lilKickers, kickers])).toEqual([]);
  });

  it("says the age in words", () => {
    expect(ageOnDay("2024-08-14", "2027-01-09")).toBe("2 years 4 months");
    expect(ageOnDay("2026-01-09", "2027-01-09")).toBe("1 year");
  });
});

describe("register V4: the money", () => {
  it("claims no saving when the term costs the same as ten sessions (live prices)", () => {
    expect(priceFor(lilKickers, 10, "term")).toEqual({ dueCents: 34000, eachCents: null, savingCents: 0, plan: "term" });
    expect(priceFor(lilKickers, 10, "weekly")).toEqual({ dueCents: 3400, eachCents: 3400, savingCents: 0, plan: "weekly" });
  });

  it("works the saving out from the prices when the term is cheaper ($320)", () => {
    expect(priceFor({ ...lilKickers, termFeeCents: 32000 }, 10, "term").savingCents).toBe(2000);
  });

  it("charges a camp once", () => {
    expect(priceFor({ ...lilKickers, programType: "camp", termFeeCents: 15000 }, 5, "weekly")).toEqual({ dueCents: 15000, eachCents: null, savingCents: 0, plan: "term" });
  });
});
