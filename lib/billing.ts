// PortPass billing (brief 09, parts 2 and 3): who should be paying
// PortPass, and when. The rules only, with no database in them, shared by
// the daily job, Admin -> Billing, the business's "Your plan" card, the
// invoice PDF and the tests.
//
// Three things never happen here or anywhere near it: a charge against a
// customer, a fee deducted from a customer's payment, or an automatic
// charge of any kind. PortPass invoices; the business pays by transfer.
//
// Money is always whole cents. Dates are calendar days (YYYY-MM-DD) on
// Nassau's calendar.

export const BILLING_CYCLES = ["monthly", "annual", "commission_monthly", "per_event", "not_agreed"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Monthly",
  annual: "Annual",
  commission_monthly: "Commission, monthly",
  per_event: "Per event",
  not_agreed: "Not agreed yet",
};

export const ACCOUNT_STATUSES = ["not_live", "trial", "active", "past_due", "paused", "ended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  not_live: "Not live yet",
  trial: "Free period",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  ended: "Ended",
};

export const INVOICE_STATUSES = ["draft", "sent", "part_paid", "paid", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { draft: "Draft", sent: "Sent", part_paid: "Part paid", paid: "Paid", overdue: "Overdue", void: "Void" };

export const LINE_SOURCES = ["plan", "setup", "retainer", "extra_location", "commission", "wedding_fee", "promote", "manual"] as const;
export type LineSource = (typeof LINE_SOURCES)[number];

export const LINE_SOURCE_LABEL: Record<LineSource, string> = { plan: "Plan", setup: "Setup", retainer: "Management", extra_location: "Extra locations", commission: "Commission", wedding_fee: "Wedding fees", promote: "Promote", manual: "Other" };

export const RECEIPT_METHODS = ["bank_transfer", "online_banking", "cash", "cheque", "other"] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];
export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = { bank_transfer: "Bank transfer", online_banking: "Online banking", cash: "Cash", cheque: "Cheque", other: "Other" };

export const FREE_DAYS = 30;
export const INVOICE_DUE_DAYS = 14;
// After this many days overdue the emails stop and a founder calls.
export const STOP_EMAILS_AFTER_DAYS = 14;

// ---- Calendar days ---------------------------------------------------------------

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const at = (day: string) => new Date(`${day}T12:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const date = at(day);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((at(to).getTime() - at(from).getTime()) / 86_400_000);
}

const lastDayOf = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();

// The same day of the month, `months` later. When that month is shorter,
// its last day: the 31st bills on 30 November, and on 28 February. Pass
// the day of the month to keep (`anchorDay`) so a run of months doesn't
// drift: 31 Jan -> 28 Feb -> 31 Mar, not 28 Mar.
export function addMonths(day: string, months: number, anchorDay?: number): string {
  const date = at(day);
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const wanted = anchorDay ?? date.getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(wanted, lastDayOf(year, month)), 12)));
}

export function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "5 November 2026".
export function longDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1] ?? ""} ${year}`;
}

