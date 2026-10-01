import { describe, expect, it } from "vitest";
import { bookingsCsv, BOOKINGS_CSV_HEADER, csvCell, nassauMonth, outstandingFrom, owingCents, reconcile, type AdminBooking, type AdminPayment } from "./adminBookings";

const booking = (over: Partial<AdminBooking>): AdminBooking => ({ kind: "registration", id: 1, reference: "FP-TEST-1", organizationId: 1, organizationName: "TEST Club", customer: "TEST Parent", detail: "TEST Child · TEST class", createdAt: "2026-10-01T15:00:00+00:00", status: "confirmed", paymentStatus: "pending", dueCents: 30000, paidCents: 0, email: null, phone: null, ...over });
const payment = (over: Partial<AdminPayment>): AdminPayment => ({ source: "payment", id: 1, kind: "registration", organizationId: 1, organizationName: "TEST Club", payer: "TEST Parent", bookingReference: "FP-TEST-1", amountCents: 10000, method: "cash", status: "received", reference: null, receivedAt: "2026-10-01T15:00:00+00:00", recordedBy: "TEST Desk", ...over });

describe("what a booking still owes", () => {
  it("is the price less what was received, never below zero", () => {
    expect(owingCents(booking({ paidCents: 10000 }))).toBe(20000);
    expect(owingCents(booking({ paidCents: 35000 }))).toBe(0);
  });

  it("is nothing for a cancelled, waitlisted, declined or waived booking, or one with no price", () => {
    for (const status of ["cancelled", "waitlist", "declined", "released", "pending_details"]) expect(owingCents(booking({ status }))).toBe(0);
    expect(owingCents(booking({ paymentStatus: "waived" }))).toBe(0);
    expect(owingCents(booking({ dueCents: null, paidCents: null }))).toBe(0);
  });
});

describe("the bookings spreadsheet", () => {
  it("has no health or emergency column", () => {
    expect(BOOKINGS_CSV_HEADER.join(" ").toLowerCase()).not.toMatch(/allerg|medic|emergency|needs|pickup|notes/);
  });

  it("quotes commas and quotes, and writes money in dollars", () => {
    const csv = bookingsCsv([booking({ customer: 'TEST "Tee" Parent, Jr', paidCents: 12550 })]);
    const [header, line] = csv.split("\r\n");
    expect(header).toBe(BOOKINGS_CSV_HEADER.join(","));
    expect(line).toContain('"TEST ""Tee"" Parent, Jr"');
    expect(line).toContain("300.00,125.50");
  });

  it("makes a cell a spreadsheet would run as a formula into plain text", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+12425550100")).toBe("'+12425550100");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@name")).toBe("'@name");
    expect(csvCell(null)).toBe("");
    expect(csvCell("TEST plain")).toBe("TEST plain");
  });
});

describe("month by month", () => {
  it("puts a payment in the month it landed in on Nassau's calendar", () => {
    // 1 November 02:30 UTC is still 31 October in Nassau.
    expect(nassauMonth("2026-11-01T02:30:00Z")).toBe("2026-10");
    expect(nassauMonth("2026-11-01T12:00:00Z")).toBe("2026-11");
  });

  it("adds received money by month, business and method, and keeps reversed money apart", () => {
    const lines = reconcile([
      payment({ id: 1, amountCents: 10000 }),
      payment({ id: 2, amountCents: 2500 }),
      payment({ id: 3, amountCents: 5000, status: "voided" }),
      payment({ id: 4, amountCents: 30000, method: "bank_transfer" }),
      payment({ id: 5, amountCents: 30000, method: "bank_transfer", reference: "TEST-REF-1" }),
      payment({ id: 6, amountCents: 4000, receivedAt: "2026-09-15T15:00:00+00:00" }),
      payment({ id: 7, source: "shop_order", kind: "shop_order", amountCents: 6000, method: "bank_transfer" }),
    ]);
    expect(lines.map((l) => `${l.month} ${l.method}`)).toEqual(["2026-10 bank_transfer", "2026-10 cash", "2026-09 cash"]);
    expect(lines[1]).toMatchObject({ count: 2, receivedCents: 12500, reversedCount: 1, reversedCents: 5000, missingReference: 0 });
    // A shop order's reference is on the order: only the staff-recorded transfer with none is flagged.
    expect(lines[0]).toMatchObject({ count: 3, receivedCents: 66000, missingReference: 1 });
  });
});

describe("what is owed to each business", () => {
  it("adds up only bookings that owe, by business and by kind, biggest first", () => {
    const outstanding = outstandingFrom([
      booking({ id: 1, paidCents: 10000 }),
      booking({ id: 2, paidCents: 30000 }),
      booking({ id: 3, status: "cancelled" }),
      booking({ id: 4, kind: "private_session", status: "accepted", paymentStatus: "unpaid", dueCents: 6000 }),
      booking({ id: 5, organizationId: 2, organizationName: "TEST Shop", kind: "shop_order", status: "active", dueCents: 50000 }),
    ]);
    expect(outstanding.map((o) => [o.organizationName, o.owingCents, o.bookingsOwing])).toEqual([["TEST Shop", 50000, 1], ["TEST Club", 26000, 2]]);
    expect(outstanding[1].byKind).toEqual([{ kind: "registration", label: "Registration", owingCents: 20000, count: 1 }, { kind: "private_session", label: "Private session", owingCents: 6000, count: 1 }]);
  });
});
