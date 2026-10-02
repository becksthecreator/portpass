import {
  accountStatus,
  addDays,
  addMonths,
  bankDetailsComplete,
  cleanBankDetails,
  daysBetween,
  eventLine,
  eventsToInvoice,
  feeCents,
  firstInvoiceOn,
  firstOfMonth,
  freeUntil,
  INVOICE_DUE_DAYS,
  invoiceStatus,
  isSubscription,
  morningSummary,
  needsFounderCall,
  nextInvoiceOn,
  owedCents,
  periodsDue,
  remindersDue,
  revenueSummary,
  subscriptionLines,
  type AccountStatus,
  type BankDetails,
  type BillingAccount,
  type BillingCycle,
  type BillingEvent,
  type BillingEventKind,
  type DraftLine,
  type Invoice,
  type InvoiceStatus,
  type LineSource,
  type ReceiptMethod,
  type Reminder,
  type RosterRow,
} from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// PortPass billing (brief 09, parts 2 and 3). Every caller is behind
// requireAdmin / requireAdminApi, the cron secret, or (for one business's
// own plan and invoices) requireOrgRole at owner or admin. Every insert,
// update and void is written to the audit log with before and after.
//
// Nothing here charges anyone, touches a customer's payment, or sends an
// invoice by itself: the daily job drafts, a founder sends.

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const day = (value: unknown): string | null => (typeof value === "string" && value ? value.slice(0, 10) : null);

// ---- Accounts ----------------------------------------------------------------------

export type StoredAccount = BillingAccount & { id: number; organizationName: string; organizationSlug: string | null; status: AccountStatus; freeUntil: string | null; firstInvoiceOn: string | null; nextInvoiceOn: string | null; statusReason: string | null };

const ACCOUNT_COLUMNS =
  "id,organization_id,plan_code,cycle,price_cents,annual_months_charged,retainer_cents,extra_locations,extra_location_cents,commission_bps,go_live_on,free_months_credit,credit_reason,free_until_override,free_until_override_reason,free_until,first_invoice_on,next_invoice_on,status,setup_fee_cents,setup_status,agreement_signed_on,agreement_version,billing_email,billing_whatsapp_e164,paused,ended,status_reason,notes,organizations(name,slug)";

function toAccount(row: Row): StoredAccount {
  const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null } | null;
  return {
    id: Number(row.id), organizationId: Number(row.organization_id), organizationName: org?.name ?? "", organizationSlug: org?.slug ?? null,
    planCode: text(row.plan_code), cycle: row.cycle as BillingCycle, priceCents: Number(row.price_cents), annualMonthsCharged: Number(row.annual_months_charged),
    retainerCents: Number(row.retainer_cents), extraLocations: Number(row.extra_locations), extraLocationCents: Number(row.extra_location_cents), commissionBps: Number(row.commission_bps),
    goLiveOn: day(row.go_live_on), freeMonthsCredit: Number(row.free_months_credit), creditReason: text(row.credit_reason), freeUntilOverride: day(row.free_until_override), freeUntilOverrideReason: text(row.free_until_override_reason),
    setupFeeCents: Number(row.setup_fee_cents), setupStatus: row.setup_status as BillingAccount["setupStatus"], agreementSignedOn: day(row.agreement_signed_on), agreementVersion: text(row.agreement_version),
    billingEmail: text(row.billing_email), billingWhatsappE164: text(row.billing_whatsapp_e164), paused: Boolean(row.paused), ended: Boolean(row.ended), notes: text(row.notes),
    status: row.status as AccountStatus, freeUntil: day(row.free_until), firstInvoiceOn: day(row.first_invoice_on), nextInvoiceOn: day(row.next_invoice_on), statusReason: text(row.status_reason),
  };
}

export async function listAccounts(): Promise<StoredAccount[]> {
  const { data, error } = await getSupabaseAdmin().from("billing_accounts").select(ACCOUNT_COLUMNS).order("id", { ascending: true }).limit(1000);
  throwIfSupabaseError(error, "Could not load billing accounts");
  return (data ?? []).map((row) => toAccount(row as unknown as Row));
}

