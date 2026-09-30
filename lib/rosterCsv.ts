// The camp roster as a spreadsheet (brief 06 v2, A1.7). The row type is
// the whitelist: it has no field for allergies, medical conditions,
// medications, special needs or emergency contacts, so none can reach the
// file whatever the query returns. Those stay on the coach roster behind
// the existing reveal rules. Pure, so it is unit-tested.

export type RosterExportRow = {
  referenceCode: string;
  childName: string;
  childDob: string | null;
  ageAtStart: number | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  authorizedPickup: string | null;
  photoConsent: string | null;
  registrationStatus: string;
  paymentStatus: string;
  amountDueCents: number;
  paidCents: number;
  // Attendance per camp day, keyed by YYYY-MM-DD.
  attendance: Record<string, string | null>;
};

export const ROSTER_CSV_BASE_HEADERS = [
  "Reference",
  "Child",
  "Date of birth",
  "Age at start",
  "Parent / guardian",
  "Parent phone",
  "Parent email",
  "Authorised pickup",
  "Photo consent",
  "Registration",
  "Payment",
  "Amount due",
  "Paid",
  "Balance",
] as const;

// Quote every cell; neutralise spreadsheet formulas (a cell that starts
// with = + - @ runs as a formula in Excel and Sheets).
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function buildRosterCsv(rows: RosterExportRow[], days: string[]): string {
  const header = [...ROSTER_CSV_BASE_HEADERS, ...days];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.referenceCode,
        row.childName,
        row.childDob,
        row.ageAtStart,
        row.parentName,
        row.parentPhone,
        row.parentEmail,
        row.authorizedPickup,
        row.photoConsent,
        row.registrationStatus,
        row.paymentStatus,
        money(row.amountDueCents),
        money(row.paidCents),
        money(Math.max(0, row.amountDueCents - row.paidCents)),
        ...days.map((day) => row.attendance[day] ?? ""),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // CRLF + BOM: opens cleanly in Excel on Windows with accents intact.
  return `﻿${lines.join("\r\n")}\r\n`;
}
