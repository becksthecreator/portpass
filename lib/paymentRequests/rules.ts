import { nassauToday } from "@/lib/futprepTerms";
import { csvCell } from "@/lib/rosterCsv";

// Payment requests (brief 17, Payments Phase 1): the pure rules, shared by
// db/paymentRequests.ts, the business screens, the customer's /pay page and
// the tests. No server imports.
//
// PortPass never holds money. A business asks, the customer pays the
// business directly (bank transfer, cash, or a Kanoo wallet transfer they
// make themselves), and the business records what it received.

export type RequestStatus = "draft" | "sent" | "part_paid" | "paid" | "void";
export type RequestMethod = "cash" | "bank_transfer" | "kanoo_wallet_manual";
export type SentVia = "whatsapp_link" | "email" | "in_person" | "link";
export type ReminderVia = "whatsapp_link" | "email";

export type LineItem = { label: string; qty: number; unitCents: number };

// The method list. card and kanoo_link are Phase 2 of
// PortPass_Payments_Build_Plan.md (a processor, a licence): reserved here
// as disabled values so the shape is ready, never offered, never shown,
// and refused by the database until Phase 2 widens its check.
export const METHOD_LIST = [
  { value: "bank_transfer", enabled: true },
  { value: "cash", enabled: true },
  { value: "kanoo_wallet_manual", enabled: true },
  { value: "card", enabled: false },
  { value: "kanoo_link", enabled: false },
] as const;

export const REQUEST_METHODS: RequestMethod[] = METHOD_LIST.filter((m) => m.enabled).map((m) => m.value as RequestMethod);

export function isRequestMethod(value: unknown): value is RequestMethod {
  return typeof value === "string" && (REQUEST_METHODS as string[]).includes(value);
}

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  kanoo_wallet_manual: "Kanoo wallet",
  online_banking: "Online banking",
};

// Labels for the methods a business can offer and record. A payment
// recorded on the Futprep desk can also say "Online banking".
export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? method.replace(/_/g, " ");
}

const SENT_VIA_LABEL: Record<SentVia, string> = {
  whatsapp_link: "WhatsApp",
  email: "email",
  in_person: "in person",
  link: "a copied link",
};

export function sentViaLabel(via: SentVia | null): string {
  return via ? SENT_VIA_LABEL[via] : "";
}

export type HowToPay = {
  bankName: string;
  accountName: string;
  accountNumberLast4: string | null;
  transferInstructions: string;
  kanooHandleOrPhone: string;
  cashNote: string;
  // The methods the business chose in its Get paid step (brief 18, E1).
  acceptedMethods?: RequestMethod[] | null;
};

// What each chosen method still needs before a customer can be asked to
// use it. Cash needs nothing more (where and when is optional).
export function methodMissing(s: HowToPay, method: RequestMethod): string | null {
  if (method === "bank_transfer") {
    if (!s.bankName.trim() || !s.accountName.trim()) return "Bank transfer needs the bank and the account name.";
    if (!s.accountNumberLast4 && !s.transferInstructions.trim()) return "Bank transfer needs the last four digits of the account, or your transfer instructions.";
  }
  if (method === "kanoo_wallet_manual" && !s.kanooHandleOrPhone.trim()) return "A Kanoo wallet transfer needs your Kanoo handle or number.";
  return null;
}

// The methods a business can offer on a request: the ones it chose in its
// Get paid step, each with its details in place. Nothing until it has
// said how it gets paid.
export function methodsSetUp(s: HowToPay | null): RequestMethod[] {
  if (!s) return [];
  const chosen = s.acceptedMethods ?? [];
  return (["bank_transfer", "cash", "kanoo_wallet_manual"] as RequestMethod[]).filter((method) => chosen.includes(method) && methodMissing(s, method) === null);
}

// Why a business can't send a payment request yet, in words; null once its
// Get paid step is done (brief 18, E2).
export function getPaidProblem(s: HowToPay | null): string | null {
  const chosen = s?.acceptedMethods ?? [];
  if (!s || chosen.length === 0) return "Add how you get paid first.";
  for (const method of chosen) {
    const missing = methodMissing(s, method);
    if (missing) return missing;
  }
  return null;
}

