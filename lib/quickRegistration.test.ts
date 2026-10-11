import { describe, expect, it } from "vitest";
import { ageMonthsAtTermStart, ageProblem, ageWords, asksMonths, dobFromAgeMonths, howToPayLines, mapsUrl, nextSessionDate, type QuickOffer } from "./quickRegistration";

// Booking in three taps (brief 27, C). Today is Wednesday 14 Oct 2026.
const today = "2026-10-14";

const lilKickers: QuickOffer = { name: "Futprep Lil Kickers", ageLabel: "1½–3", ageMin: 1, ageMax: 3, ageMinMonths: 18, ageMaxMonths: 36, day: "Saturday", programType: "term", termStartDate: "2027-01-09", termEndDate: "2027-03-20", breakDates: ["2027-02-13"] };
const kickers: QuickOffer = { name: "Futprep Kickers", ageLabel: "3–6", ageMin: 3, ageMax: 6, ageMinMonths: null, ageMaxMonths: null, day: "Saturday", programType: "term", termStartDate: "2026-09-05", termEndDate: "2026-12-05", breakDates: ["2026-10-17"] };
const camp: QuickOffer = { name: "Christmas camp", ageLabel: "5–12", ageMin: 5, ageMax: 12, day: "Weekdays", programType: "camp", termStartDate: "2026-12-17", termEndDate: "2026-12-18", breakDates: [] };

describe("the next session", () => {
  it("is the term's first Saturday when the term is still to come", () => {
    expect(nextSessionDate(lilKickers, today)).toBe("2027-01-09");
  });
  it("is the next Saturday that isn't a break when the term is running", () => {
    // 17 Oct is a break, so the 24th.
    expect(nextSessionDate(kickers, today)).toBe("2026-10-24");
    expect(nextSessionDate(kickers, "2026-10-24")).toBe("2026-10-24");
  });
  it("is the first camp day, and nothing once the term has ended", () => {
    expect(nextSessionDate(camp, today)).toBe("2026-12-17");
    expect(nextSessionDate(kickers, "2026-12-06")).toBeNull();
    expect(nextSessionDate({ ...kickers, day: "Someday" }, today)).toBeNull();
  });
});

describe("age", () => {
  it("asks for months only for the youngest group", () => {
    expect(asksMonths(lilKickers)).toBe(true);
    expect(asksMonths(kickers)).toBe(false);
  });
  it("counts the age on the day the term starts, ahead or behind, from the stored date of birth", () => {
    // Born 1 Apr 2024 (2 years 6 months today): 33 months on 9 Jan 2027,
    // 29 months on 5 Sept 2026, the day Term 1 started.
    expect(ageMonthsAtTermStart(30, today, "2027-01-09")).toBe(33);
    expect(ageMonthsAtTermStart(30, today, "2026-09-05")).toBe(29);
    expect(ageMonthsAtTermStart(36, today, today)).toBe(36);
  });
  it("tells the parent early when the class won't fit, in the class's own words", () => {
    expect(ageProblem(lilKickers, 30, today)).toBeNull();
    // 2 years 11 months today is 3 years 1 month on 9 Jan: too old for Lil Kickers.
    expect(ageProblem(lilKickers, 35, today)).toBe("Futprep Lil Kickers is for ages 1½–3, counted on the day the term starts.");
    expect(ageProblem(kickers, 30, today)).toBe("Futprep Kickers is for ages 3–6, counted on the day the term started.");
    expect(ageProblem(kickers, 6 * 12 + 11, today)).toBeNull();
    expect(ageProblem({ ...kickers, termStartDate: today }, 3 * 12, today)).toBeNull();
    expect(ageProblem(kickers, Number.NaN, today)).toBe("Enter the child's age.");
  });
  it("stores an age as a first-of-the-month date of birth and says it in words", () => {
    expect(dobFromAgeMonths(30, today)).toBe("2024-04-01");
    expect(dobFromAgeMonths(0, "2026-01-31")).toBe("2026-01-01");
    expect(dobFromAgeMonths(36, "2026-10-02")).toBe("2023-10-01");
    expect(ageWords(30)).toBe("2 years 6 months");
    expect(ageWords(12)).toBe("1 year");
    expect(ageWords(7)).toBe("7 months");
    expect(ageWords(25)).toBe("2 years 1 month");
  });
});

describe("the Done screen", () => {
  const settings = { bankName: "TEST Bank", accountName: "Futprep Athletics", accountNumberLast4: "4879", transferInstructions: "Transit 00000.", cashNote: "" };
  it("shows bank details with the last four digits only, and the reference", () => {
    expect(howToPayLines("bank_transfer", settings, "FP-2026-ABCD1234")).toEqual(["TEST Bank · Futprep Athletics · account ending 4879", "Transit 00000.", "Use FP-2026-ABCD1234 as the transfer reference."]);
    expect(howToPayLines("bank_transfer", settings, "FP-1").join(" ")).not.toContain("07046");
  });
  it("says cash is paid at the field, and copes with no settings", () => {
    expect(howToPayLines("cash", settings, "FP-1")[0]).toContain("cash at the field");
    expect(howToPayLines("cash", { ...settings, cashNote: "Bring exact change to Coach Bex." }, "FP-1")[0]).toBe("Bring exact change to Coach Bex.");
    expect(howToPayLines("bank_transfer", null, "FP-1")[0]).toContain("WhatsApp");
  });
  it("opens the place in maps as a search", () => {
    expect(mapsUrl("Lyford Cay Lower Campus Soccer Field", "Nassau")).toBe("https://www.google.com/maps/search/?api=1&query=Lyford%20Cay%20Lower%20Campus%20Soccer%20Field%2C%20Nassau");
  });
});