// "1–31 October 2026", "15 October – 14 November 2026".
export function periodLabel(start: string, end: string): string {
  if (start === end) return longDay(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8))}–${longDay(end)}`;
  if (start.slice(0, 4) === end.slice(0, 4)) return `${Number(start.slice(8))} ${MONTHS[Number(start.slice(5, 7)) - 1]} – ${longDay(end)}`;
  return `${longDay(start)} – ${longDay(end)}`;
}

export function money(cents: number): string {
  const negative = cents < 0;
  const amount = Math.abs(cents);
  const text = new Intl.NumberFormat("en-US", { minimumFractionDigits: amount % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(amount / 100);
  return `${negative ? "-" : ""}$${text}`;
}

// Always two decimals, for an invoice.
export function moneyExact(cents: number): string {
  const negative = cents < 0;
  return `${negative ? "-" : ""}${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(cents) / 100)}`;
}

// ---- The account -----------------------------------------------------------------

export type BillingAccount = {
  organizationId: number;
  planCode: string | null;
  cycle: BillingCycle;
  // The price agreed at signing, a month. Changing the price list never
  // changes this.
  priceCents: number;
  // Annual plans charge this many months for the year (10: two free).
  annualMonthsCharged: number;
  retainerCents: number;
  extraLocations: number;
  extraLocationCents: number;
  commissionBps: number;
  goLiveOn: string | null;
  freeMonthsCredit: number;
  creditReason: string | null;
  freeUntilOverride: string | null;
  freeUntilOverrideReason: string | null;
  setupFeeCents: number;
  setupStatus: "due" | "paid" | "waived";
  agreementSignedOn: string | null;
  agreementVersion: string | null;
  billingEmail: string | null;
  billingWhatsappE164: string | null;
  // Billing starts again no earlier than this day. Set when an account is
  // un-paused (the paused months are not billed afterwards) and when free
  // months are given after billing has started. Never typed in.
  billingResumesOn: string | null;
  // Set by a founder, with a reason: nothing here pauses or ends an
  // account by itself.
  paused: boolean;
  ended: boolean;
  notes: string | null;
};

// free until = go-live + 30 days + any free months given, unless a founder
// set another date (with a reason).
export function freeUntil(account: Pick<BillingAccount, "goLiveOn" | "freeMonthsCredit" | "freeUntilOverride">): string | null {
  if (account.freeUntilOverride) return account.freeUntilOverride;
  if (!account.goLiveOn) return null;
  return addMonths(addDays(account.goLiveOn, FREE_DAYS), Math.max(0, account.freeMonthsCredit));
}

// A subscription is billed in advance: the first invoice is dated the day
// after the free period ends.
export function firstInvoiceOn(account: Pick<BillingAccount, "goLiveOn" | "freeMonthsCredit" | "freeUntilOverride">): string | null {
  const free = freeUntil(account);
  return free ? addDays(free, 1) : null;
}

export const isSubscription = (cycle: BillingCycle): cycle is "monthly" | "annual" => cycle === "monthly" || cycle === "annual";

// One billing period of a subscription: the invoice date and the days it
// pays for. `index` 0 is the first invoice.
export function subscriptionPeriod(first: string, cycle: "monthly" | "annual", index: number): { start: string; end: string } {
  const step = cycle === "annual" ? 12 : 1;
  const anchor = Number(first.slice(8));
  const start = addMonths(first, step * index, anchor);
  return { start, end: addDays(addMonths(first, step * (index + 1), anchor), -1) };
}

// The periods a business has already been invoiced for: its subscription
// invoices that are not void. The schedule runs on from the last of them,
// so changing the account later (its price, its cycle, a credit) never
// re-bills a period or leaves a gap. A void invoice is a cancelled piece
// of paper, not a waived period: its period is billable again.
export type RaisedPeriod = { periodStart: string; periodEnd: string };

type Scheduled = Pick<BillingAccount, "goLiveOn" | "freeMonthsCredit" | "freeUntilOverride" | "billingResumesOn">;

// The day the next subscription period starts: the day after the last
// period invoiced, or the first invoice date when nothing has been; and
// never before the day billing resumes. It can be today or earlier, which
// means an invoice is due to be drafted now.
export function nextPeriodStartOn(account: Scheduled, raised: RaisedPeriod[]): string | null {
  const latestEnd = raised.reduce<string | null>((latest, period) => (!latest || period.periodEnd > latest ? period.periodEnd : latest), null);
  const natural = latestEnd ? addDays(latestEnd, 1) : firstInvoiceOn(account);
  if (!natural) return null;
  return account.billingResumesOn && account.billingResumesOn > natural ? account.billingResumesOn : natural;
}

// The day of the month the schedule keeps (so the 31st stays the 31st
// after a February). When `start` is not on that day, because billing
// resumed or the cycle changed mid-month, the schedule keeps start's own.
function scheduleDay(account: Scheduled, start: string): number {
  const own = Number(start.slice(8));
  const from = account.billingResumesOn && account.billingResumesOn <= start ? account.billingResumesOn : firstInvoiceOn(account);
  if (!from) return own;
  const kept = Number(from.slice(8));
  const [year, month] = start.split("-").map(Number);
  return own === Math.min(kept, lastDayOf(year, month - 1)) ? kept : own;
}

// Every period to draft now: from the next period start up to and
// including `today`, one after another. An account that went unbilled for
// a while owes each period, not one.
export function periodsToDraft(account: Scheduled & Pick<BillingAccount, "cycle">, raised: RaisedPeriod[], today: string, max = 36): Array<{ start: string; end: string }> {
  if (!isSubscription(account.cycle)) return [];
  let start = nextPeriodStartOn(account, raised);
  if (!start) return [];
  const step = account.cycle === "annual" ? 12 : 1;
  const keep = scheduleDay(account, start);
  const periods: Array<{ start: string; end: string }> = [];
  while (start <= today && periods.length < max) {
    const next = addMonths(start, step, keep);
    periods.push({ start, end: addDays(next, -1) });
    start = next;
  }
  return periods;
}

// Whether a period is the length the cycle bills: about a month, or a
// year. A period drafted under one cycle is never billed at the other's
// price.
export function periodFitsCycle(cycle: BillingCycle, start: string, end: string): boolean {
  const days = daysBetween(start, end) + 1;
  if (cycle === "annual") return days >= 365 && days <= 366;
  if (cycle === "monthly") return days >= 28 && days <= 31;
  return false;
}

// When the next invoice goes out. A subscription: the start of the next
// period not yet invoiced (today or earlier means it is due now). Fees per
// booking or wedding: the 1st of next month, for the month just ended.
// Nothing for an account with no agreed plan, or one paused or ended.
export function nextInvoiceOn(account: BillingAccount, today: string, raised: RaisedPeriod[] = []): string | null {
  if (account.ended || account.paused) return null;
  if (isSubscription(account.cycle)) return nextPeriodStartOn(account, raised);
  if (account.cycle === "commission_monthly" || account.cycle === "per_event") return addMonths(firstOfMonth(today), 1);
  return null;
}

// What a subscription invoice charges for one period.
export type DraftLine = { description: string; qty: number; unitCents: number; amountCents: number; source: LineSource; billingEventId?: number | null };

export function annualPriceCents(account: Pick<BillingAccount, "priceCents" | "annualMonthsCharged">): number {
  return account.priceCents * account.annualMonthsCharged;
}

// Setup is waived on annual, whatever the account says.
export function setupDueCents(account: Pick<BillingAccount, "cycle" | "setupFeeCents" | "setupStatus">): number {
  return account.cycle === "annual" || account.setupStatus !== "due" ? 0 : account.setupFeeCents;
}

export function subscriptionLines(account: BillingAccount, planName: string, period: { start: string; end: string }, options: { firstInvoice: boolean }): DraftLine[] {
  const lines: DraftLine[] = [];
  const annual = account.cycle === "annual";
  const months = annual ? 12 : 1;
  const plan = annual ? annualPriceCents(account) : account.priceCents;
  if (plan > 0) lines.push({ description: `${planName} plan, ${annual ? `annual (${account.annualMonthsCharged} months charged for 12)` : "monthly"}: ${periodLabel(period.start, period.end)}`, qty: 1, unitCents: plan, amountCents: plan, source: "plan" });
  if (account.retainerCents > 0) lines.push({ description: `Management retainer, ${months === 12 ? "12 months" : "1 month"}`, qty: months, unitCents: account.retainerCents, amountCents: account.retainerCents * months, source: "retainer" });
  if (account.extraLocations > 0 && account.extraLocationCents > 0) {
    const qty = account.extraLocations * months;
    lines.push({ description: `Extra location${account.extraLocations === 1 ? "" : "s"} (${account.extraLocations}), ${months === 12 ? "12 months" : "1 month"}`, qty, unitCents: account.extraLocationCents, amountCents: account.extraLocationCents * qty, source: "extra_location" });
  }
  const setup = options.firstInvoice ? setupDueCents(account) : 0;
  if (setup > 0) lines.push({ description: "Setup and migration, one time", qty: 1, unitCents: setup, amountCents: setup, source: "setup" });
  return lines;
}

// ---- Fees earned per booking or wedding --------------------------------------------

export const EVENT_KINDS = ["wedding_coordination", "supplier_commission", "marketplace_commission", "grow_with_us_commission"] as const;
export type BillingEventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABEL: Record<BillingEventKind, string> = {
  wedding_coordination: "Wedding coordination fee",
  supplier_commission: "Supplier commission",
  marketplace_commission: "Marketplace commission",
  grow_with_us_commission: "Grow With Us commission",
};

export type BillingEvent = { id: number; organizationId: number; kind: BillingEventKind; eventOn: string; bookingValueCents: number; rateBps: number; flatCents: number; feeCents: number; invoiceLineId: number | null; note: string | null };

export function feeCents(input: { bookingValueCents: number; rateBps: number; flatCents: number }): number {
  return Math.round((input.bookingValueCents * input.rateBps) / 10_000) + input.flatCents;
}

// The events a commission invoice dated `invoiceOn` (the 1st) picks up:
// not yet on an invoice, dated before the invoice, and after the free
// period. An event inside the free period is never charged.
//
// `raised`: the plan periods the business has been invoiced for. The free
// period was over by the day its first plan period started, whatever free
// months were given afterwards: those move the next plan invoice, and
// never reach back to make a fee from a month already billed free.
export function eventsToInvoice(events: BillingEvent[], account: BillingAccount, invoiceOn: string, raised: RaisedPeriod[] = []): BillingEvent[] {
  const stated = freeUntil(account);
  const firstBilled = raised.reduce<string | null>((first, period) => (!first || period.periodStart < first ? period.periodStart : first), null);
  const beforeBilling = firstBilled ? addDays(firstBilled, -1) : null;
  const free = beforeBilling && (!stated || beforeBilling < stated) ? beforeBilling : stated;
  return events.filter((event) => event.invoiceLineId === null && event.eventOn < invoiceOn && (!free || event.eventOn > free) && event.feeCents !== 0);
}

export function eventLine(event: BillingEvent): DraftLine {
  const source: LineSource = event.kind === "wedding_coordination" ? "wedding_fee" : "commission";
  const what = event.note ? `${EVENT_KIND_LABEL[event.kind]}: ${event.note}` : EVENT_KIND_LABEL[event.kind];
  const how = event.rateBps > 0 ? ` (${event.rateBps / 100}% of ${money(event.bookingValueCents)}, ${longDay(event.eventOn)})` : ` (${longDay(event.eventOn)})`;
  return { description: `${what}${how}`, qty: 1, unitCents: event.feeCents, amountCents: event.feeCents, source, billingEventId: event.id };
}

// ---- Invoices --------------------------------------------------------------------

export type Invoice = {
  id: number;
  number: string;
  organizationId: number;
  kind: "subscription" | "commission" | "manual" | "historical";
  periodStart: string;
  periodEnd: string;
  issuedOn: string;
  dueOn: string;
  status: InvoiceStatus;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  paidCents: number;
  sentAt: string | null;
  sentVia: string | null;
  voidReason: string | null;
};

export function invoiceNumber(year: number, sequence: number): string {
  return `PP-${year}-${String(sequence).padStart(3, "0")}`;
}

export function invoiceTotals(lines: Array<Pick<DraftLine, "amountCents">>): { subtotalCents: number; vatCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  // PortPass is not VAT-registered: VAT is 0 until that changes.
  return { subtotalCents, vatCents: 0, totalCents: subtotalCents };
}

// What an invoice's status should read today, from what has been received.
// Draft and void are set by a person and never change here.
export function invoiceStatus(invoice: Pick<Invoice, "status" | "totalCents" | "paidCents" | "dueOn">, today: string): InvoiceStatus {
  if (invoice.status === "draft" || invoice.status === "void") return invoice.status;
  if (invoice.paidCents >= invoice.totalCents) return "paid";
  if (today > invoice.dueOn) return "overdue";
  return invoice.paidCents > 0 ? "part_paid" : "sent";
}

export const owedCents = (invoice: Pick<Invoice, "status" | "totalCents" | "paidCents">): number => (invoice.status === "draft" || invoice.status === "void" ? 0 : Math.max(0, invoice.totalCents - invoice.paidCents));

export function daysOverdue(invoice: Pick<Invoice, "status" | "dueOn" | "totalCents" | "paidCents">, today: string): number {
  if (invoice.status === "draft" || invoice.status === "void" || invoice.paidCents >= invoice.totalCents) return 0;
  return Math.max(0, daysBetween(invoice.dueOn, today));
}

// Where the account stands. Paused and ended are a founder's decision;
// the rest follows from the dates and from what is unpaid.
// `billingStarted`: the business has been invoiced for a plan period. From
// then on it is never "free period" again, whatever credit it is given.
export function accountStatus(account: BillingAccount, invoices: Array<Pick<Invoice, "status" | "dueOn" | "totalCents" | "paidCents">>, today: string, billingStarted = false): AccountStatus {
  if (account.ended) return "ended";
  if (account.paused) return "paused";
  if (!billingStarted && (account.goLiveOn ? account.goLiveOn > today && !account.freeUntilOverride : !account.freeUntilOverride)) return "not_live";
  if (invoices.some((invoice) => daysOverdue(invoice, today) > 0)) return "past_due";
  if (billingStarted) return "active";
  const free = freeUntil(account);
  return free && today <= free ? "trial" : "active";
}

// What a business may see of its own invoices: never a draft (PortPass's
// working copy), and never a draft that was voided before it was sent. An
// old invoice recorded with its own number was sent long ago, so it shows.
export const shownToBusiness = (invoice: Pick<Invoice, "status" | "sentAt" | "kind">): boolean => invoice.status !== "draft" && !(invoice.status === "void" && !invoice.sentAt && invoice.kind !== "historical");

// ---- Reminders -------------------------------------------------------------------

export type Reminder =
  | { kind: "trial_ends_7" | "trial_ends_1"; key: string; freeUntil: string }
  | { kind: "invoice_due_3" | "invoice_overdue_1" | "invoice_overdue_7"; key: string; invoiceId: number };

// The emails owed today. Each has a key that is recorded when it is sent,
// so the job can run twice and send once. A reminder is for one exact
// day: a job that did not run that day does not send it late.
export function remindersDue(account: BillingAccount, invoices: Invoice[], today: string, billingStarted = false): Reminder[] {
  const reminders: Reminder[] = [];
  if (account.ended || account.paused) return reminders;
  const free = freeUntil(account);
  // The message names the plan and its price, so it needs both agreed. A
  // business already being invoiced is never told its free period is
  // ending: a credit given later moves its next invoice, nothing more.
  if (free && !billingStarted && isSubscription(account.cycle) && account.priceCents > 0) {
    if (addDays(free, -7) === today) reminders.push({ kind: "trial_ends_7", key: `trial_ends_7:${account.organizationId}:${free}`, freeUntil: free });
    if (addDays(free, -1) === today) reminders.push({ kind: "trial_ends_1", key: `trial_ends_1:${account.organizationId}:${free}`, freeUntil: free });
  }
  for (const invoice of invoices) {
    if (invoice.status === "draft" || invoice.status === "void" || invoice.paidCents >= invoice.totalCents) continue;
    // Something billed before this system was never sent from here, so it
    // is never chased from here either.
    if (invoice.kind === "historical") continue;
    const overdue = daysBetween(invoice.dueOn, today);
    // From 14 days overdue the emails stop: a founder calls instead.
    if (overdue >= STOP_EMAILS_AFTER_DAYS) continue;
    if (overdue === -3) reminders.push({ kind: "invoice_due_3", key: `invoice_due_3:${invoice.id}`, invoiceId: invoice.id });
    if (overdue === 1) reminders.push({ kind: "invoice_overdue_1", key: `invoice_overdue_1:${invoice.id}`, invoiceId: invoice.id });
    if (overdue === 7) reminders.push({ kind: "invoice_overdue_7", key: `invoice_overdue_7:${invoice.id}`, invoiceId: invoice.id });
  }
  return reminders;
}

export const needsFounderCall = (invoice: Pick<Invoice, "status" | "dueOn" | "totalCents" | "paidCents">, today: string): boolean => daysOverdue(invoice, today) >= STOP_EMAILS_AFTER_DAYS;

// ---- Revenue ---------------------------------------------------------------------

// What an account is worth a month: its plan (an annual plan spread over
// twelve), the retainer and extra locations. Commission and per-event
// fees are not recurring and are not in it.
export function monthlyRecurringCents(account: BillingAccount): number {
  if (!isSubscription(account.cycle)) return 0;
  const plan = account.cycle === "annual" ? Math.round(annualPriceCents(account) / 12) : account.priceCents;
  return plan + account.retainerCents + account.extraLocations * account.extraLocationCents;
}

export type RosterRow = { account: BillingAccount; status: AccountStatus; freeUntil: string | null; nextInvoiceOn: string | null; owesCents: number; overdueCents: number };

export function revenueSummary(rows: RosterRow[]): { recurringNowCents: number; recurringAfterTrialsCents: number; owedCents: number; overdueCents: number } {
  let recurringNowCents = 0;
  let recurringAfterTrialsCents = 0;
  let owed = 0;
  let overdue = 0;
  for (const row of rows) {
    const monthly = monthlyRecurringCents(row.account);
    if (row.status === "active" || row.status === "past_due") recurringNowCents += monthly;
    if (row.status === "active" || row.status === "past_due" || row.status === "trial") recurringAfterTrialsCents += monthly;
    owed += row.owesCents;
    overdue += row.overdueCents;
  }
  return { recurringNowCents, recurringAfterTrialsCents, owedCents: owed, overdueCents: overdue };
}

// "2 invoices ready to send · 1 overdue ($120) · 1 free trial ends this week".
export function morningSummary(input: { drafts: number; overdue: number; overdueCents: number; trialsEndingThisWeek: number; founderCalls: number }): string {
  const parts: string[] = [];
  if (input.drafts) parts.push(`${input.drafts} invoice${input.drafts === 1 ? "" : "s"} ready to send`);
  if (input.overdue) parts.push(`${input.overdue} overdue (${money(input.overdueCents)})`);
  if (input.founderCalls) parts.push(`${input.founderCalls} founder call${input.founderCalls === 1 ? "" : "s"} needed`);
  if (input.trialsEndingThisWeek) parts.push(`${input.trialsEndingThisWeek} free period${input.trialsEndingThisWeek === 1 ? "" : "s"} end${input.trialsEndingThisWeek === 1 ? "s" : ""} this week`);
  return parts.join(" · ") || "Nothing to do";
}

// ---- Bank details (how a business pays PortPass) -------------------------------------

export type BankDetails = { bank: string; accountName: string; accountNumber: string; branch: string };

export const EMPTY_BANK: BankDetails = { bank: "", accountName: "", accountNumber: "", branch: "" };

export function cleanBankDetails(input: unknown): BankDetails {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const clip = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
  return { bank: clip(raw.bank, 80), accountName: clip(raw.accountName, 120), accountNumber: clip(raw.accountNumber, 40), branch: clip(raw.branch, 80) };
}

// An invoice can't be sent until all four are filled in.
export const bankDetailsComplete = (bank: BankDetails): boolean => Boolean(bank.bank && bank.accountName && bank.accountNumber && bank.branch);

export function howToPay(bank: BankDetails): string {
  return bankDetailsComplete(bank) ? `Bank transfer to: ${bank.bank} · ${bank.accountName} · Account ${bank.accountNumber} · ${bank.branch}` : "[bank details: add in Settings]";
}
