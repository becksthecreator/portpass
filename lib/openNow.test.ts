import { describe, expect, it } from "vitest";
import { closesInLabel, datedOfferLine, daysUntilClose, openCountSentence, orderOpenNow } from "./openNow";

// The October camp as it is on the live site: registration closes
// Wed 14 Oct at 6 pm in Nassau (22:00 UTC).
const CLOSES = "2026-10-14T22:00:00Z";

describe("how long a closing offer has left", () => {
  it("counts Nassau calendar days", () => {
    expect(daysUntilClose(CLOSES, new Date("2026-10-04T16:00:00Z"))).toBe(10);
    // Late evening in Nassau on the 13th is already the 14th in UTC.
    expect(daysUntilClose(CLOSES, new Date("2026-10-14T02:00:00Z"))).toBe(1);
    expect(daysUntilClose(CLOSES, new Date("2026-10-14T15:00:00Z"))).toBe(0);
    expect(daysUntilClose(CLOSES, new Date("2026-10-14T22:00:00Z"))).toBeNull();
    expect(daysUntilClose("not a date")).toBeNull();
  });

  it("says it in words", () => {
    expect(closesInLabel(CLOSES, new Date("2026-10-04T16:00:00Z"))).toBe("Closes in 10 days");
    expect(closesInLabel(CLOSES, new Date("2026-10-13T16:00:00Z"))).toBe("Closes tomorrow");
    expect(closesInLabel(CLOSES, new Date("2026-10-14T15:00:00Z"))).toBe("Closes today");
    expect(closesInLabel(CLOSES, new Date("2026-10-15T15:00:00Z"))).toBeNull();
    expect(closesInLabel(null)).toBeNull();
  });
});

describe("an open-now card", () => {
  it("gives a dated offer's facts on one line", () => {
    expect(datedOfferLine({ name: "TEST camp", termStartDate: "2026-10-15", termEndDate: "2026-10-16", ageLabel: "6–15", termFeeCents: 10000, registrationClosesAt: CLOSES })).toBe("15–16 Oct · Ages 6–15 · $100 · closes Wed 14 Oct");
    expect(datedOfferLine({ name: "TEST camp", termStartDate: "2026-10-15", termEndDate: "2026-10-16", ageLabel: "6–15", termFeeCents: 9950, registrationClosesAt: null })).toBe("15–16 Oct · Ages 6–15 · $99.50");
  });

  it("puts what closes soonest first and keeps the rest in order", () => {
    const cards = [{ key: "futprep" }, { key: "christmas", closesAt: "2026-12-16T22:00:00Z" }, { key: "weddings", closesAt: null }, { key: "october", closesAt: CLOSES }];
    expect(orderOpenNow(cards).map((card) => card.key)).toEqual(["october", "christmas", "futprep", "weddings"]);
  });

  it("counts the open businesses in words", () => {
    expect(openCountSentence(2)).toBe("Two are open right now.");
    expect(openCountSentence(1)).toBe("One is open right now.");
    expect(openCountSentence(14)).toBe("14 are open right now.");
    expect(openCountSentence(0)).toBe("");
  });
});
