import { describe, expect, it } from "vitest";
import { classBadge, type TermWindow } from "./futprepClassStatus";

// Futprep's live terms on 19 Nov 2026: Term 1 closed to new families on
// 11 Oct; Term 2 opens at midnight in Nassau on Mon 7 Dec.
const term1: TermWindow = { active: true, endDate: "2026-12-05", registrationOpensAt: null, registrationClosesAt: "2026-10-11T00:03:56Z" };
const term2: TermWindow = { active: true, endDate: "2027-03-13", registrationOpensAt: "2026-12-07T05:00:00Z", registrationClosesAt: null };

describe("classBadge", () => {
  it("names the opening day while the next term is not open yet", () => {
    expect(classBadge([term1, term2], new Date("2026-11-19T15:00:00Z"))).toEqual({ open: false, label: "Registration opens Mon 7 Dec" });
  });

  it("says open from midnight in Nassau on the opening day", () => {
    expect(classBadge([term1, term2], new Date("2026-12-07T04:59:59Z")).open).toBe(false);
    expect(classBadge([term1, term2], new Date("2026-12-07T05:00:00Z"))).toEqual({ open: true, label: "Open now" });
  });

  it("says closed once registration closes and nothing else is coming", () => {
    expect(classBadge([{ ...term2, registrationClosesAt: "2027-01-20T00:00:00Z" }], new Date("2027-02-01T12:00:00Z"))).toEqual({ open: false, label: "Registration closed" });
  });

  it("ignores inactive and finished terms", () => {
    expect(classBadge([{ ...term2, active: false }], new Date("2026-12-10T12:00:00Z")).label).toBe("Registration closed");
    expect(classBadge([{ ...term1, registrationClosesAt: null }], new Date("2026-12-06T12:00:00Z")).label).toBe("Registration closed");
  });

  it("is open with no opening time set and no close", () => {
    expect(classBadge([{ ...term2, registrationOpensAt: null }], new Date("2026-11-19T12:00:00Z")).open).toBe(true);
  });
});