export async function getAccount(organizationId: number): Promise<StoredAccount | null> {
  const { data, error } = await getSupabaseAdmin().from("billing_accounts").select(ACCOUNT_COLUMNS).eq("organization_id", organizationId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the billing account");
  return data ? toAccount(data as unknown as Row) : null;
}

export type AccountInput = Omit<BillingAccount, "organizationId"> & { statusReason: string | null };

// The stored dates and status follow from the account and its invoices.
async function derived(account: BillingAccount, today: string): Promise<{ free_until: string | null; first_invoice_on: string | null; next_invoice_on: string | null; status: AccountStatus }> {
  const invoices = await listInvoices({ organizationId: account.organizationId });
  const raised = invoices.filter((invoice) => invoice.kind === "subscription").map((invoice) => invoice.periodStart);
  return { free_until: freeUntil(account), first_invoice_on: isSubscription(account.cycle) ? firstInvoiceOn(account) : null, next_invoice_on: nextInvoiceOn(account, today, raised), status: accountStatus(account, invoices, today) };
}

const accountRow = (input: AccountInput) => ({
  plan_code: input.planCode, cycle: input.cycle, price_cents: input.priceCents, annual_months_charged: input.annualMonthsCharged, retainer_cents: input.retainerCents,
  extra_locations: input.extraLocations, extra_location_cents: input.extraLocationCents, commission_bps: input.commissionBps, go_live_on: input.goLiveOn,
  free_months_credit: input.freeMonthsCredit, credit_reason: input.creditReason, free_until_override: input.freeUntilOverride, free_until_override_reason: input.freeUntilOverrideReason,
  setup_fee_cents: input.setupFeeCents, setup_status: input.setupStatus, agreement_signed_on: input.agreementSignedOn, agreement_version: input.agreementVersion,
  billing_email: input.billingEmail, billing_whatsapp_e164: input.billingWhatsappE164, paused: input.paused, ended: input.ended, status_reason: input.statusReason, notes: input.notes,
});

// Create or change a business's account. A free-month credit, a founder's
// own free-until date, and pausing or ending all need their reason.
export async function saveAccount(organizationId: number, input: AccountInput, actorUserId: string | null, today: string = nassauToday()): Promise<StoredAccount> {
  if (input.freeMonthsCredit > 0 && !input.creditReason) throw new Error("CREDIT_REASON_REQUIRED");
  if (input.freeUntilOverride && !input.freeUntilOverrideReason) throw new Error("OVERRIDE_REASON_REQUIRED");
  if ((input.paused || input.ended) && !input.statusReason) throw new Error("STATUS_REASON_REQUIRED");
  const db = getSupabaseAdmin();
  const before = await getAccount(organizationId);
  const account: BillingAccount = { ...input, organizationId };
  const row = { organization_id: organizationId, ...accountRow(input), ...(await derived(account, today)), updated_at: new Date().toISOString() };
  const { error } = await db.from("billing_accounts").upsert(row, { onConflict: "organization_id" });
  if (error && (error as { code?: string }).code === "23503") throw new Error("NOT_FOUND");
  throwIfSupabaseError(error, "Could not save the billing account");
  await logAudit({ actorUserId, organizationId, action: before ? "billing.account.updated" : "billing.account.created", targetTable: "billing_accounts", targetId: organizationId, before: before ? accountRow({ ...before, statusReason: before.statusReason }) : null, after: accountRow(input) });
  const saved = await getAccount(organizationId);
  if (!saved) throw new Error("NOT_FOUND");
  return saved;
}

// ---- Invoices ----------------------------------------------------------------------

export type StoredInvoice = Invoice & { organizationName: string; organizationSlug: string | null; createdAt: string };
export type InvoiceLine = { id: number; description: string; qty: number; unitCents: number; amountCents: number; source: LineSource; billingEventId: number | null };
export type Receipt = { id: number; invoiceId: number; organizationId: number; amountCents: number; method: ReceiptMethod; reference: string | null; receivedOn: string; note: string | null; createdAt: string };
export type InvoiceDetail = StoredInvoice & { lines: InvoiceLine[]; receipts: Receipt[] };

const INVOICE_COLUMNS = "id,number,organization_id,kind,period_start,period_end,issued_on,due_on,status,subtotal_cents,vat_cents,total_cents,paid_cents,sent_at,sent_via,void_reason,created_at,organizations(name,slug)";

function toInvoice(row: Row): StoredInvoice {
  const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null } | null;
  return {
    id: Number(row.id), number: String(row.number), organizationId: Number(row.organization_id), organizationName: org?.name ?? "", organizationSlug: org?.slug ?? null, kind: row.kind as Invoice["kind"],
    periodStart: String(row.period_start), periodEnd: String(row.period_end), issuedOn: String(row.issued_on), dueOn: String(row.due_on), status: row.status as InvoiceStatus,
    subtotalCents: Number(row.subtotal_cents), vatCents: Number(row.vat_cents), totalCents: Number(row.total_cents), paidCents: Number(row.paid_cents),
    sentAt: (row.sent_at as string | null) ?? null, sentVia: text(row.sent_via), voidReason: text(row.void_reason), createdAt: String(row.created_at),
  };
}

const toReceipt = (row: Row): Receipt => ({ id: Number(row.id), invoiceId: Number(row.invoice_id), organizationId: Number(row.organization_id), amountCents: Number(row.amount_cents), method: row.method as ReceiptMethod, reference: text(row.reference), receivedOn: String(row.received_on), note: text(row.note), createdAt: String(row.created_at) });

