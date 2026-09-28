import { describe, expect, it } from "vitest";
import { addedFeatures, annualCents, dollars, percentFromBps, type PricingPlan } from "./pricingFormat";

const solo: PricingPlan = { code: "solo", name: "Solo", kind: "subscription", monthlyCents: 6500, annualMonthsCharged: 10, commissionBps: 0, blurb: null, features: ["Booking page", "Dashboard"], badge: null, isPublic: true, sort: 1, active: true };
const growing: PricingPlan = { ...solo, code: "growing", name: "Growing", monthlyCents: 12000, features: ["Booking page", "Dashboard", "Packages"] };

describe("pricing helpers", () => {
  it("charges ten months for a year: Growing is $1,200", () => {
    expect(annualCents(growing)).toBe(120000);
    expect(dollars(annualCents(growing))).toBe("$1,200");
  });

  it("formats dollars and commission", () => {
    expect(dollars(6500)).toBe("$65");
    expect(dollars(4550)).toBe("$45.50");
    expect(percentFromBps(800)).toBe("8%");
    expect(percentFromBps(1550)).toBe("15.5%");
  });

  it("finds what a plan adds over the one before it", () => {
    expect(addedFeatures(growing, solo)).toEqual(["Packages"]);
    expect(addedFeatures(solo, null)).toEqual(solo.features);
  });
});
