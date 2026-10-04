import { describe, expect, it } from "vitest";
import { clockTime, dollarsToCents, parseProgramInput } from "./programInput";

const valid = {
  name: "TEST Saturday Juniors", audience: "children", programType: "term", ageMin: 4, ageMax: 10, dayOfWeek: "Saturday",
  startTime: "10:00", endTime: "11:30", location: "TEST hall, Nassau", capacity: 16, termName: "Term 1",
  termStartDate: "2026-11-07", termEndDate: "2026-12-19", weeklyFee: "25", termFee: "$180.00", registrationClosesAt: "",
};
const error = (over: Record<string, unknown>) => {
  const parsed = parseProgramInput({ ...valid, ...over });
  return parsed.ok ? null : parsed.error;
};

describe("adding a class or camp", () => {
  it("turns what was typed into what is kept", () => {
    const parsed = parseProgramInput(valid);
    expect(parsed.ok && parsed.value).toEqual({
      name: "TEST Saturday Juniors", audience: "children", programType: "term", ageMin: 4, ageMax: 10, dayOfWeek: "Saturday",
      startTime: "10:00 AM", endTime: "11:30 AM", location: "TEST hall, Nassau", capacity: 16, termName: "Term 1",
      termStartDate: "2026-11-07", termEndDate: "2026-12-19", weeklyFeeCents: 2500, termFeeCents: 18000, registrationClosesAt: null,
    });
  });

  it("asks an adults' class for no ages, and keeps it as 18 and over", () => {
    const parsed = parseProgramInput({ ...valid, audience: "adults", ageMin: "", ageMax: "", weeklyFee: "" });
    expect(parsed.ok && parsed.value).toMatchObject({ audience: "adults", ageMin: 18, ageMax: 99, weeklyFeeCents: 0 });
  });

  it("makes a camp run on weekdays, paid in full, and reads a closing time as Nassau time", () => {
    const parsed = parseProgramInput({ ...valid, programType: "camp", dayOfWeek: "", weeklyFee: "", termFee: "100", registrationClosesAt: "2026-10-14T18:00" });
    expect(parsed.ok && parsed.value).toMatchObject({ programType: "camp", dayOfWeek: "Weekdays", weeklyFeeCents: 10000, termFeeCents: 10000, registrationClosesAt: "2026-10-14T22:00:00.000Z" });
  });

  it("says in words what is missing or wrong", () => {
    expect(error({ name: "x" })).toMatch(/name/);
    expect(error({ audience: "everyone" })).toMatch(/who it is for/);
    expect(error({ ageMin: 12, ageMax: 6 })).toMatch(/ages/);
    expect(error({ ageMin: 18, ageMax: 30 })).toMatch(/under-18s/);
    expect(error({ dayOfWeek: "Someday" })).toMatch(/day of the week/);
    expect(error({ startTime: "25:00" })).toMatch(/start and end time/);
    expect(error({ location: "" })).toMatch(/where/);
    expect(error({ capacity: 0 })).toMatch(/places/);
    expect(error({ termEndDate: "2026-10-01" })).toMatch(/before the first/);
    expect(error({ termEndDate: "2028-12-19" })).toMatch(/up to a year/);
    expect(error({ termFee: "lots" })).toMatch(/fee/);
    expect(error({ weeklyFee: "-5" })).toMatch(/weekly fee/);
    expect(error({ registrationClosesAt: "soon" })).toMatch(/closes/);
  });

  it("reads times and money as people type them", () => {
    expect(clockTime("00:05")).toBe("12:05 AM");
    expect(clockTime("12:00")).toBe("12:00 PM");
    expect(clockTime("18:30")).toBe("6:30 PM");
    expect(clockTime("6pm")).toBeNull();
    expect(dollarsToCents("1,250.50")).toBe(125050);
    expect(dollarsToCents("$35")).toBe(3500);
    expect(dollarsToCents(40)).toBe(4000);
    expect(dollarsToCents("12.345")).toBeNull();
    expect(dollarsToCents("")).toBeNull();
  });
});