export async function listInvoices(filter: { organizationId?: number | null; statuses?: InvoiceStatus[] } = {}): Promise<StoredInvoice[]> {
  const rows: Row[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    let query = getSupabaseAdmin().from("portpass_invoices").select(INVOICE_COLUMNS).order("issued_on", { ascending: false }).order("id", { ascending: false });
    if (filter.organizationId) query = query.eq("organization_id", filter.organizationId);
    if (filter.statuses?.length) query = query.in("status", filter.statuses);
    const { data, error } = await query.range(from, from + 999);
    throwIfSupabaseError(error, "Could not load invoices");
    rows.push(...((data ?? []) as unknown as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows.map(toInvoice);
}

export async function getInvoice(id: number): Promise<InvoiceDetail | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("portpass_invoices").select(INVOICE_COLUMNS).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load the invoice");
  if (!data) return null;
  const [{ data: lines, error: lineError }, { data: receipts, error: receiptError }] = await Promise.all([
    db.from("portpass_invoice_lines").select("id,description,qty,unit_cents,amount_cents,source,billing_event_id").eq("invoice_id", id).order("sort", { ascending: true }).order("id", { ascending: true }),
    db.from("portpass_receipts").select("id,invoice_id,organization_id,amount_cents,method,reference,received_on,note,created_at").eq("invoice_id", id).order("received_on", { ascending: true }).order("id", { ascending: true }),
  ]);
  throwIfSupabaseError(lineError, "Could not load the invoice's lines");
  throwIfSupabaseError(receiptError, "Could not load the invoice's receipts");
  return {
    ...toInvoice(data as unknown as Row),
    lines: (lines ?? []).map((line) => ({ id: Number(line.id), description: String(line.description), qty: Number(line.qty), unitCents: Number(line.unit_cents), amountCents: Number(line.amount_cents), source: line.source as LineSource, billingEventId: line.billing_event_id === null ? null : Number(line.billing_event_id) })),
    receipts: (receipts ?? []).map((receipt) => toReceipt(receipt as Row)),
  };
}

const lineJson = (lines: DraftLine[]) => lines.map((line) => ({ description: line.description, qty: line.qty, unit_cents: line.unitCents, amount_cents: line.amountCents, source: line.source, billing_event_id: line.billingEventId ?? null }));

type NewInvoice = { organizationId: number; kind: Invoice["kind"]; periodStart: string; periodEnd: string; issuedOn: string; lines: DraftLine[]; createdBy: string | null; number?: string | null; status?: InvoiceStatus };

// Raises one invoice (the database gives it its number). Null when that
// business already has an invoice for that period, or the number is taken.
async function raiseInvoice(input: NewInvoice): Promise<number | null> {
  const { data, error } = await getSupabaseAdmin().rpc("create_portpass_invoice", {
    p_organization_id: input.organizationId, p_kind: input.kind, p_period_start: input.periodStart, p_period_end: input.periodEnd, p_issued_on: input.issuedOn,
    p_due_on: addDays(input.issuedOn, INVOICE_DUE_DAYS), p_lines: lineJson(input.lines), p_created_by: input.createdBy, p_number: input.number ?? null, p_status: input.status ?? "draft",
  });
  throwIfSupabaseError(error, "Could not raise the invoice");
  const id = data === null || data === undefined ? null : Number(data);
  if (id) await logAudit({ actorUserId: input.createdBy, organizationId: input.organizationId, action: "billing.invoice.drafted", targetTable: "portpass_invoices", targetId: id, after: { kind: input.kind, period_start: input.periodStart, period_end: input.periodEnd, total_cents: input.lines.reduce((sum, line) => sum + line.amountCents, 0) } });
  return id;
}

// A founder's own invoice: any lines, and (for something billed before
// this system, such as a build fee) its own number.
export async function createManualInvoice(input: { organizationId: number; periodStart: string; periodEnd: string; issuedOn: string; lines: Array<{ description: string; amountCents: number; source?: LineSource }>; historicalNumber?: string | null }, actorUserId: string): Promise<InvoiceDetail> {
  const lines: DraftLine[] = input.lines.map((line) => ({ description: line.description.trim().slice(0, 300), qty: 1, unitCents: line.amountCents, amountCents: line.amountCents, source: line.source ?? "manual" }));
  if (!lines.length || lines.some((line) => !line.description || !Number.isInteger(line.amountCents))) throw new Error("LINES_REQUIRED");
  const number = input.historicalNumber?.trim().toUpperCase() || null;
  if (number !== null && (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(number) || /^PP-/.test(number))) throw new Error("BAD_NUMBER");
  // A historical invoice was sent long ago: it starts as sent, not draft.
  const id = await raiseInvoice({ organizationId: input.organizationId, kind: number ? "historical" : "manual", periodStart: input.periodStart, periodEnd: input.periodEnd, issuedOn: input.issuedOn, lines, createdBy: actorUserId, number, status: number ? "sent" : "draft" });
  if (!id) throw new Error("NUMBER_TAKEN");
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error("NOT_FOUND");
  return invoice;
}

// ---- Bank details: how a business pays PortPass ----------------------------------------

export async function getBankDetails(): Promise<BankDetails> {
  const { data, error } = await getSupabaseAdmin().from("site_content").select("value").eq("key", "billing_bank").maybeSingle();
  throwIfSupabaseError(error, "Could not load the bank details");
  return cleanBankDetails(data?.value);
}

export async function saveBankDetails(input: unknown, actorUserId: string): Promise<BankDetails> {
  const bank = cleanBankDetails(input);
  const before = await getBankDetails();
  const { error } = await getSupabaseAdmin().from("site_content").upsert({ key: "billing_bank", value: bank, updated_by: actorUserId, updated_at: new Date().toISOString() }, { onConflict: "key" });
  throwIfSupabaseError(error, "Could not save the bank details");
  await logAudit({ actorUserId, action: "billing.bank_details.updated", targetTable: "site_content", targetId: "billing_bank", before, after: bank });
  return bank;
}

// ---- Sending, receipts, voiding -------------------------------------------------------

// A founder reviewed the draft and pressed Send. The invoice is dated
// today and due in 14 days. Refused while PortPass's bank details are
// missing: an invoice nobody can pay must not go out.
export async function markInvoiceSent(id: number, via: "email" | "whatsapp" | "in_person", actorUserId: string, today: string = nassauToday()): Promise<InvoiceDetail> {
  if (!bankDetailsComplete(await getBankDetails())) throw new Error("BANK_DETAILS_MISSING");
  const current = await getInvoice(id);
  if (!current) throw new Error("NOT_FOUND");
  if (current.status === "void") throw new Error("VOID");
  const db = getSupabaseAdmin();
  if (current.status === "draft") {
    const { data, error } = await db.from("portpass_invoices").update({ status: "sent", issued_on: today, due_on: addDays(today, INVOICE_DUE_DAYS), sent_at: new Date().toISOString(), sent_via: via, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").select("id").maybeSingle();
    throwIfSupabaseError(error, "Could not mark the invoice sent");
    if (!data) throw new Error("NOT_DRAFT");
  } else {
    // Sent again, another way: only how it was last sent changes.
    const { error } = await db.from("portpass_invoices").update({ sent_at: new Date().toISOString(), sent_via: via, updated_at: new Date().toISOString() }).eq("id", id);
    throwIfSupabaseError(error, "Could not mark the invoice sent");
  }
  await logAudit({ actorUserId, organizationId: current.organizationId, action: "billing.invoice.sent", targetTable: "portpass_invoices", targetId: id, before: { status: current.status }, after: { status: current.status === "draft" ? "sent" : current.status, via } });
  await refreshAccount(current.organizationId, today);
  return (await getInvoice(id))!;
}

export async function recordReceipt(invoiceId: number, input: { amountCents: number; method: ReceiptMethod; reference: string | null; receivedOn: string; note: string | null }, actorUserId: string, today: string = nassauToday()): Promise<InvoiceDetail> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("BAD_AMOUNT");
  const before = await getInvoice(invoiceId);
  if (!before) throw new Error("NOT_FOUND");
  const { data, error } = await getSupabaseAdmin().rpc("record_portpass_receipt", { p_invoice_id: invoiceId, p_amount_cents: input.amountCents, p_method: input.method, p_reference: input.reference, p_received_on: input.receivedOn, p_recorded_by: actorUserId, p_note: input.note });
  if (error?.message?.includes("NOT_PAYABLE")) throw new Error("NOT_PAYABLE");
  if (error?.message?.includes("NOT_FOUND")) throw new Error("NOT_FOUND");
  throwIfSupabaseError(error, "Could not record the receipt");
  const after = (await getInvoice(invoiceId))!;
  await logAudit({ actorUserId, organizationId: before.organizationId, action: "billing.receipt.recorded", targetTable: "portpass_receipts", targetId: Number(data), before: { status: before.status, paid_cents: before.paidCents }, after: { status: after.status, paid_cents: after.paidCents, amount_cents: input.amountCents, method: input.method, received_on: input.receivedOn } });
  await refreshAccount(before.organizationId, today);
  return after;
}

// Void: the number stays used. An invoice with money against it can't be
// voided. Its fees go back to "to invoice" and are picked up next time.
export async function voidInvoice(id: number, reason: string, actorUserId: string, today: string = nassauToday()): Promise<InvoiceDetail> {
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!why) throw new Error("REASON_REQUIRED");
  const current = await getInvoice(id);
  if (!current) throw new Error("NOT_FOUND");
  if (current.status === "void") throw new Error("VOID");
  if (current.paidCents > 0) throw new Error("HAS_RECEIPTS");
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("portpass_invoices").update({ status: "void", void_reason: why, updated_at: new Date().toISOString() }).eq("id", id).eq("paid_cents", 0).neq("status", "void").select("id").maybeSingle();
  throwIfSupabaseError(error, "Could not void the invoice");
  if (!data) throw new Error("HAS_RECEIPTS");
  const lineIds = current.lines.map((line) => line.id);
  if (lineIds.length) {
    const { error: releaseError } = await db.from("billing_events").update({ invoice_line_id: null, updated_at: new Date().toISOString() }).in("invoice_line_id", lineIds);
    throwIfSupabaseError(releaseError, "Could not release the invoice's fees");
  }
  await logAudit({ actorUserId, organizationId: current.organizationId, action: "billing.invoice.voided", targetTable: "portpass_invoices", targetId: id, before: { status: current.status, total_cents: current.totalCents }, after: { status: "void", reason: why } });
  await refreshAccount(current.organizationId, today);
  return (await getInvoice(id))!;
}

// ---- Fees per booking or wedding -------------------------------------------------------

export type StoredEvent = BillingEvent & { organizationName: string; sourceTable: string; invoiceNumber: string | null };

const EVENT_COLUMNS = "id,organization_id,kind,source_table,source_id,event_on,booking_value_cents,rate_bps,flat_cents,fee_cents,invoice_line_id,note,organizations(name),portpass_invoice_lines!billing_events_invoice_line_fk(portpass_invoices(number))";

function toEvent(row: Row): StoredEvent {
  const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string } | null;
  const line = (Array.isArray(row.portpass_invoice_lines) ? row.portpass_invoice_lines[0] : row.portpass_invoice_lines) as { portpass_invoices?: { number?: string } | Array<{ number?: string }> } | null;
  const invoice = Array.isArray(line?.portpass_invoices) ? line?.portpass_invoices[0] : line?.portpass_invoices;
  return {
    id: Number(row.id), organizationId: Number(row.organization_id), organizationName: org?.name ?? "", kind: row.kind as BillingEventKind, sourceTable: String(row.source_table), eventOn: String(row.event_on),
    bookingValueCents: Number(row.booking_value_cents), rateBps: Number(row.rate_bps), flatCents: Number(row.flat_cents), feeCents: Number(row.fee_cents),
    invoiceLineId: row.invoice_line_id === null || row.invoice_line_id === undefined ? null : Number(row.invoice_line_id), note: text(row.note), invoiceNumber: invoice?.number ?? null,
  };
}

export async function listEvents(filter: { organizationId?: number | null; invoiced?: boolean | null } = {}): Promise<StoredEvent[]> {
  let query = getSupabaseAdmin().from("billing_events").select(EVENT_COLUMNS).order("event_on", { ascending: false }).order("id", { ascending: false }).limit(1000);
  if (filter.organizationId) query = query.eq("organization_id", filter.organizationId);
  if (filter.invoiced === true) query = query.not("invoice_line_id", "is", null);
  if (filter.invoiced === false) query = query.is("invoice_line_id", null);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Could not load the fees");
  return (data ?? []).map((row) => toEvent(row as unknown as Row));
}

// A fee typed in by a founder (a wedding completed before the Desk
// tracked it). It has no source record, so it is its own source.
export async function addManualEvent(input: { organizationId: number; kind: BillingEventKind; eventOn: string; bookingValueCents: number; rateBps: number; flatCents: number; note: string }, actorUserId: string): Promise<StoredEvent> {
  const note = input.note.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!note) throw new Error("NOTE_REQUIRED");
  const fee = feeCents(input);
  if (fee <= 0) throw new Error("BAD_AMOUNT");
  // Unique with (kind, source_table): a random id stands in for a source row.
  const sourceId = Math.floor(Math.random() * 9_000_000_000_000) + 1_000_000_000_000;
  const { data, error } = await getSupabaseAdmin()
    .from("billing_events")
    .insert({ organization_id: input.organizationId, kind: input.kind, source_table: "manual", source_id: sourceId, event_on: input.eventOn, booking_value_cents: input.bookingValueCents, rate_bps: input.rateBps, flat_cents: input.flatCents, fee_cents: fee, note })
    .select(EVENT_COLUMNS)
    .single();
  if (error && (error as { code?: string }).code === "23503") throw new Error("NOT_FOUND");
  throwIfSupabaseError(error, "Could not add the fee");
  const event = toEvent(data as unknown as Row);
  await logAudit({ actorUserId, organizationId: input.organizationId, action: "billing.fee.added", targetTable: "billing_events", targetId: event.id, after: { kind: input.kind, event_on: input.eventOn, fee_cents: fee, note } });
  return event;
}

