import { describe, expect, it } from "vitest";
import {
  actionsFor,
  bookingWhatsAppText,
  bookPath,
  cleanDeclineReason,
  customerCanCancel,
  formatClockTime,
  formatWhen,
  isBookable,
  isClockTime,
  isForChildren,
  isIsoDay,
  lastBookableDay,
  nextStatus,
  quantityFrom,
  quantityQuestion,
  sortForTab,
  tabOf,
  whatsAppLink,
} from "./rules";

describe("which offerings can be asked for", () => {
  it("a price and no link of its own", () => {
    expect(isBookable({ priceCents: 15000, actionUrl: null })).toBe(true);
    expect(isBookable({ priceCents: 15000, actionUrl: "" })).toBe(true);
    expect(isBookable({ priceCents: 15000, actionUrl: "   " })).toBe(true);
    expect(isBookable({ priceCents: 0, actionUrl: null })).toBe(true);
  });

  it("not without a price, and not when it already has a link (outside or on PortPass)", () => {
    expect(isBookable({ priceCents: null, actionUrl: null })).toBe(false);
    expect(isBookable({ priceCents: 15000, actionUrl: "https://wa.me/12425550100" })).toBe(false);
    expect(isBookable({ priceCents: 15000, actionUrl: "/futprep/register?program=lil-kickers" })).toBe(false);
  });

  it("an offering whose ages stop below 18 is for children", () => {
    expect(isForChildren({ ageMin: 4, ageMax: 12 })).toBe(true);
    expect(isForChildren({ ageMin: null, ageMax: 17 })).toBe(true);
    expect(isForChildren({ ageMin: 16, ageMax: 18 })).toBe(false);
    expect(isForChildren({ ageMin: 4, ageMax: null })).toBe(false);
    expect(isForChildren({ ageMin: null, ageMax: null })).toBe(false);
  });

  it("builds the form's address from the business's page", () => {
    expect(bookPath("/entertainment/island-booth", "photo-booth-3h")).toBe("/entertainment/island-booth/book?offering=photo-booth-3h");
  });
});

describe("how many, how long", () => {
  it("asks the question the price unit implies", () => {
    expect(quantityQuestion("per_hour").label).toBe("How many hours?");
    expect(quantityQuestion("per_person").label).toBe("How many people?");
    expect(quantityQuestion("per_child").label).toBe("How many children?");
    expect(quantityQuestion(null).label).toBe("How many, or how long?");
    expect(quantityQuestion("from").label).toBe("How many, or how long?");
  });

  it("reads a leading number as the quantity a payment request starts from", () => {
    expect(quantityFrom("3 hours")).toBe(3);
    expect(quantityFrom(" 12 people")).toBe(12);
    expect(quantityFrom("2")).toBe(2);
    expect(quantityFrom("")).toBe(1);
    expect(quantityFrom("a few")).toBe(1);
    expect(quantityFrom("0")).toBe(1);
    // Not a quantity: four digits or more is a year or a phone number.
    expect(quantityFrom("2026 party")).toBe(1);
  });
});

describe("dates and times", () => {
  it("accepts real calendar days only", () => {
    expect(isIsoDay("2026-10-17")).toBe(true);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("17/10/2026")).toBe(false);
    expect(isIsoDay(20261017)).toBe(false);
  });

  it("accepts 24-hour times", () => {
    expect(isClockTime("14:30")).toBe(true);
    expect(isClockTime("00:00")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("2:30")).toBe(false);
  });

  it("takes requests up to two years ahead", () => {
    expect(lastBookableDay("2026-10-05")).toBe("2028-10-04");
  });

  it("says a day and a time the way people do", () => {
    expect(formatClockTime("14:30")).toBe("2:30 pm");
    expect(formatClockTime("09:00")).toBe("9 am");
    expect(formatClockTime("00:15")).toBe("12:15 am");
    expect(formatClockTime("12:00")).toBe("12 pm");
    expect(formatWhen("2026-10-17", "14:30")).toBe("Sat 17 Oct 2026 at 2:30 pm");
    expect(formatWhen("2026-10-17", null)).toBe("Sat 17 Oct 2026");
  });
});

