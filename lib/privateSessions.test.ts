import { describe, expect, it } from "vitest";
import { privateSessionAcceptedEmail } from "./email";
import { childrenAllowed, isPrivateServiceSlug, perChildCents, privatePaymentStatus, privateSessionCode, sessionTotalCents, weeklySlotDates } from "./privateSessions";

describe("private sessions (brief 06 v2, Part B)", () => {
  it("generates a coach's weekly slots from the next matching day", () => {
    // Thu 1 Oct 2026 -> the next Wednesday is 7 Oct.
    expect(weeklySlotDates({ fromDate: "2026-10-01", dayOfWeek: "Wednesday", weeks: 3 })).toEqual(["2026-10-07", "2026-10-14", "2026-10-21"]);
    expect(weeklySlotDates({ fromDate: "2026-10-07", dayOfWeek: "Wednesday", weeks: 1 })).toEqual(["2026-10-07"]);
    expect(weeklySlotDates({ fromDate: "2026-10-01", dayOfWeek: "Funday", weeks: 3 })).toEqual([]);
    expect(weeklySlotDates({ fromDate: "2026-10-01", dayOfWeek: "Monday", weeks: 99 })).toHaveLength(26);
  });

  it("makes PS- codes", () => {
    expect(privateSessionCode(new Date("2026-10-01T00:00:00Z"), "7k3qd9a1-0000-0000-0000-000000000000")).toBe("PS-2026-7K3QD9A");
  });

  it("knows the four services and the payment states", () => {
    expect(isPrivateServiceSlug("birthday-party")).toBe(true);
    expect(isPrivateServiceSlug("private-lesson")).toBe(false);
    expect(privatePaymentStatus(6000, 0)).toBe("unpaid");
    expect(privatePaymentStatus(6000, 3000)).toBe("partial");
    expect(privatePaymentStatus(6000, 6000)).toBe("paid");
  });

  it("writes the acceptance email with the time, place, price and PS- code as the transfer reference", () => {
    const { subject, html } = privateSessionAcceptedEmail({
      parentName: "TEST Parent",
      childName: "TEST <Child>",
      serviceName: "1-on-1 Session",
      coachName: "Coach Alexander Thompson",
      date: "2026-10-07",
      startTime: "4:00 PM",
      durationMinutes: 45,
      location: "Lyford Cay Lower Campus Soccer Field",
      priceCents: 6000,
      referenceCode: "PS-2026-7K3QD9A",
      bank: { bankName: "TEST Bank", accountName: "Futprep Athletics", accountNumber: "000-TEST", swiftCode: "TESTBSNS" },
    });
    expect(subject).toBe("Confirmed: 1-on-1 Session with Coach Alexander Thompson, Wed 7 Oct");
    for (const part of ["Wed 7 Oct", "4:00 PM", "45 minutes", "Lyford Cay Lower Campus Soccer Field", "$60", "PS-2026-7K3QD9A", "TEST Bank", "000-TEST"]) expect(html).toContain(part);
    expect(html).toContain("TEST &lt;Child&gt;");
    expect(html).not.toMatch(/allerg|medical|medication/i);
  });
});

describe("private-session tiers per child (brief 13)", () => {
  it("prices each tier per child the way Futprep does", () => {
    expect(perChildCents("private-1on1", 8000, "per_session")).toBe(8000);
    expect(perChildCents("private-pair", 12000, "per_session")).toBe(6000);
    expect(perChildCents("private-trio", 13500, "per_session")).toBe(4500);
    expect(perChildCents("private-group", 3500, "per_child")).toBe(3500);
    expect(perChildCents("private-1on1", null, "per_session")).toBeNull();
  });

  it("totals a group session by the number of children, 4 to 8", () => {
    expect(sessionTotalCents(3500, "per_child", 5)).toBe(17500);
    expect(sessionTotalCents(13500, "per_session", 3)).toBe(13500);
    expect(childrenAllowed("private-group", 4)).toBe(true);
    expect(childrenAllowed("private-group", 8)).toBe(true);
    expect(childrenAllowed("private-group", 3)).toBe(false);
    expect(childrenAllowed("private-group", 9)).toBe(false);
    expect(childrenAllowed("private-trio", 3)).toBe(true);
    expect(childrenAllowed("private-trio", 2)).toBe(false);
    expect(isPrivateServiceSlug("private-trio")).toBe(true);
    expect(isPrivateServiceSlug("private-group")).toBe(true);
  });
});