export const WEDDING_COORDINATION_FEE_CENTS = 15000;

// A wedding the Desk coordinated has happened: one coordination fee, once,
// however many times it is marked. Returns whether a fee was created.
export async function completeWedding(leadId: number, input: { completedOn: string; deskCoordinated: boolean }, actorName: string): Promise<{ feeCreated: boolean }> {
  const db = getSupabaseAdmin();
  const { data: lead, error } = await db.from("wedding_leads").select("id,names").eq("id", leadId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the wedding");
  if (!lead) throw new Error("NOT_FOUND");
  const { error: updateError } = await db.from("wedding_leads").update({ completed_on: input.completedOn, desk_coordinated: input.deskCoordinated, updated_at: new Date().toISOString() }).eq("id", leadId);
  throwIfSupabaseError(updateError, "Could not mark the wedding completed");
  if (!input.deskCoordinated) return { feeCreated: false };
  const { data: org, error: orgError } = await db.from("organizations").select("id").eq("slug", "bahamas-weddings").maybeSingle();
  throwIfSupabaseError(orgError, "Could not load the wedding business");
  if (!org) return { feeCreated: false };
  // The couple's names stay with the enquiry: the fee's note is its number.
  const { data: created, error: feeError } = await db
    .from("billing_events")
    .upsert({ organization_id: Number(org.id), kind: "wedding_coordination", source_table: "wedding_leads", source_id: leadId, event_on: input.completedOn, booking_value_cents: 0, rate_bps: 0, flat_cents: WEDDING_COORDINATION_FEE_CENTS, fee_cents: WEDDING_COORDINATION_FEE_CENTS, note: `Wedding enquiry ${leadId}` }, { onConflict: "kind,source_table,source_id", ignoreDuplicates: true })
    .select("id");
  throwIfSupabaseError(feeError, "Could not record the coordination fee");
  const feeCreated = (created ?? []).length > 0;
  if (feeCreated) await logAudit({ actorUserId: null, organizationId: Number(org.id), action: "billing.fee.added", targetTable: "billing_events", targetId: Number(created![0].id), after: { kind: "wedding_coordination", event_on: input.completedOn, fee_cents: WEDDING_COORDINATION_FEE_CENTS, by: actorName } });
  return { feeCreated };
}

// ---- The daily job ---------------------------------------------------------------------

async function planNames(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseAdmin().from("pricing_plans").select("code,name");
  throwIfSupabaseError(error, "Could not load plan names");
  return new Map((data ?? []).map((row) => [String(row.code), String(row.name)]));
}

// Rewrites one account's dates and status from its invoices.
export async function refreshAccount(organizationId: number, today: string = nassauToday()): Promise<void> {
  const account = await getAccount(organizationId);
  if (!account) return;
  const { error } = await getSupabaseAdmin().from("billing_accounts").update({ ...(await derived(account, today)), updated_at: new Date().toISOString() }).eq("organization_id", organizationId);
  throwIfSupabaseError(error, "Could not refresh the billing account");
}

export type DailyBilling = { drafted: number; markedOverdue: number; reminders: Array<{ reminder: Reminder; account: StoredAccount; planName: string; invoice: StoredInvoice | null }> };

// Steps 1 to 3 of the daily job (brief 09, 2.3), and what to email in
// step 4. Safe to run twice: an invoice exists once for a period, and a
// reminder's key is claimed before it is sent (claimReminder).
//   1. Draft, never send, the invoices that are due.
//   2. Mark sent invoices past their due date as overdue.
//   3. Rewrite every account's next invoice date and status.
export async function runDailyBilling(today: string = nassauToday()): Promise<DailyBilling> {
  const db = getSupabaseAdmin();
  const [accounts, names] = await Promise.all([listAccounts(), planNames()]);
  let drafted = 0;

  for (const account of accounts) {
    if (account.ended || account.paused) continue;
    if (isSubscription(account.cycle)) {
      const first = firstInvoiceOn(account);
      if (!first || (account.priceCents <= 0 && account.retainerCents <= 0)) continue;
      const periods = periodsDue(first, account.cycle, today);
      for (const [index, period] of periods.entries()) {
        const lines = subscriptionLines(account, names.get(account.planCode ?? "") ?? "PortPass", period, { firstInvoice: index === 0 });
        if (!lines.length) continue;
        if (await raiseInvoice({ organizationId: account.organizationId, kind: "subscription", periodStart: period.start, periodEnd: period.end, issuedOn: today, lines, createdBy: null })) drafted += 1;
      }
    } else if (account.cycle === "commission_monthly" || account.cycle === "per_event") {
      // In arrears, from the 1st: last month's fees (and anything older not yet invoiced).
      const invoiceOn = firstOfMonth(today);
      const events = eventsToInvoice(await listEvents({ organizationId: account.organizationId, invoiced: false }), account, invoiceOn);
      if (!events.length) continue;
      const periodStart = addMonths(invoiceOn, -1);
      if (await raiseInvoice({ organizationId: account.organizationId, kind: "commission", periodStart, periodEnd: addDays(invoiceOn, -1), issuedOn: today, lines: events.map(eventLine), createdBy: null })) drafted += 1;
    }
  }

  // Past due, not paid: overdue.
  const { data: late, error: lateError } = await db.from("portpass_invoices").update({ status: "overdue", updated_at: new Date().toISOString() }).in("status", ["sent", "part_paid"]).lt("due_on", today).select("id");
  throwIfSupabaseError(lateError, "Could not mark overdue invoices");

  const open = await listInvoices({ statuses: ["sent", "part_paid", "overdue"] });
  const reminders: DailyBilling["reminders"] = [];
  for (const account of accounts) {
    await refreshAccount(account.organizationId, today);
    const mine = open.filter((invoice) => invoice.organizationId === account.organizationId);
    for (const reminder of remindersDue(account, mine, today)) reminders.push({ reminder, account, planName: names.get(account.planCode ?? "") ?? "PortPass", invoice: "invoiceId" in reminder ? mine.find((invoice) => invoice.id === reminder.invoiceId) ?? null : null });
  }
  return { drafted, markedOverdue: (late ?? []).length, reminders };
}

// True the first time a reminder's key is claimed, false ever after.
export async function claimReminder(reminder: Reminder, organizationId: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("billing_reminders").upsert({ key: reminder.key, organization_id: organizationId, kind: reminder.kind }, { onConflict: "key", ignoreDuplicates: true }).select("key");
  throwIfSupabaseError(error, "Could not claim the reminder");
  return (data ?? []).length > 0;
}

// The email could not be sent: the claim is given back, so a second run
// the same day can try once more.
export async function releaseReminder(reminder: Reminder): Promise<void> {
  await getSupabaseAdmin().from("billing_reminders").delete().eq("key", reminder.key);
}

// ---- Admin -> Billing ------------------------------------------------------------------

export type BillingOverview = {
  roster: Array<RosterRow & { account: StoredAccount }>;
  drafts: StoredInvoice[];
  open: StoredInvoice[];
  founderCalls: StoredInvoice[];
  summary: ReturnType<typeof revenueSummary> & { collectedThisMonthCents: number; collectedToDateCents: number };
  dueSoon: Array<{ on: string; what: string; organizationId: number; organizationName: string }>;
  morning: string;
  byLine: Array<{ month: string; cents: Partial<Record<LineSource, number>> }>;
};

export async function getBillingOverview(today: string = nassauToday()): Promise<BillingOverview> {
  const db = getSupabaseAdmin();
  const [accounts, invoices, { data: receiptRows, error: receiptError }] = await Promise.all([listAccounts(), listInvoices(), db.from("portpass_receipts").select("amount_cents,received_on").order("id", { ascending: true }).limit(20_000)]);
  throwIfSupabaseError(receiptError, "Could not load receipts");
  const live = invoices.map((invoice) => ({ ...invoice, status: invoiceStatus(invoice, today) }));
  const roster = accounts.map((account) => {
    const mine = live.filter((invoice) => invoice.organizationId === account.organizationId);
    const raised = mine.filter((invoice) => invoice.kind === "subscription").map((invoice) => invoice.periodStart);
    return { account, status: accountStatus(account, mine, today), freeUntil: freeUntil(account), nextInvoiceOn: nextInvoiceOn(account, today, raised), owesCents: mine.reduce((sum, invoice) => sum + owedCents(invoice), 0), overdueCents: mine.filter((invoice) => invoice.status === "overdue").reduce((sum, invoice) => sum + owedCents(invoice), 0) };
  });
  const month = today.slice(0, 7);
  const receipts = (receiptRows ?? []) as Array<{ amount_cents: number; received_on: string }>;
  const open = live.filter((invoice) => invoice.status === "sent" || invoice.status === "part_paid" || invoice.status === "overdue");
  const drafts = live.filter((invoice) => invoice.status === "draft");
  const founderCalls = open.filter((invoice) => needsFounderCall(invoice, today));
  const horizon = addDays(today, 30);
  const dueSoon: BillingOverview["dueSoon"] = [];
  for (const row of roster) {
    if (row.nextInvoiceOn && row.nextInvoiceOn <= horizon) dueSoon.push({ on: row.nextInvoiceOn, what: "Invoice to draft", organizationId: row.account.organizationId, organizationName: row.account.organizationName });
    if (row.freeUntil && row.freeUntil >= today && row.freeUntil <= horizon) dueSoon.push({ on: row.freeUntil, what: "Free period ends", organizationId: row.account.organizationId, organizationName: row.account.organizationName });
  }
  for (const invoice of open) if (invoice.dueOn >= today && invoice.dueOn <= horizon) dueSoon.push({ on: invoice.dueOn, what: `${invoice.number} due`, organizationId: invoice.organizationId, organizationName: invoice.organizationName });
  dueSoon.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.organizationName.localeCompare(b.organizationName)));

  // The last six months of invoiced money, by what it was for.
  const months = Array.from({ length: 6 }, (_, index) => addMonths(firstOfMonth(today), -index).slice(0, 7));
  const counted = live.filter((invoice) => invoice.status !== "draft" && invoice.status !== "void" && months.includes(invoice.issuedOn.slice(0, 7)));
  const byLine: BillingOverview["byLine"] = months.map((m) => ({ month: m, cents: {} }));
  for (let i = 0; i < counted.length; i += 150) {
    const chunk = counted.slice(i, i + 150);
    const { data: lines, error } = await db.from("portpass_invoice_lines").select("invoice_id,source,amount_cents").in("invoice_id", chunk.map((invoice) => invoice.id));
    throwIfSupabaseError(error, "Could not load invoice lines");
    for (const line of lines ?? []) {
      const invoice = chunk.find((candidate) => candidate.id === Number(line.invoice_id));
      const bucket = byLine.find((entry) => entry.month === invoice?.issuedOn.slice(0, 7));
      if (bucket) bucket.cents[line.source as LineSource] = (bucket.cents[line.source as LineSource] ?? 0) + Number(line.amount_cents);
    }
  }

  const overdue = open.filter((invoice) => invoice.status === "overdue");
  return {
    roster, drafts, open, founderCalls,
    summary: { ...revenueSummary(roster), collectedThisMonthCents: receipts.filter((r) => r.received_on.slice(0, 7) === month).reduce((sum, r) => sum + Number(r.amount_cents), 0), collectedToDateCents: receipts.reduce((sum, r) => sum + Number(r.amount_cents), 0) },
    dueSoon,
    morning: morningSummary({ drafts: drafts.length, overdue: overdue.length, overdueCents: overdue.reduce((sum, invoice) => sum + owedCents(invoice), 0), founderCalls: founderCalls.length, trialsEndingThisWeek: roster.filter((row) => row.status === "trial" && row.freeUntil !== null && daysBetween(today, row.freeUntil) <= 7).length }),
    byLine,
  };
}

