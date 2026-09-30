// Futprep coach pay, school contracts and the program P&L (brief 13).
// Pure, so the staff pages, the CSV exports and the tests agree.
import { csvCell } from "./rosterCsv";

export type StaffRole = "lead" | "assistant";

// What a coach is owed for one session in a role: their default rate for
// that role, or nothing yet (null) until Alex sets it.
export function payForRole(
  coach: { defaultLeadPayCents: number | null; defaultAssistantPayCents: number | null },
  role: StaffRole,
): number | null {
  return role === "lead" ? coach.defaultLeadPayCents : coach.defaultAssistantPayCents;
}

// "2026-10" from "2026-10-17".
export function monthOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

// "October 2026".
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
}

export type LedgerRow = {
  coachId: number;
  coachName: string;
  sessionDate: string;
  programName: string;
  role: StaffRole;
  payCents: number;
  paidAt: string | null;
};

export type PaySummary = {
  coachId: number;
  coachName: string;
  month: string;
  sessions: number;
  owedCents: number;
  paidCents: number;
};

// Per coach, per month: sessions coached, still owed, already paid. Newest
// month first, then by coach name.
export function summarizePay(rows: LedgerRow[]): PaySummary[] {
  const byKey = new Map<string, PaySummary>();
  for (const row of rows) {
    const month = monthOf(row.sessionDate);
    const key = `${row.coachId}:${month}`;
    const summary = byKey.get(key) ?? { coachId: row.coachId, coachName: row.coachName, month, sessions: 0, owedCents: 0, paidCents: 0 };
    summary.sessions += 1;
    if (row.paidAt) summary.paidCents += row.payCents;
    else summary.owedCents += row.payCents;
    byKey.set(key, summary);
  }
  return Array.from(byKey.values()).sort((a, b) => b.month.localeCompare(a.month) || a.coachName.localeCompare(b.coachName));
}

export function payCsv(rows: LedgerRow[]): string {
  const header = ["Coach", "Month", "Session date", "Program", "Role", "Pay (BSD)", "Paid on"];
  const lines = rows
    .slice()
    .sort((a, b) => a.coachName.localeCompare(b.coachName) || a.sessionDate.localeCompare(b.sessionDate))
    .map((row) => [row.coachName, monthOf(row.sessionDate), row.sessionDate, row.programName, row.role, (row.payCents / 100).toFixed(2), row.paidAt ? row.paidAt.slice(0, 10) : ""]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---- The PortPass fee (the Money Model's "PortPass (Founding Partner)") ----
// The Marketplace rate (8%, stored as 800 basis points in pricing_plans) on
// fees from families PortPass brought in, never more than $360 a term.
export const PORTPASS_FEE_CAP_CENTS = 36000;

export function portpassFeeCents(eligibleFeesCents: number, bps = 800, capCents = PORTPASS_FEE_CAP_CENTS): number {
  return Math.min(capCents, Math.round((Math.max(0, eligibleFeesCents) * bps) / 10000));
}

// The cap is per term across the classes that share it (Lil Kickers and
// Kickers in Term 1), so the fee is worked out for the group and shared
// back in proportion to each program's eligible fees.
export function shareFee(totalCents: number, parts: number[]): number[] {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return parts.map(() => 0);
  const shares = parts.map((part) => Math.floor((totalCents * part) / sum));
  let remainder = totalCents - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0 && i < shares.length; i += 1, remainder -= 1) shares[i] += 1;
  return shares;
}

// ---- School contracts -------------------------------------------------------
export type ContractBilling = "per_session" | "per_term";

// What to invoice the school: sessions delivered × fee, or the term fee.
export function contractInvoiceCents(billing: ContractBilling, feeCents: number, sessionsDelivered: number): number {
  if (billing === "per_term") return sessionsDelivered > 0 ? feeCents : 0;
  return feeCents * Math.max(0, sessionsDelivered);
}

export type ContractLine = {
  client: string;
  programName: string;
  termName: string;
  billing: ContractBilling;
  feeCents: number;
  sessionsDelivered: number;
  sessionsScheduled: number;
  invoiceCents: number;
};

// No child data: the school gets an invoice, not a roster.
export function contractsCsv(lines: ContractLine[]): string {
  const header = ["Client", "Program", "Term", "Billing", "Fee (BSD)", "Sessions delivered", "Sessions scheduled", "To invoice (BSD)"];
  const rows = lines.map((line) => [line.client, line.programName, line.termName, line.billing === "per_session" ? "Per session" : "Per term", (line.feeCents / 100).toFixed(2), line.sessionsDelivered, line.sessionsScheduled, (line.invoiceCents / 100).toFixed(2)]);
  return [header, ...rows].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---- Program P&L -------------------------------------------------------------
export type PnlLine = {
  programName: string;
  termName: string;
  kind: "term" | "camp" | "contract";
  feesCollectedCents: number;
  coachPayCents: number;
  fieldCostCents: number;
  portpassFeeCents: number;
  leftCents: number;
};

export function leftForFutprep(line: Omit<PnlLine, "leftCents">): number {
  return line.feesCollectedCents - line.coachPayCents - line.fieldCostCents - line.portpassFeeCents;
}
