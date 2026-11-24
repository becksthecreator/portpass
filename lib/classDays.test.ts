import { describe, expect, it } from "vitest";
import { classDaysLine } from "./classDays";

const field = "Lyford Cay Lower Campus Soccer Field";

describe("the class list's opening line", () => {
  it("names the one day and the one place", () => {
    expect(classDaysLine([{ day: "Saturday", location: field }, { day: "Saturday", location: field }])).toBe(`Saturdays at ${field}.`);
  });

  it("names every day in week order, so a weekday class doesn't read as Saturday", () => {
    expect(classDaysLine([{ day: "Saturday", location: field }, { day: "Wednesday", location: field }])).toBe(`Wednesdays and Saturdays at ${field}.`);
    expect(classDaysLine([{ day: "Friday" }, { day: "Monday" }, { day: "Saturday" }])).toBe("Mondays, Fridays and Saturdays.");
  });

  it("leaves the place out when classes are in more than one", () => {
    expect(classDaysLine([{ day: "Saturday", location: field }, { day: "Tuesday", location: "TEST Gym" }])).toBe("Tuesdays and Saturdays.");
  });

  it("leaves camps out, and says nothing when there are only camps", () => {
    expect(classDaysLine([{ day: "Monday", programType: "camp", location: "TEST Camp" }, { day: "Saturday", location: field }])).toBe(`Saturdays at ${field}.`);
    expect(classDaysLine([{ day: "Monday", programType: "camp" }])).toBe("");
    expect(classDaysLine([])).toBe("");
  });
});