// For the accountant: invoices and receipts in a date range.
export async function billingExport(from: string, to: string): Promise<{ invoices: StoredInvoice[]; receipts: Array<Receipt & { invoiceNumber: string; organizationName: string }> }> {
  const all = await listInvoices();
  const invoices = all.filter((invoice) => invoice.issuedOn >= from && invoice.issuedOn <= to && invoice.status !== "draft");
  const { data, error } = await getSupabaseAdmin().from("portpass_receipts").select("id,invoice_id,organization_id,amount_cents,method,reference,received_on,note,created_at").gte("received_on", from).lte("received_on", to).order("received_on", { ascending: true }).order("id", { ascending: true }).limit(20_000);
  throwIfSupabaseError(error, "Could not load receipts");
  const byId = new Map(all.map((invoice) => [invoice.id, invoice]));
  return { invoices, receipts: (data ?? []).map((row) => ({ ...toReceipt(row as Row), invoiceNumber: byId.get(Number(row.invoice_id))?.number ?? "", organizationName: byId.get(Number(row.invoice_id))?.organizationName ?? "" })) };
}

// ---- A business's own plan and invoices ------------------------------------------------

export type PlanCard = { account: StoredAccount | null; planName: string | null; status: AccountStatus | null; freeUntil: string | null; nextInvoiceOn: string | null; nextInvoiceCents: number | null; invoices: StoredInvoice[]; bank: BankDetails };

