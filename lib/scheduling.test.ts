import { describe, expect, it } from "vitest";
import { ageOnDate, generateWeeklySessionDates, nextWeekdayOnOrAfter } from "./scheduling";

describe("ageOnDate", () => {
  it("computes a simple whole-year age", () => {
    expect(ageOnDate("2020-01-15", "2026-01-15")).toBe(6);
  });

  it("has not turned the age yet if the date is before this year's birthday", () => {
    expect(ageOnDate("2020-06-15", "2026-06-14")).toBe(5);
  });

  it("turns the age on the exact birthday", () => {
    expect(ageOnDate("2020-06-15", "2026-06-15")).toBe(6);
  });

  it("handles a leap-day birthday in a non-leap year", () => {
    // Feb 29 2020 -> as of Feb 28 2026 (not yet Mar 1), still 5.
    expect(ageOnDate("2020-02-29", "2026-02-28")).toBe(5);
    expect(ageOnDate("2020-02-29", "2026-03-01")).toBe(6);
  });

  it("returns -1 for an unparseable date instead of throwing", () => {
    expect(ageOnDate("not-a-date", "2026-01-15")).toBe(-1);
    expect(ageOnDate("2020-01-15", "also-not-a-date")).toBe(-1);
  });
});

describe("nextWeekdayOnOrAfter", () => {
  it("returns the same date if it already falls on the target weekday", () => {
    // 2026-09-05 is a Saturday.
    const result = nextWeekdayOnOrAfter("2026-09-05", "Saturday");
    expect(result.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("advances to the next occurrence of the target weekday", () => {
    // 2026-09-01 is a Tuesday; next Saturday is 2026-09-05.
    const result = nextWeekdayOnOrAfter("2026-09-01", "Saturday");
    expect(result.toISOString().slice(0, 10)).toBe("2026-09-05");
  });
});

describe("generateWeeklySessionDates", () => {
  it("generates one date per week across the term", () => {
    const dates = generateWeeklySessionDates({
      startDate: "2026-09-05",
      endDate: "2026-09-26",
      dayOfWeek: "Saturday",
      breakDates: [],
    });
    expect(dates).toEqual(["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]);
  });

  it("excludes break dates without shifting the remaining cadence", () => {
    const dates = generateWeeklySessionDates({
      startDate: "2026-09-05",
      endDate: "2026-10-03",
      dayOfWeek: "Saturday",
      breakDates: ["2026-09-19"],
    });
    expect(dates).toEqual(["2026-09-05", "2026-09-12", "2026-09-26", "2026-10-03"]);
  });

  it("snaps a term start date that isn't on the program's weekday to the first real occurrence", () => {
    // Term starts on a Tuesday but the program runs on Saturdays - the first
    // session should be the Saturday on/after the term start, not Tuesday
    // itself and not a week early/late.
    const dates = generateWeeklySessionDates({
      startDate: "2026-09-01",
      endDate: "2026-09-12",
      dayOfWeek: "Saturday",
      breakDates: [],
    });
    expect(dates).toEqual(["2026-09-05", "2026-09-12"]);
  });

  it("returns no dates when the term ends before the weekday first occurs", () => {
    const dates = generateWeeklySessionDates({
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      dayOfWeek: "Saturday",
      breakDates: [],
    });
    expect(dates).toEqual([]);
  });
});
