import { describe, expect, it } from "vitest";
import { describeFill, mapHeaders, nameKey, parseCsv, parseDate, planImport, toRecords, type ExistingRegistration } from "./teamsnapImport";

const CSV =
  "﻿First Name,Last Name,Birthdate,Gender,Contact 1 First Name,Contact 1 Last Name,Contact 1 Email,Contact 1 Mobile Phone,Emergency Contact Name,Emergency Contact Phone,Allergies,Jersey Number\r\n" +
  'Ava,Rolle,03/14/2023,Female,Kim,Rolle,KIM@example.com,(242) 555-0101,"Rolle, Tom",242-555-0102,Peanuts,7\r\n' +
  "Ben,Smith,2022-11-02,Male,Jo,Smith,jo@example.com,2425550103,,,,9\r\n" +
  ',,,,,,,,,,,\r\n' +
  "Zoe,Unknown,01/01/2023,,,,,,,,,\r\n";

describe("parsing a TeamSnap roster (brief 13)", () => {
  it("reads quoted fields, CRLF, a byte-order mark and skips blank rows", () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(4);
    expect(rows[1][8]).toBe("Rolle, Tom");
    expect(parseCsv('a,"b ""c"""\nd,"e\nf"')).toEqual([["a", 'b "c"'], ["d", "e\nf"]]);
  });

  it("maps TeamSnap's column names and lists the ones it ignores", () => {
    const { records, mapped, unmapped } = toRecords(parseCsv(CSV));
    expect(mapped).toEqual(expect.arrayContaining(["childFirst", "childLast", "childDob", "parentFirst", "parentEmail", "parentPhone", "emergencyName", "allergies"]));
    expect(unmapped).toEqual(["Jersey Number"]);
    expect(records[0]).toMatchObject({ row: 2, childName: "Ava Rolle", childDob: "2023-03-14", parentName: "Kim Rolle", parentEmail: "kim@example.com", emergencyName: "Rolle, Tom", allergies: "Peanuts" });
    expect(records[1]).toMatchObject({ childName: "Ben Smith", childDob: "2022-11-02", emergencyName: null, allergies: null });
    expect(mapHeaders(["Player Name", "DOB"])).toEqual({ childName: 0, childDob: 1 });
  });

  it("reads US-style and ISO dates and refuses impossible ones", () => {
    expect(parseDate("3/4/23")).toBe("2023-03-04");
    expect(parseDate("12/31/2022")).toBe("2022-12-31");
    expect(parseDate("2023-02-30")).toBeNull();
    expect(parseDate("31/12/2022")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });

  it("matches by name regardless of case, accents and punctuation", () => {
    expect(nameKey("  Ávila-Smith,  Jo ")).toBe(nameKey("avila smith jo"));
  });
});

describe("planning the import (brief 13)", () => {
  const registrations: ExistingRegistration[] = [
    { id: 1, referenceCode: "FP-2026-AAAA0001", childName: "Ava Rolle", status: "pending_details", current: { parent_name: null, parent_email: null, parent_phone: null, child_dob: null, allergies: null } },
    { id: 2, referenceCode: "FP-2026-AAAA0002", childName: "ben smith", status: "pending_details", current: { parent_name: "Jo Smith (staff)", parent_email: null, child_dob: null } },
    { id: 3, referenceCode: "FP-2026-AAAA0003", childName: "Zoe Unknown", status: "pending_details", current: {} },
    { id: 4, referenceCode: "FP-2026-AAAA0004", childName: "Zoe Unknown", status: "pending_details", current: {} },
  ];

  it("fills only empty fields, medical only when TeamSnap has it, and reports what it can't match", () => {
    const { records } = toRecords(parseCsv(CSV + "Cal,Nobody,,,,,,,,,,\r\n"));
    const plan = planImport(records, registrations);
    const ava = plan.find((p) => p.childName === "Ava Rolle")!;
    expect(ava).toMatchObject({ status: "fill", registrationId: 1 });
    expect(ava.fill).toMatchObject({ parent_name: "Kim Rolle", parent_email: "kim@example.com", parent_phone: "+12425550101", child_dob: "2023-03-14", allergies: "Peanuts" });
    expect(describeFill(ava.fill)).toContain("medical notes (1)");
    expect(describeFill(ava.fill).join(" ")).not.toContain("Peanuts");

    const ben = plan.find((p) => p.childName === "Ben Smith")!;
    expect(ben.fill.parent_name).toBeUndefined(); // already on file: never overwritten
    expect(ben.fill).toMatchObject({ parent_email: "jo@example.com", child_dob: "2022-11-02" });
    expect(ben.fill.allergies).toBeUndefined(); // TeamSnap had none: the parent is asked

    expect(plan.find((p) => p.childName === "Zoe Unknown")!.status).toBe("ambiguous");
    expect(plan.find((p) => p.childName === "Cal Nobody")!.status).toBe("no_match");
  });

  it("leaves a completed registration alone", () => {
    const { records } = toRecords(parseCsv(CSV));
    const plan = planImport(records, [{ ...registrations[0], status: "pending" }]);
    expect(plan[0]).toMatchObject({ status: "not_pending", fill: {} });
  });
});