// ---- money ------------------------------------------------------------------

// Always two decimals: these are receipts and balances.
export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// "$45" or "45.50" typed by staff -> cents; null when it isn't money.
export function parseDollars(input: string): number | null {
  const text = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function linesTotal(lines: LineItem[]): number {
  return lines.reduce((sum, line) => sum + line.qty * line.unitCents, 0);
}

// What the request is for, in one line: "Lil Kickers term fee — Amara" or
// "TEST jersey (M) and 2 more".
export function linesSummary(lines: LineItem[]): string {
  if (lines.length === 0) return "";
  const first = lines[0].qty > 1 ? `${lines[0].qty} × ${lines[0].label}` : lines[0].label;
  return lines.length === 1 ? first : `${first} and ${lines.length - 1} more`;
}

// ---- status -----------------------------------------------------------------

export type RequestState = {
  status: RequestStatus;
  totalCents: number;
  paidCents: number;
  dueDate: string;
};

export function balanceCents(r: Pick<RequestState, "totalCents" | "paidCents" | "status">): number {
  return r.status === "void" ? 0 : Math.max(0, r.totalCents - r.paidCents);
}

// The status the database derives (payment_requests_derive_status): kept
// here too so the screens and tests agree with it.
export function deriveStatus(r: { status: RequestStatus; totalCents: number; paidCents: number; sent: boolean }): RequestStatus {
  if (r.status === "void") return "void";
  if (r.paidCents >= r.totalCents) return "paid";
  if (r.paidCents > 0) return "part_paid";
  return r.sent ? "sent" : "draft";
}

// Overdue is derived, never stored: sent (or part paid) and the due date,
// a Nassau calendar day, has passed in Nassau.
export function isOverdue(r: Pick<RequestState, "status" | "dueDate">, today: string = nassauToday()): boolean {
  return (r.status === "sent" || r.status === "part_paid") && r.dueDate < today;
}

export function daysOverdue(dueDate: string, today: string = nassauToday()): number {
  const ms = Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dueDate}T12:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export type DisplayStatus = RequestStatus | "overdue";

export function displayStatus(r: Pick<RequestState, "status" | "dueDate">, today: string = nassauToday()): DisplayStatus {
  return isOverdue(r, today) ? "overdue" : r.status;
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  part_paid: "Part paid",
  paid: "Paid",
  void: "Void",
  overdue: "Overdue",
};

export function statusLabel(status: DisplayStatus): string {
  return STATUS_LABEL[status];
}

// A request can be changed until money is recorded against it.
export function canEditRequest(r: Pick<RequestState, "status" | "paidCents">): boolean {
  return r.status !== "void" && r.paidCents === 0;
}

// A paid (or part-paid) request can't be voided: record a refund instead.
export function canVoidRequest(r: Pick<RequestState, "status" | "paidCents">): boolean {
  return r.status !== "void" && r.paidCents === 0;
}

export function canRecordPayment(r: Pick<RequestState, "status" | "totalCents" | "paidCents">): boolean {
  return r.status !== "void" && r.paidCents < r.totalCents;
}

// "Mark paid": never more than the balance; less only when the request
// allows part payments.
export type AmountProblem = "BAD_AMOUNT" | "OVER_BALANCE" | "PART_NOT_ALLOWED" | null;
export function amountProblem(amountCents: number, balance: number, allowPartPayment: boolean): AmountProblem {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return "BAD_AMOUNT";
  if (amountCents > balance) return "OVER_BALANCE";
  if (amountCents < balance && !allowPartPayment) return "PART_NOT_ALLOWED";
  return null;
}

// The customer's page works for 180 days after the request is paid or
// voided, then says the link has expired.
export const LINK_DAYS_AFTER_CLOSE = 180;
export function linkExpired(r: { status: RequestStatus; paidAt: string | null; voidedAt: string | null }, now: Date = new Date()): boolean {
  const closedAt = r.status === "paid" ? r.paidAt : r.status === "void" ? r.voidedAt : null;
  if (!closedAt) return false;
  return now.getTime() - Date.parse(closedAt) > LINK_DAYS_AFTER_CLOSE * 86_400_000;
}

// ---- reminders ----------------------------------------------------------------

// "Show last reminded so nobody gets three in a day": a second reminder
// within a day asks first.
export function remindedRecently(lastRemindedAt: string | null, now: Date = new Date()): boolean {
  return lastRemindedAt !== null && now.getTime() - Date.parse(lastRemindedAt) < 86_400_000;
}

export function sinceLabel(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// ---- references and prefixes -------------------------------------------------

export function isValidPrefix(value: string): boolean {
  return /^[A-Z]{2,4}$/.test(value);
}

// A first guess at a business's two to four letters: its initials, or the
// first two letters of a one-word name. The owner can change it.
export function defaultPrefix(name: string): string {
  const words = name.normalize("NFKD").replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "PP";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase().padEnd(2, "X");
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
}

export function normalizeRequestReference(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

// ---- dates (Nassau) -------------------------------------------------------------

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// "Fri 9 Oct" for a calendar day; with the year when it isn't this year.
export function formatDay(date: string, today: string = nassauToday()): string {
  const d = new Date(`${date}T12:00:00Z`);
  const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" };
  if (date.slice(0, 4) !== today.slice(0, 4)) options.year = "numeric";
  return d.toLocaleDateString("en-GB", options);
}

export function nassauDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
}

// "2026-10": the Nassau month an instant falls in.
export function nassauMonth(iso: string): string {
  return nassauDate(iso).slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---- the business's list -----------------------------------------------------------

export type ListedRequest = RequestState & {
  // A TEST request (brief 18, E3): never money, left out of every total.
  isTest?: boolean;
  id: number;
  referenceCode: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  lines: LineItem[];
  createdAt: string;
  sentAt: string | null;
  customerSaysPaidAt: string | null;
  lastRemindedAt: string | null;
};

export type RequestFilter = "outstanding" | "overdue" | "paid" | "check" | "all";

export function filterRequests<T extends ListedRequest>(rows: T[], filter: RequestFilter, search: string, today: string = nassauToday()): T[] {
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  return rows.filter((r) => {
    if (filter === "outstanding" && !(r.status === "draft" || r.status === "sent" || r.status === "part_paid")) return false;
    if (filter === "overdue" && !isOverdue(r, today)) return false;
    if (filter === "paid" && r.status !== "paid") return false;
    if (filter === "check" && !needsChecking(r)) return false;
    if (!q) return true;
    return (
      r.referenceCode.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      (r.customerEmail ?? "").toLowerCase().includes(q) ||
      (qDigits.length >= 3 && (r.customerPhone ?? "").replace(/\D/g, "").includes(qDigits))
    );
  });
}

// The customer tapped "I've paid" and nobody has confirmed it yet.
export function needsChecking(r: Pick<ListedRequest, "customerSaysPaidAt" | "status">): boolean {
  return r.customerSaysPaidAt !== null && (r.status === "sent" || r.status === "part_paid" || r.status === "draft");
}

// Overdue requests, oldest due date first: the chase list.
export function chaseList<T extends ListedRequest>(rows: T[], today: string = nassauToday()): T[] {
  rows = rows.filter((r) => !r.isTest);
  return rows.filter((r) => isOverdue(r, today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
}

export type RecordedPayment = {
  amountCents: number;
  status: "received" | "voided" | "refunded";
  receivedAt: string;
};

export type RequestTotals = {
  collectedThisMonthCents: number;
  outstandingCents: number;
  outstandingCount: number;
  overdueCents: number;
  overdueCount: number;
  toCheckCount: number;
};

// Totals at the top of Payments -> Requests. Collected counts money
// received against requests in this Nassau month; outstanding and overdue
// are what sent requests still have to come in.
export function requestTotals(rows: ListedRequest[], payments: RecordedPayment[], today: string = nassauToday()): RequestTotals {
  const month = today.slice(0, 7);
  const totals: RequestTotals = { collectedThisMonthCents: 0, outstandingCents: 0, outstandingCount: 0, overdueCents: 0, overdueCount: 0, toCheckCount: 0 };
  for (const p of payments) {
    if (p.status === "received" && nassauMonth(p.receivedAt) === month) totals.collectedThisMonthCents += p.amountCents;
  }
  for (const r of rows) {
    if (r.isTest) continue;
    if (needsChecking(r)) totals.toCheckCount += 1;
    if (r.status !== "sent" && r.status !== "part_paid") continue;
    const balance = balanceCents(r);
    totals.outstandingCents += balance;
    totals.outstandingCount += 1;
    if (isOverdue(r, today)) {
      totals.overdueCents += balance;
      totals.overdueCount += 1;
    }
  }
  return totals;
}

// ---- messages the staff member sends ------------------------------------------------

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export type MessageInput = {
  businessName: string;
  customerName: string;
  referenceCode: string;
  lines: LineItem[];
  totalCents: number;
  balanceCents: number;
  dueDate: string;
  payUrl: string;
};

// Prefilled in WhatsApp for the staff member to send: the amount, what
// it's for and the request link. PortPass never sends WhatsApp messages.
export function requestMessage(m: MessageInput, today: string = nassauToday()): string {
  return [
    `Hi ${firstName(m.customerName)}, this is ${m.businessName}.`,
    `Payment request ${m.referenceCode}: ${linesSummary(m.lines)}, ${money(m.balanceCents)}, due ${formatDay(m.dueDate, today)}.`,
    `How to pay us: ${m.payUrl}`,
  ].join("\n");
}

export function reminderMessage(m: MessageInput, today: string = nassauToday()): string {
  return [
    `Hi ${firstName(m.customerName)}, a reminder from ${m.businessName}.`,
    `${m.referenceCode} (${linesSummary(m.lines)}) has ${money(m.balanceCents)} still to pay; it was due ${formatDay(m.dueDate, today)}.`,
    `How to pay: ${m.payUrl}`,
    `If you've already paid, thank you, and tap "I've paid" on that page so we can check.`,
  ].join("\n");
}

export function receiptMessage(m: { businessName: string; customerName: string; referenceCode: string; amountCents: number; balanceCents: number; receiptUrl: string }): string {
  return [
    `Hi ${firstName(m.customerName)}, thank you. ${m.businessName} received ${money(m.amountCents)} for ${m.referenceCode}.`,
    m.balanceCents > 0 ? `${money(m.balanceCents)} is still to pay.` : "That's paid in full.",
    `Your receipt: ${m.receiptUrl}`,
  ].join("\n");
}

export function payPath(token: string): string {
  return `/pay/${token}`;
}

export function receiptPath(token: string, receiptNumber?: string | null): string {
  return `/pay/${token}/receipt${receiptNumber ? `?r=${encodeURIComponent(receiptNumber)}` : ""}`;
}

// wa.me with the text prefilled; with no number WhatsApp asks who to send it to.
export function whatsappLink(phoneE164: string | null, text: string): string {
  const digits = phoneE164 ? phoneE164.replace(/\D/g, "") : "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ---- the customer's line from an existing record ----------------------------------------

// Futprep "Request payment" on a registration: the child's fee less what's
// already recorded. Only the child's first name and the programme: never
// health or other personal details.
export function futprepFeeLine(input: { programName: string; childName: string; paymentFrequency: string; amountDueCents: number; paidCents: number }): LineItem | null {
  const unitCents = Math.max(0, input.amountDueCents - input.paidCents);
  if (unitCents <= 0) return null;
  const fee = input.paymentFrequency === "weekly" ? "weekly fee" : "term fee";
  const what = input.paidCents > 0 ? `${fee} (balance)` : fee;
  return { label: `${input.programName} ${what} — ${firstName(input.childName)}`.slice(0, 160), qty: 1, unitCents };
}

// ---- export for the accountant -----------------------------------------------------------

export type ExportRequest = ListedRequest & { sentVia: SentVia | null; voidedReason: string | null; createdByName: string };
export type ExportPayment = {
  receiptNumber: string | null;
  receivedAt: string;
  referenceCode: string;
  customerName: string;
  method: string;
  amountCents: number;
  transferReference: string | null;
  recordedBy: string | null;
  status: string;
  refundNote: string | null;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function buildRequestsCsv(rows: ExportRequest[]): string {
  const header = ["Reference", "Created", "Customer", "Email", "Phone", "For", "Total", "Paid", "Balance", "Status", "Due date", "Sent via", "Sent", "Void reason", "Created by"];
  const out = [header.map(csvCell).join(",")];
  for (const r of rows) {
    out.push([
      r.referenceCode,
      nassauDate(r.createdAt),
      r.customerName,
      r.customerEmail ?? "",
      r.customerPhone ?? "",
      r.lines.map((l) => (l.qty > 1 ? `${l.qty} x ${l.label} @ ${dollars(l.unitCents)}` : `${l.label} ${dollars(l.unitCents)}`)).join("; "),
      dollars(r.totalCents),
      dollars(r.paidCents),
      dollars(balanceCents(r)),
      statusLabel(r.status),
      r.dueDate,
      sentViaLabel(r.sentVia),
      r.sentAt ? nassauDate(r.sentAt) : "",
      r.voidedReason ?? "",
      r.createdByName,
    ].map(csvCell).join(","));
  }
  return `﻿${out.join("\r\n")}\r\n`;
}

export function buildPaymentsCsv(rows: ExportPayment[]): string {
  const header = ["Receipt", "Date received", "Request", "Customer", "Method", "Amount", "Transfer reference", "Recorded by", "Status", "Refund note"];
  const out = [header.map(csvCell).join(",")];
  for (const p of rows) {
    out.push([
      p.receiptNumber ?? "",
      nassauDate(p.receivedAt),
      p.referenceCode,
      p.customerName,
      methodLabel(p.method),
      dollars(p.amountCents),
      p.transferReference ?? "",
      p.recordedBy ?? "",
      p.status === "received" ? "Received" : p.status === "refunded" ? "Refunded" : "Voided",
      p.refundNote ?? "",
    ].map(csvCell).join(","));
  }
  return `﻿${out.join("\r\n")}\r\n`;
}

// ---- who may handle a business's payments --------------------------------------------------

// Owners and admins always; staff only with the payments permission;
// viewers never. PortPass platform owners come in through the platform door.
export function memberHandlesPayments(m: { role: string; canManagePayments: boolean }): boolean {
  return m.role === "org_owner" || m.role === "org_admin" || (m.role === "org_staff" && m.canManagePayments);
}

// ---- Admin -> Payments: volume by month and by business -----------------------------------------

export type VolumeRequest = { organizationId: number; sentAt: string | null; totalCents: number; paidCents: number; status: RequestStatus };
export type VolumePayment = { organizationId: number; receivedAt: string; amountCents: number; viaRequest: boolean };
export type VolumeRow = {
  month: string;
  organizationId: number;
  requestsSent: number;
  requestedCents: number;
  recordedPaidCents: number;
  outstandingCents: number;
  otherRecordedCents: number;
};

// Requests sent and the amount requested fall in the month they were sent;
// recorded payments in the month they were received; outstanding is what
// is still unpaid today on that month's requests. Recorded payments are
// what each business says it received: PortPass never touched the money.
export function paymentVolume(requests: VolumeRequest[], payments: VolumePayment[]): VolumeRow[] {
  const rows = new Map<string, VolumeRow>();
  const row = (month: string, organizationId: number) => {
    const key = `${month}|${organizationId}`;
    let r = rows.get(key);
    if (!r) {
      r = { month, organizationId, requestsSent: 0, requestedCents: 0, recordedPaidCents: 0, outstandingCents: 0, otherRecordedCents: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const q of requests) {
    if (!q.sentAt || q.status === "void" || q.status === "draft") continue;
    const r = row(nassauMonth(q.sentAt), q.organizationId);
    r.requestsSent += 1;
    r.requestedCents += q.totalCents;
    r.outstandingCents += balanceCents(q);
  }
  for (const p of payments) {
    const r = row(nassauMonth(p.receivedAt), p.organizationId);
    if (p.viaRequest) r.recordedPaidCents += p.amountCents;
    else r.otherRecordedCents += p.amountCents;
  }
  return [...rows.values()].sort((a, b) => b.month.localeCompare(a.month) || b.recordedPaidCents - a.recordedPaidCents || a.organizationId - b.organizationId);
}