describe("what can happen next", () => {
  it("a new request is confirmed or declined", () => {
    expect(actionsFor("new")).toEqual(["confirm", "decline"]);
    expect(nextStatus("new", "confirm")).toBe("confirmed");
    expect(nextStatus("new", "decline")).toBe("declined");
    expect(nextStatus("new", "done")).toBeNull();
  });

  it("a confirmed one is marked done, or declined after all", () => {
    expect(actionsFor("confirmed")).toEqual(["decline", "done"]);
    expect(nextStatus("confirmed", "done")).toBe("done");
    expect(nextStatus("confirmed", "confirm")).toBeNull();
  });

  it("a declined or done one can be re-opened; one the customer cancelled cannot", () => {
    expect(actionsFor("declined")).toEqual(["reopen"]);
    expect(actionsFor("done")).toEqual(["reopen"]);
    expect(actionsFor("cancelled")).toEqual([]);
    expect(nextStatus("cancelled", "confirm")).toBeNull();
  });

  it("the customer cancels only while nobody has answered", () => {
    expect(customerCanCancel("new")).toBe(true);
    for (const status of ["confirmed", "done", "declined", "cancelled"] as const) expect(customerCanCancel(status)).toBe(false);
  });

  it("a decline needs a real reason, kept to one line", () => {
    expect(cleanDeclineReason("  Fully   booked\nthat day ")).toBe("Fully booked that day");
    expect(cleanDeclineReason("no")).toBeNull();
    expect(cleanDeclineReason("   ")).toBeNull();
    expect(cleanDeclineReason(undefined)).toBeNull();
    expect(cleanDeclineReason("x".repeat(500))).toHaveLength(300);
  });
});

describe("the business's four lists", () => {
  const row = (status: Parameters<typeof tabOf>[0], createdAt: string, requestedDate: string, requestedTime: string | null = null) => ({ status, createdAt, requestedDate, requestedTime });

  it("puts a request the customer cancelled with the declined ones", () => {
    expect(tabOf("cancelled")).toBe("declined");
    expect(tabOf("new")).toBe("new");
  });

  it("new: the one that has waited longest first", () => {
    const rows = [row("new", "2026-10-05T12:00:00Z", "2026-11-01"), row("new", "2026-10-04T12:00:00Z", "2026-12-01"), row("confirmed", "2026-10-01T12:00:00Z", "2026-10-09")];
    expect(sortForTab("new", rows).map((r) => r.createdAt)).toEqual(["2026-10-04T12:00:00Z", "2026-10-05T12:00:00Z"]);
  });

  it("confirmed: by the day and time they are for", () => {
    const rows = [row("confirmed", "2026-10-01T12:00:00Z", "2026-10-20", "15:00"), row("confirmed", "2026-10-02T12:00:00Z", "2026-10-20", "09:00"), row("confirmed", "2026-10-03T12:00:00Z", "2026-10-12")];
    expect(sortForTab("confirmed", rows).map((r) => `${r.requestedDate} ${r.requestedTime ?? ""}`.trim())).toEqual(["2026-10-12", "2026-10-20 09:00", "2026-10-20 15:00"]);
  });

  it("declined: declined and cancelled together, newest first", () => {
    const rows = [row("declined", "2026-10-01T12:00:00Z", "2026-10-20"), row("cancelled", "2026-10-03T12:00:00Z", "2026-10-21"), row("done", "2026-10-04T12:00:00Z", "2026-10-02")];
    expect(sortForTab("declined", rows).map((r) => r.status)).toEqual(["cancelled", "declined"]);
  });
});

describe("WhatsApp, sent by hand", () => {
  it("starts the message with the reference and what it is for, and nothing else about the customer", () => {
    const text = bookingWhatsAppText({ businessName: "Island Booth", customerName: "Dana Rolle", referenceCode: "IB-B0007", offeringName: "Photo booth, 3 hours", requestedDate: "2026-10-17", requestedTime: "18:00" });
    expect(text).toBe("Hi Dana, this is Island Booth about your booking request IB-B0007 (Photo booth, 3 hours, Sat 17 Oct 2026 at 6 pm).");
  });

  it("opens wa.me with the number's digits and the text encoded", () => {
    expect(whatsAppLink("+1 (242) 555-0100", "Hi Dana & co")).toBe("https://wa.me/12425550100?text=Hi%20Dana%20%26%20co");
  });
});
