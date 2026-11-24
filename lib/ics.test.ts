import { describe, expect, it } from "vitest";
import { buildIcs, nassauToUtc, parseClock } from "./ics";

const base = { uidPrefix: "futprep-lil-kickers-42", title: "Futprep Lil Kickers · Term 2", location: "Lyford Cay Lower Campus Soccer Field", now: new Date("2026-11-24T12:00:00Z") };

describe("the class calendar file (register V4)", () => {
  it("has one event per session, in UTC from Nassau time", () => {
    const ics = buildIcs({ ...base, sessions: [{ date: "2027-01-09", start: "9:00 AM", end: "9:30 AM" }, { date: "2027-01-16", start: "9:00 AM", end: "9:30 AM" }] });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    // January: Nassau is UTC-5.
    expect(ics).toContain("DTSTART:20270109T140000Z");
    expect(ics).toContain("DTEND:20270109T143000Z");
    expect(ics).toContain("UID:futprep-lil-kickers-42-2027-01-09@portpassbahamas.com");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("is right after a clock change (Nassau moves to UTC-4 in March)", () => {
    expect(nassauToUtc("2027-03-20", 9, 0).toISOString()).toBe("2027-03-20T13:00:00.000Z");
    expect(nassauToUtc("2027-03-13", 9, 0).toISOString()).toBe("2027-03-13T14:00:00.000Z");
  });

  it("escapes text and folds long lines", () => {
    const ics = buildIcs({ ...base, location: "Field, by the gate; bring water", description: "A".repeat(200), sessions: [{ date: "2027-01-09", start: "10:00 AM", end: "10:45 AM" }] });
    expect(ics).toContain("LOCATION:Field\\, by the gate\\; bring water");
    // A lone carriage return can't break a line of the file either.
    expect(buildIcs({ ...base, location: "Field\rGate", sessions: [{ date: "2027-01-09", start: "10:00 AM", end: "10:45 AM" }] })).toContain("LOCATION:Field\\nGate");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("holds nothing about a child or a parent: only the class, dates, times and place", () => {
    const ics = buildIcs({ ...base, sessions: [{ date: "2027-01-09", start: "9:00 AM", end: "9:30 AM" }] });
    const keys = new Set(ics.split("\r\n").filter((l) => l && !l.startsWith(" ")).map((l) => l.split(":")[0]));
    expect([...keys].sort()).toEqual(["BEGIN", "CALSCALE", "DTEND", "DTSTAMP", "DTSTART", "END", "LOCATION", "METHOD", "PRODID", "SUMMARY", "UID", "VERSION", "X-WR-CALNAME"].sort());
  });

  it("skips a session with an unreadable date or time, and gives one with no end an hour", () => {
    const ics = buildIcs({ ...base, sessions: [{ date: "2027-1-9", start: "9:00 AM", end: "" }, { date: "2027-01-16", start: "nine", end: "" }, { date: "2027-01-23", start: "9:00 AM", end: "" }] });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTEND:20270123T150000Z");
  });

  it("reads the clock times the database stores", () => {
    expect(parseClock("9:00 AM")).toEqual([9, 0]);
    expect(parseClock("12:00 PM")).toEqual([12, 0]);
    expect(parseClock("12:15 am")).toEqual([0, 15]);
    expect(parseClock("10:45:00")).toEqual([10, 45]);
    expect(parseClock("13:00 PM")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});
