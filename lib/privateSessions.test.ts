import { describe, expect, it } from "vitest";
import { privateSessionAcceptedEmail } from "./email";
import { childrenAllowed, perChildCents, privatePaymentStatus, privateSessionCode, serviceFromRow, serviceKind, SESSION_REFERENCE, sessionButtonLabel, sessionReference, sessionTotalCents, weeklySlotDates } from "./privateSessions";

describe("private sessions (brief 06 v2, Part B)", () => {
  it("generates a coach's weekly slots from the next matching day", () => {
    // Thu 1 Oct 2026 -> the next Wednesday is 7 Oct.
    expect(weeklySlotDates({ fromDate: "2026-10-01", dayOfWeek: "Wednesday", weeks: 3 })).toEqual(["2026-10-07", "2026-10-14", "2026-10-21"]);
    expect(weeklySlotDates({ fromDate: "2026-10-07", dayOfWeek: "Wednesday", weeks: 1 })).toEqual(["2026-10-07"]);
    expect(weeklySlotDates({ fromDate: "2026-10-01", dayOfWeek: "Funday", weeks: 3 })).toEqual([]);
    expect(weeklySlotDates({ fromDate: "2026-10-01", dayOfWeek: "Monday", weeks: 99 })).toHaveLength(26);
  });

  it("makes the old PS- codes as the fallback, and the FP-S references with the business prefix", () => {
    expect(privateSessionCode(new Date("2026-10-01T00:00:00Z"), "7k3qd9a1-0000-0000-0000-000000000000")).toBe("PS-2026-7K3QD9A");
    expect(sessionReference("FP", 7)).toBe("FP-S0007");
    expect(sessionReference("FP", 12345)).toBe("FP-S12345");
    expect(SESSION_REFERENCE.test("FP-S0007")).toBe(true);
    expect(SESSION_REFERENCE.test("FP-0042")).toBe(false);
    expect(SESSION_REFERENCE.test("PS-2026-7K3QD9A")).toBe(false);
  });

  it("knows the payment states", () => {
    expect(privatePaymentStatus(6000, 0)).toBe("unpaid");
    expect(privatePaymentStatus(6000, 3000)).toBe("partial");
    expect(privatePaymentStatus(6000, 6000)).toBe("paid");
  });

  it("writes the acceptance email with the time, place, price and reference as the transfer reference", () => {
    const { subject, html } = privateSessionAcceptedEmail({
      parentName: "TEST Parent",
      childName: "TEST <Child>",
      serviceName: "Private session · 60 min",
      coachName: "Coach Alexander Thompson",
      date: "2026-10-07",
      startTime: "4:00 PM",
      durationMinutes: 60,
      location: "Lyford Cay Lower Campus Soccer Field",
      priceCents: 7000,
      referenceCode: "FP-S0007",
      bank: { bankName: "TEST Bank", accountName: "Futprep Athletics", last4: "4879", instructions: "Account 000-TEST (SWIFT TESTBSNS)." },
    });
    expect(subject).toBe("Confirmed: Private session · 60 min with Coach Alexander Thompson, Wed 7 Oct");
    for (const part of ["Wed 7 Oct", "4:00 PM", "60 minutes", "Lyford Cay Lower Campus Soccer Field", "$70", "FP-S0007", "TEST Bank", "account ending 4879", "000-TEST", "cash to your coach"]) expect(html).toContain(part);
    expect(html).toContain("TEST &lt;Child&gt;");
    expect(html).not.toMatch(/allerg|medical|medication/i);
  });
});

describe("services from the database (Brief 29, part B)", () => {
  const row = (over: Partial<Parameters<typeof serviceFromRow>[0]>) => serviceFromRow({ slug: "private-60", name: "Private session · 60 min", price_cents: 7000, price_unit: "per_session", is_published: true, duration_minutes: 60, min_children: 1, max_children: 1, ...over });

  it("reads the length and the children from the row, so a new published service just appears", () => {
    expect(row({})).toMatchObject({ slug: "private-60", durationMinutes: 60, minChildren: 1, maxChildren: 1, kind: "session", requestType: "private_lesson", priceCents: 7000, perChildCents: 7000 });
    expect(row({ slug: "private-1on1", name: "Private session · 30 min", price_cents: 3500, duration_minutes: 30 })).toMatchObject({ durationMinutes: 30, perChildCents: 3500 });
    expect(row({ slug: "private-group", name: "Group Session (4+)", price_cents: 3500, price_unit: "per_child", duration_minutes: 45, min_children: 4, max_children: 8 })).toMatchObject({ minChildren: 4, maxChildren: 8, perChildCents: 3500 });
  });

  it("falls back to the first services' known lengths for a row made before the columns, and to 45 minutes otherwise", () => {
    expect(row({ slug: "private-pair", name: "Pair", price_cents: 12000, duration_minutes: null, min_children: null, max_children: null })).toMatchObject({ durationMinutes: 45, minChildren: 2, maxChildren: 2, perChildCents: 6000 });
    expect(row({ slug: "something-new", name: "Something new", duration_minutes: null, min_children: null, max_children: null })).toMatchObject({ durationMinutes: 45, minChildren: 1, maxChildren: 1 });
    expect(row({ slug: "x", name: "x", min_children: 4, max_children: 2 }).maxChildren).toBe(4);
  });

  it("knows a party from a session", () => {
    expect(serviceKind("birthday-party", "Birthday Football Party")).toBe("party");
    expect(serviceKind("football-party", "Football party on the field")).toBe("party");
    expect(serviceKind("private-60", "Private session · 60 min")).toBe("session");
    expect(row({ slug: "birthday-party", name: "Birthday Football Party", price_cents: 30000, price_unit: null, duration_minutes: 90 })).toMatchObject({ kind: "party", requestType: "birthday", durationMinutes: 90 });
  });

  it("prices per child the way Futprep does, and totals a group by the children", () => {
    expect(perChildCents(8000, "per_session", 1, 1)).toBe(8000);
    expect(perChildCents(12000, "per_session", 2, 2)).toBe(6000);
    expect(perChildCents(13500, "per_session", 3, 3)).toBe(4500);
    expect(perChildCents(3500, "per_child", 4, 8)).toBe(3500);
    expect(perChildCents(null, "per_session", 1, 1)).toBeNull();
    expect(sessionTotalCents(3500, "per_child", 5)).toBe(17500);
    expect(sessionTotalCents(13500, "per_session", 3)).toBe(13500);
    expect(childrenAllowed({ minChildren: 4, maxChildren: 8 }, 4)).toBe(true);
    expect(childrenAllowed({ minChildren: 4, maxChildren: 8 }, 9)).toBe(false);
    expect(childrenAllowed({ minChildren: 3, maxChildren: 3 }, 2)).toBe(false);
  });

  it("writes the coach button from the data, shortest first, and hides prices it does not have", () => {
    const thirty = row({ slug: "private-1on1", name: "Private session · 30 min", price_cents: 3500, duration_minutes: 30 });
    const sixty = row({});
    const party = row({ slug: "birthday-party", name: "Birthday Football Party", price_cents: 30000, duration_minutes: 90 });
    const unpublished = row({ slug: "private-pair", name: "Pair", price_cents: 12000, is_published: false });
    expect(sessionButtonLabel([sixty, thirty, party, unpublished])).toBe("Book a private session · 30 min $35 · 60 min $70 →");
    expect(sessionButtonLabel([party])).toBe("Book a private session →");
    expect(sessionButtonLabel([])).toBe("Book a private session →");
  });
});
