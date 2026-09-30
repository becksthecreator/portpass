import { describe, expect, it } from "vitest";
import { buildRosterCsv, csvCell, ROSTER_CSV_BASE_HEADERS, type RosterExportRow } from "./rosterCsv";

const row: RosterExportRow = {
  referenceCode: "FP-2026-ABC12345",
  childName: "Test, Child \"TJ\"",
  childDob: "2020-03-01",
  ageAtStart: 6,
  parentName: "TEST — delete",
  parentPhone: "+12425550100",
  parentEmail: "test@example.com",
  authorizedPickup: "=HYPERLINK(\"x\")",
  photoConsent: "no",
  registrationStatus: "pending",
  paymentStatus: "partial",
  amountDueCents: 15000,
  paidCents: 5000,
  attendance: { "2026-10-13": "present", "2026-10-14": null },
};

describe("camp roster CSV", () => {
  it("has no medical, allergy or emergency columns", () => {
    const header = buildRosterCsv([row], ["2026-10-13"]).split("\r\n")[0].toLowerCase();
    for (const banned of ["allerg", "medical", "medication", "special", "emergency", "condition", "notes"]) {
      expect(header).not.toContain(banned);
    }
    expect(ROSTER_CSV_BASE_HEADERS).toHaveLength(14);
  });

  it("writes one column per camp day and the money as dollars", () => {
    const lines = buildRosterCsv([row], ["2026-10-13", "2026-10-14"]).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].endsWith('"2026-10-13","2026-10-14"')).toBe(true);
    expect(lines[1]).toContain('"150.00","50.00","100.00","present",""');
  });

  it("quotes commas and quotes, and neutralises formulas", () => {
    expect(csvCell('Test, Child "TJ"')).toBe('"Test, Child ""TJ"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("\"'=HYPERLINK(1)\"");
    expect(csvCell("+1242")).toBe("\"'+1242\"");
    expect(csvCell(null)).toBe('""');
  });
});