// What an owner or admin sees about their own business: never a draft
// (not yet reviewed by PortPass), never another business's.
export async function getPlanCard(organizationId: number, today: string = nassauToday()): Promise<PlanCard> {
  const [account, invoices, bank, names] = await Promise.all([getAccount(organizationId), listInvoices({ organizationId }), getBankDetails(), planNames()]);
  const shown = invoices.filter((invoice) => invoice.status !== "draft").map((invoice) => ({ ...invoice, status: invoiceStatus(invoice, today) }));
  if (!account) return { account: null, planName: null, status: null, freeUntil: null, nextInvoiceOn: null, nextInvoiceCents: null, invoices: shown, bank };
  const raised = invoices.filter((invoice) => invoice.kind === "subscription").map((invoice) => invoice.periodStart);
  const next = nextInvoiceOn(account, today, raised);
  let nextInvoiceCents: number | null = null;
  if (next && isSubscription(account.cycle)) {
    const first = firstInvoiceOn(account);
    nextInvoiceCents = subscriptionLines(account, "", { start: next, end: next }, { firstInvoice: next === first }).reduce((sum, line) => sum + line.amountCents, 0);
  }
  return { account, planName: account.planCode ? names.get(account.planCode) ?? null : null, status: accountStatus(account, shown, today), freeUntil: freeUntil(account), nextInvoiceOn: next, nextInvoiceCents, invoices: shown, bank };
}
