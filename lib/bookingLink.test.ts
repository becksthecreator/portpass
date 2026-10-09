import { describe, expect, it } from "vitest";
import { bookingDescription, bookingLink, bookingTitle, coachShortName, readBookingParams } from "./bookingLink";

describe("the booking link (Brief 29, part D)", () => {
  it("builds the link with the coach, the service and the source tags", () => {
    expect(bookingLink("https://portpassbahamas.com", "test-coach")).toBe("https://portpassbahamas.com/futprep/book?coach=test-coach");
    expect(bookingLink("https://portpassbahamas.com/", "test-coach", "private-60", { source: "whatsapp", medium: "link" })).toBe("https://portpassbahamas.com/futprep/book?coach=test-coach&service=private-60&utm_source=whatsapp&utm_medium=link");
    expect(bookingLink("https://portpassbahamas.com", null)).toBe("https://portpassbahamas.com/futprep/book");
  });

  it("reads the query against what exists and names what it could not find", () => {
    const known = { coaches: ["test-coach", "other-coach"], services: ["private-1on1", "private-60"] };
    expect(readBookingParams({ coach: "test-coach", service: "private-60" }, known)).toEqual({ coachSlug: "test-coach", serviceSlug: "private-60", unknown: [] });
    expect(readBookingParams({ coach: "Nobody", service: "private-60" }, known)).toEqual({ coachSlug: null, serviceSlug: "private-60", unknown: ["coach"] });
    expect(readBookingParams({ coach: "test-coach", service: "gold-plan" }, known)).toEqual({ coachSlug: "test-coach", serviceSlug: null, unknown: ["service"] });
    expect(readBookingParams({}, known)).toEqual({ coachSlug: null, serviceSlug: null, unknown: [] });
    expect(readBookingParams({ coach: ["test-coach", "x"], service: "<script>" }, known)).toEqual({ coachSlug: "test-coach", serviceSlug: null, unknown: ["service"] });
  });

  it("names the coach the short way for the title WhatsApp shows", () => {
    expect(coachShortName({ display_name: "Coach TEST Thompson", nickname: "Coach Tee" })).toBe("Coach Tee");
    expect(coachShortName({ display_name: "Coach TEST Thompson", nickname: null })).toBe("Coach TEST Thompson");
    expect(bookingTitle({ display_name: "Coach TEST Thompson", nickname: "Coach Tee" })).toBe("Book a private session with Coach Tee · Futprep");
    expect(bookingTitle(null)).toBe("Book a private session · Futprep");
    const services = [{ durationMinutes: 60, priceCents: 7000, kind: "session", isPublished: true }, { durationMinutes: 30, priceCents: 3500, kind: "session", isPublished: true }, { durationMinutes: 90, priceCents: 30000, kind: "party", isPublished: true }];
    expect(bookingDescription({ display_name: "Coach TEST Thompson", nickname: "Coach Tee" }, services)).toBe("Request a private football session with Coach Tee in Nassau: 30 min $35 or 60 min $70. Pick a time; the coach confirms. Cash or bank transfer.");
  });
});
