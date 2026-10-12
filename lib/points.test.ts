import { describe, expect, it } from "vitest";
import { formatPointsDelta, howPointsAreEarned, isPointsReason, pointsEventLabel, POINTS_RULES } from "./points";

describe("PortPass Points words", () => {
  it("carries the brief's line word for word", () => {
    expect(POINTS_RULES).toBe("Points have no cash value, cannot be transferred, and expire 12 months after they are earned.");
  });

  it("says what each event was, with the business and never a person", () => {
    expect(pointsEventLabel({ reason: "booking_attended", delta: 10, businessName: "Futprep Athletics" })).toBe("Attended a booking at Futprep Athletics");
    expect(pointsEventLabel({ reason: "order_paid", delta: 35, businessName: "TEST Kit Shop" })).toBe("Market order paid at TEST Kit Shop");
    expect(pointsEventLabel({ reason: "manual_adjust", delta: -35, businessName: "TEST Kit Shop", refType: "reservation" })).toBe("Order no longer paid at TEST Kit Shop");
    expect(pointsEventLabel({ reason: "manual_adjust", delta: -10, businessName: "Futprep Athletics", refType: "registration" })).toBe("Attendance mark undone at Futprep Athletics");
    expect(pointsEventLabel({ reason: "manual_adjust", delta: 5, businessName: null })).toBe("Added by PortPass");
    expect(pointsEventLabel({ reason: "expiry", delta: -10, businessName: "Futprep Athletics" })).toBe("Expired, 12 months after they were earned");
  });

  it("shows the sign on every change", () => {
    expect(formatPointsDelta(10)).toBe("+10");
    expect(formatPointsDelta(-1250)).toBe("−1,250");
  });

  it("explains how points are earned from the rules in force", () => {
    expect(howPointsAreEarned({ perDollar: 1, perAttendance: 10 })).toBe("You earn 1 point for each dollar of a PortPass Market order, once the business marks it paid, and 10 points the first time you, or a child you registered, attend a class or programme you signed up for.");
    expect(howPointsAreEarned({ perDollar: 0, perAttendance: 0 })).toBe("Earning is paused for now.");
  });

  it("knows the ledger's reasons and nothing else", () => {
    for (const reason of ["order_paid", "booking_attended", "programme_milestone", "manual_adjust", "expiry"]) expect(isPointsReason(reason)).toBe(true);
    expect(isPointsReason("redeemed")).toBe(false);
  });
});
