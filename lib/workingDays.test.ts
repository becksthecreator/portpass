import { describe, expect, it } from "vitest";
import { cleanWorkingDays, dayOffMessage, isoWeekday, isWorkingDay, workingDaysLabel } from "./workingDays";

describe("a coach's working days (Brief 29, part C)", () => {
  it("reads ISO weekdays from a date, Monday 1 to Sunday 7", () => {
    expect(isoWeekday("2026-10-12")).toBe(1); // a Monday
    expect(isoWeekday("2026-10-13")).toBe(2);
    expect(isoWeekday("2026-10-16")).toBe(5);
    expect(isoWeekday("2026-10-18")).toBe(7);
    expect(isoWeekday("not a date")).toBeNull();
  });

  it("accepts only the coach's days, and every day when there is no rule", () => {
    const bex = [1, 3, 5];
    expect(isWorkingDay(bex, "2026-10-12")).toBe(true); // Monday
    expect(isWorkingDay(bex, "2026-10-13")).toBe(false); // Tuesday
    expect(isWorkingDay(bex, "2026-10-14")).toBe(true); // Wednesday
    expect(isWorkingDay(bex, "2026-10-16")).toBe(true); // Friday
    expect(isWorkingDay(bex, "2026-10-17")).toBe(false); // Saturday
    expect(isWorkingDay([], "2026-10-17")).toBe(true);
    expect(isWorkingDay(bex, "nope")).toBe(false);
  });

  it("writes the days as a sentence", () => {
    expect(workingDaysLabel([1, 3, 5])).toBe("Mondays, Wednesdays and Fridays");
    expect(workingDaysLabel([5, 1, 3])).toBe("Mondays, Wednesdays and Fridays");
    expect(workingDaysLabel([6])).toBe("Saturdays");
    expect(workingDaysLabel([6, 7])).toBe("Saturdays and Sundays");
    expect(workingDaysLabel([])).toBe("");
    expect(dayOffMessage("Coach TEST", [1, 3, 5])).toBe("Coach TEST works Mondays, Wednesdays and Fridays. Pick one of those days.");
  });

  it("cleans what a form sends", () => {
    expect(cleanWorkingDays(["1", 3, "3", 9, 0, "x", 7])).toEqual([1, 3, 7]);
    expect(cleanWorkingDays("1,3")).toEqual([]);
    expect(cleanWorkingDays(null)).toEqual([]);
  });
});
