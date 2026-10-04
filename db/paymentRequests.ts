import { randomBytes } from "node:crypto";
import { derivePaymentStatus } from "@/lib/payments";
import { normalizePhoneE164 } from "@/lib/phone";
import { privatePaymentStatus } from "@/lib/privateSessions";
import type { MarkPaidInput, RequestInput, SettingsInput } from "@/lib/paymentRequests/input";
import {
  addDays,
  getPaidProblem,
  isRequestMethod,
  balanceCents,
  canEditRequest,
  canVoidRequest,
  firstName,
  formatDay,
  futprepFeeLine,
  linkExpired,
  methodsSetUp,
  paymentVolume,
  type HowToPay,
  type LineItem,
  type ListedRequest,
  type ReminderVia,
  type RequestMethod,
  type RequestStatus,
  type SentVia,
  type VolumePayment,
  type VolumeRequest,
  type VolumeRow,
} from "@/lib/paymentRequests/rules";
import { nassauToday } from "@/lib/futprepTerms";
import type { PaymentFrequency } from "./registrations";
import { logAudit } from "./audit";
import { findPersonByEmail } from "./accounts";
import { demoOrganizationIdOrNull } from "./demo";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Payment requests (brief 17, Payments Phase 1). Every function that takes
// an organization id only ever reads or writes that business's rows: the
// caller (lib/paymentRequests/access.ts) has already checked who may
// handle its payments. The customer's page reads one request by its
// public token and nothing else.
//
// PortPass never holds money: a recorded payment is what the business says
// it received from the customer directly.

export type Actor = { userId: string | null; name: string };

// ---- settings -------------------------------------------------------------------

export type PaymentSettings = HowToPay & {
  organizationId: number;
  referencePrefix: string;
  defaultDueDays: number;
  updatedAt: string;
  updatedBy: string | null;
};

const SETTINGS_COLUMNS = "organization_id,reference_prefix,accepted_methods,bank_name,account_name,account_number_last4,transfer_instructions,kanoo_handle_or_phone,cash_note,default_due_days,updated_at,updated_by";

function toSettings(row: Record<string, unknown>): PaymentSettings {
  return {
    organizationId: Number(row.organization_id),
    referencePrefix: row.reference_prefix as string,
    bankName: (row.bank_name as string) ?? "",
    accountName: (row.account_name as string) ?? "",
    accountNumberLast4: (row.account_number_last4 as string | null) ?? null,
    transferInstructions: (row.transfer_instructions as string) ?? "",
    kanooHandleOrPhone: (row.kanoo_handle_or_phone as string) ?? "",
    cashNote: (row.cash_note as string) ?? "",
    acceptedMethods: Array.isArray(row.accepted_methods) ? (row.accepted_methods as unknown[]).filter(isRequestMethod) : [],
    defaultDueDays: Number(row.default_due_days ?? 7),
    updatedAt: row.updated_at as string,
    updatedBy: (row.updated_by as string | null) ?? null,
  };
}

export async function getPaymentSettings(orgId: number): Promise<PaymentSettings | null> {
  const { data, error } = await getSupabaseAdmin().from("organization_payment_settings").select(SETTINGS_COLUMNS).eq("organization_id", orgId).maybeSingle();
  throwIfSupabaseError(error, "Could not load payment settings");
  return data ? toSettings(data) : null;
}

// Changing where customers send money is the fraud to design out: every
// change is audit-logged (the instructions text itself is not copied into
// the log, since it may hold a full account number) and the caller tells
// the owners.
export async function savePaymentSettings(orgId: number, input: SettingsInput, actor: Actor): Promise<{ settings: PaymentSettings; howToPayChanged: boolean }> {
  const before = await getPaymentSettings(orgId);
  const { data, error } = await getSupabaseAdmin()
    .from("organization_payment_settings")
    .upsert(
      {
        organization_id: orgId,
        reference_prefix: input.referencePrefix,
        bank_name: input.bankName,
        account_name: input.accountName,
        account_number_last4: input.accountNumberLast4,
        transfer_instructions: input.transferInstructions,
        kanoo_handle_or_phone: input.kanooHandleOrPhone,
        cash_note: input.cashNote,
        accepted_methods: input.acceptedMethods,
        default_due_days: input.defaultDueDays,
        updated_at: new Date().toISOString(),
        updated_by: actor.name,
      },
      { onConflict: "organization_id" },
    )
    .select(SETTINGS_COLUMNS)
    .single();
  throwIfSupabaseError(error, "Could not save payment settings");
  const settings = toSettings(data!);
  const howToPayChanged =
    before !== null &&
    (before.bankName !== settings.bankName ||
      before.accountName !== settings.accountName ||
      before.accountNumberLast4 !== settings.accountNumberLast4 ||
      before.transferInstructions !== settings.transferInstructions ||
      before.kanooHandleOrPhone !== settings.kanooHandleOrPhone);
  // The business's page and its shop read the same answer (cash and bank
  // transfer; the account's last four digits, the full number only inside
  // the instructions the business wrote).
  const accepted = settings.acceptedMethods ?? [];
  const bank = accepted.includes("bank_transfer")
    ? { bank: settings.bankName, accountName: settings.accountName, accountNumber: settings.accountNumberLast4 ? `Ending ${settings.accountNumberLast4}` : "See the notes below", branch: "", instructions: settings.transferInstructions }
    : null;
  const { error: syncError } = await getSupabaseAdmin()
    .from("organizations")
    .update({ payment_methods: accepted.filter((method) => method === "cash" || method === "bank_transfer"), bank_transfer_details: bank })
    .eq("id", orgId);
  throwIfSupabaseError(syncError, "Could not save how the business is paid");
  const loggable = (s: PaymentSettings | null) =>
    s && { accepted_methods: s.acceptedMethods ?? [], reference_prefix: s.referencePrefix, bank_name: s.bankName, account_name: s.accountName, account_number_last4: s.accountNumberLast4, kanoo_handle_or_phone: s.kanooHandleOrPhone, cash_note: s.cashNote, default_due_days: s.defaultDueDays };
  await logAudit({
    actorUserId: actor.userId,
    organizationId: orgId,
    action: "payment_settings.updated",
    targetTable: "organization_payment_settings",
    targetId: orgId,
    before: loggable(before),
    after: { ...loggable(settings), transfer_instructions_changed: (before?.transferInstructions ?? "") !== settings.transferInstructions, by: actor.name },
  });
  return { settings, howToPayChanged };
}

// ---- requests -------------------------------------------------------------------

export type PaymentRequest = ListedRequest & {
  organizationId: number;
  publicToken: string;
  personId: number | null;
  registrationId: number | null;
  privateSessionRequestId: number | null;
  reservationId: number | null;
  offeringId: number | null;
  allowPartPayment: boolean;
  methods: RequestMethod[];
  paidAt: string | null;
  sentVia: SentVia | null;
  lastRemindedVia: ReminderVia | null;
  reminderCount: number;
  customerSaysPaidNote: string | null;
  isTest: boolean;
  createdByName: string;
  updatedAt: string;
  voidedAt: string | null;
  voidedReason: string | null;
};

export type RequestPayment = {
  id: number;
  amountCents: number;
  method: string;
  status: "received" | "voided" | "refunded";
  receivedAt: string;
  reference: string | null;
  note: string;
  recordedBy: string | null;
  receiptNumber: string | null;
  refundedAt: string | null;
  refundNote: string | null;
};

const REQUEST_COLUMNS =
  "id,organization_id,reference_code,public_token,is_test,person_id,customer_name,customer_email,customer_phone,registration_id,private_session_request_id,reservation_id,offering_id,line_items,total_cents,due_date,allow_part_payment,methods_allowed,status,paid_cents,paid_at,sent_via,sent_at,last_reminded_at,last_reminded_via,reminder_count,customer_says_paid_at,customer_says_paid_note,created_by_name,created_at,updated_at,voided_at,voided_reason";

const PAYMENT_COLUMNS = "id,amount_cents,method,status,received_at,created_at,reference,note,recorded_by,receipt_number,refunded_at,refund_note";

function toLines(value: unknown): LineItem[] {
  return Array.isArray(value)
    ? value.map((l: Record<string, unknown>) => ({ label: String(l.label ?? ""), qty: Number(l.qty ?? 1), unitCents: Number(l.unit_cents ?? 0) }))
    : [];
}

function fromLines(lines: LineItem[]) {
  return lines.map((l) => ({ label: l.label, qty: l.qty, unit_cents: l.unitCents }));
}

const idOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function toRequest(row: Record<string, unknown>): PaymentRequest {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    referenceCode: row.reference_code as string,
    publicToken: row.public_token as string,
    personId: idOrNull(row.person_id),
    customerName: row.customer_name as string,
    customerEmail: (row.customer_email as string | null) ?? null,
    customerPhone: (row.customer_phone as string | null) ?? null,
    registrationId: idOrNull(row.registration_id),
    privateSessionRequestId: idOrNull(row.private_session_request_id),
    reservationId: idOrNull(row.reservation_id),
    offeringId: idOrNull(row.offering_id),
    lines: toLines(row.line_items),
    totalCents: Number(row.total_cents),
    dueDate: row.due_date as string,
    allowPartPayment: Boolean(row.allow_part_payment),
    methods: (row.methods_allowed as RequestMethod[]) ?? [],
    status: row.status as RequestStatus,
    paidCents: Number(row.paid_cents),
    paidAt: (row.paid_at as string | null) ?? null,
    sentVia: (row.sent_via as SentVia | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    lastRemindedAt: (row.last_reminded_at as string | null) ?? null,
    lastRemindedVia: (row.last_reminded_via as ReminderVia | null) ?? null,
    reminderCount: Number(row.reminder_count ?? 0),
    customerSaysPaidAt: (row.customer_says_paid_at as string | null) ?? null,
    customerSaysPaidNote: (row.customer_says_paid_note as string | null) ?? null,
    isTest: Boolean(row.is_test),
    createdByName: (row.created_by_name as string) ?? "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    voidedAt: (row.voided_at as string | null) ?? null,
    voidedReason: (row.voided_reason as string | null) ?? null,
  };
}

function toPayment(row: Record<string, unknown>): RequestPayment {
  return {
    id: Number(row.id),
    amountCents: Number(row.amount_cents),
    method: row.method as string,
    status: row.status as RequestPayment["status"],
    receivedAt: (row.received_at as string | null) ?? (row.created_at as string),
    reference: (row.reference as string | null) ?? null,
    note: (row.note as string) ?? "",
    recordedBy: (row.recorded_by as string | null) ?? null,
    receiptNumber: (row.receipt_number as string | null) ?? null,
    refundedAt: (row.refunded_at as string | null) ?? null,
    refundNote: (row.refund_note as string | null) ?? null,
  };
}

// PostgREST returns at most 1,000 rows a call, whatever .limit() says.
async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>, context: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    throwIfSupabaseError(error, context);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

// The database refuses with PAYMENT_REQUEST_<CODE>; the screens get <CODE>.
function rpcError(error: { message?: string } | null, context: string): void {
  if (!error) return;
  const code = /PAYMENT_REQUEST_([A-Z_]+)/.exec(error.message ?? "")?.[1];
  if (code) throw new Error(code);
  throwIfSupabaseError(error, context);
}

async function audit(orgId: number, actor: Actor | null, action: string, request: Pick<PaymentRequest, "id" | "referenceCode">, after: Record<string, unknown> = {}) {
  await logAudit({ actorUserId: actor?.userId ?? null, organizationId: orgId, action: `payment_request.${action}`, targetTable: "payment_requests", targetId: request.id, after: { reference: request.referenceCode, ...after, ...(actor ? { by: actor.name } : {}) } });
}

export function newPublicToken(): string {
  return randomBytes(20).toString("hex");
}

// A link must be one of this business's own records, not another's.
async function assertLinksBelong(orgId: number, input: Pick<RequestInput, "registrationId" | "privateSessionRequestId" | "reservationId" | "offeringId">): Promise<void> {
  const db = getSupabaseAdmin();
  const checks: [string, number | null][] = [
    ["registrations", input.registrationId],
    ["private_session_requests", input.privateSessionRequestId],
    ["reservations", input.reservationId],
    ["offerings", input.offeringId],
  ];
  for (const [table, id] of checks) {
    if (id === null) continue;
    const { data, error } = await db.from(table).select("id").eq("id", id).eq("organization_id", orgId).maybeSingle();
    throwIfSupabaseError(error, "Could not check the linked record");
    if (!data) throw new Error("LINK_NOT_FOUND");
  }
}

// Who the request is for, as a PortPass person when we know one: the
// registration's parent, or someone who signed up with that email.
async function personFor(orgId: number, input: RequestInput): Promise<number | null> {
  if (input.registrationId !== null) {
    const { data } = await getSupabaseAdmin().from("registrations").select("parent_person_id").eq("id", input.registrationId).eq("organization_id", orgId).maybeSingle();
    if (data?.parent_person_id) return Number(data.parent_person_id);
  }
  if (input.customerEmail) {
    const person = await findPersonByEmail(input.customerEmail).catch(() => null);
    if (person) return person.id;
  }
  return null;
}

export async function createPaymentRequest(orgId: number, input: RequestInput, actor: Actor, defaultPrefix: string, options: { isTest?: boolean } = {}): Promise<PaymentRequest> {
  await assertLinksBelong(orgId, input);
  const personId = await personFor(orgId, input);
  const { data, error } = await getSupabaseAdmin().rpc("payment_request_create", {
    p: {
      organization_id: orgId,
      default_prefix: defaultPrefix,
      public_token: newPublicToken(),
      person_id: personId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      registration_id: input.registrationId,
      private_session_request_id: input.privateSessionRequestId,
      reservation_id: input.reservationId,
      offering_id: input.offeringId,
      line_items: fromLines(input.lines),
      total_cents: input.totalCents,
      due_date: input.dueDate,
      allow_part_payment: input.allowPartPayment,
      methods_allowed: input.methods,
      created_by: actor.userId,
      created_by_name: actor.name,
      is_test: Boolean(options.isTest),
    },
  });
  rpcError(error, "Could not create the payment request");
  const request = toRequest(data as Record<string, unknown>);
  await audit(orgId, actor, "created", request, { total_cents: request.totalCents, due_date: request.dueDate, lines: request.lines.length, ...(request.isTest ? { test: true } : {}) });
  return request;
}

export async function getPaymentRequest(orgId: number, id: number): Promise<{ request: PaymentRequest; payments: RequestPayment[] } | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("payment_requests").select(REQUEST_COLUMNS).eq("id", id).eq("organization_id", orgId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the payment request");
  if (!data) return null;
  const { data: payments, error: paymentsError } = await db.from("payments").select(PAYMENT_COLUMNS).eq("payment_request_id", id).order("received_at", { ascending: true });
  throwIfSupabaseError(paymentsError, "Could not load the request's payments");
  return { request: toRequest(data), payments: (payments ?? []).map(toPayment) };
}

async function requireRequest(orgId: number, id: number): Promise<PaymentRequest> {
  const found = await getPaymentRequest(orgId, id);
  if (!found) throw new Error("NOT_FOUND");
  return found.request;
}

// Changes allowed until money is recorded against it. The record it came
// from (a registration, a session, a reservation) stays as it was.
export async function updatePaymentRequest(orgId: number, id: number, input: RequestInput, actor: Actor): Promise<PaymentRequest> {
  const current = await requireRequest(orgId, id);
  if (current.status === "void") throw new Error("VOID");
  if (!canEditRequest(current)) throw new Error("HAS_PAYMENTS");
  await assertLinksBelong(orgId, { registrationId: null, privateSessionRequestId: null, reservationId: null, offeringId: input.offeringId });
  const { data, error } = await getSupabaseAdmin()
    .from("payment_requests")
    .update({
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      offering_id: input.offeringId,
      line_items: fromLines(input.lines),
      total_cents: input.totalCents,
      due_date: input.dueDate,
      allow_part_payment: input.allowPartPayment,
      methods_allowed: input.methods,
    })
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("paid_cents", 0)
    .neq("status", "void")
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not save the payment request");
  if (!data) throw new Error("HAS_PAYMENTS");
  const request = toRequest(data);
  await audit(orgId, actor, "edited", request, {
    before: { total_cents: current.totalCents, due_date: current.dueDate, lines: current.lines.length, allow_part_payment: current.allowPartPayment },
    after: { total_cents: request.totalCents, due_date: request.dueDate, lines: request.lines.length, allow_part_payment: request.allowPartPayment },
  });
  return request;
}

export async function listPaymentRequests(orgId: number): Promise<PaymentRequest[]> {
  const db = getSupabaseAdmin();
  const rows = await pageAll<Record<string, unknown>>((from, to) => db.from("payment_requests").select(REQUEST_COLUMNS).eq("organization_id", orgId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), "Could not load payment requests");
  return rows.map(toRequest);
}

// How many requests a business has (the demo's are capped).
export async function countPaymentRequests(orgId: number): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("payment_requests").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  throwIfSupabaseError(error, "Could not count payment requests");
  return count ?? 0;
}

export type OrgRequestPayment = RequestPayment & { requestId: number; referenceCode: string; customerName: string };

// Payments recorded against this business's requests, optionally received
// between two instants.
export async function listOrgRequestPayments(orgId: number, range: { fromIso?: string; toIso?: string } = {}): Promise<OrgRequestPayment[]> {
  const db = getSupabaseAdmin();
  const rows = await pageAll<Record<string, unknown>>((from, to) => {
    let query = db
      .from("payments")
      .select(`${PAYMENT_COLUMNS},payment_request_id,payment_requests!inner(organization_id,reference_code,customer_name)`)
      .eq("payment_requests.organization_id", orgId)
      .order("received_at", { ascending: true })
      .order("id", { ascending: true });
    if (range.fromIso) query = query.gte("received_at", range.fromIso);
    if (range.toIso) query = query.lt("received_at", range.toIso);
    return query.range(from, to);
  }, "Could not load payments");
  return rows.map((row) => {
    const req = (Array.isArray(row.payment_requests) ? row.payment_requests[0] : row.payment_requests) as { reference_code: string; customer_name: string };
    return { ...toPayment(row), requestId: Number(row.payment_request_id), referenceCode: req.reference_code, customerName: req.customer_name };
  });
}

// "Sent": a person pressed WhatsApp, Send by email, Copy link or Handed over.
// The first send is the one that counts; later ones are noted in the log.
export async function markPaymentRequestSent(orgId: number, id: number, via: SentVia, actor: Actor): Promise<PaymentRequest> {
  const current = await requireRequest(orgId, id);
  if (current.status === "void") throw new Error("VOID");
  if (current.sentAt) {
    await audit(orgId, actor, "resent", current, { via });
    return current;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("payment_requests")
    .update({ sent_at: new Date().toISOString(), sent_via: via })
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("sent_at", null)
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not mark the request sent");
  const request = data ? toRequest(data) : await requireRequest(orgId, id);
  await audit(orgId, actor, "sent", request, { via });
  return request;
}

// A reminder a person sent (WhatsApp) or asked us to email, for the
// "last reminded" note on the chase list.
export async function recordReminder(orgId: number, id: number, via: ReminderVia, actor: Actor): Promise<PaymentRequest> {
  const current = await requireRequest(orgId, id);
  if (current.status !== "sent" && current.status !== "part_paid") throw new Error(current.status === "void" ? "VOID" : current.status === "paid" ? "ALREADY_PAID" : "NOT_SENT_YET");
  const { data, error } = await getSupabaseAdmin()
    .from("payment_requests")
    .update({ last_reminded_at: new Date().toISOString(), last_reminded_via: via, reminder_count: current.reminderCount + 1 })
    .eq("id", id)
    .eq("organization_id", orgId)
    .select(REQUEST_COLUMNS)
    .single();
  throwIfSupabaseError(error, "Could not record the reminder");
  const request = toRequest(data!);
  await audit(orgId, actor, "reminded", request, { via, count: request.reminderCount });
  return request;
}

// "Mark paid": records a payments row with a receipt number. The balance,
// the part-payment rule and the double tap are checked by the database
// with the request locked.
export async function recordRequestPayment(orgId: number, id: number, input: MarkPaidInput, actor: Actor): Promise<{ request: PaymentRequest; receiptNumber: string; paymentId: number }> {
  const { data, error } = await getSupabaseAdmin().rpc("payment_request_record_payment", {
    p: {
      organization_id: orgId,
      request_id: id,
      amount_cents: input.amountCents,
      method: input.method,
      received_at: input.receivedAt,
      reference: input.reference,
      note: input.note,
      recorded_by: actor.name,
    },
  });
  rpcError(error, "Could not record the payment");
  const result = data as { payment_id: number; receipt_number: string };
  // Confirmed by staff: the customer's "I've paid" flag has been dealt with.
  await getSupabaseAdmin().from("payment_requests").update({ customer_says_paid_at: null, customer_says_paid_note: null }).eq("id", id).eq("organization_id", orgId);
  const request = await requireRequest(orgId, id);
  await syncLinkedRecord(request, actor);
  await audit(orgId, actor, "payment_recorded", request, { amount_cents: input.amountCents, method: input.method, receipt: result.receipt_number, status: request.status });
  return { request, receiptNumber: result.receipt_number, paymentId: Number(result.payment_id) };
}

// Money given back: the payment stays in the history marked refunded, with
// a note, and the request's balance goes back up.
export async function refundRequestPayment(orgId: number, requestId: number, paymentId: number, note: string, actor: Actor): Promise<PaymentRequest> {
  const current = await requireRequest(orgId, requestId);
  if (!note.trim()) throw new Error("NEEDS_REFUND_NOTE");
  const { data, error } = await getSupabaseAdmin()
    .from("payments")
    .update({ status: "refunded", refunded_at: new Date().toISOString(), refund_note: note.trim().slice(0, 300) })
    .eq("id", paymentId)
    .eq("payment_request_id", requestId)
    .eq("status", "received")
    .select("id,amount_cents,receipt_number")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not record the refund");
  if (!data) throw new Error("ALREADY_REFUNDED");
  const request = await requireRequest(orgId, requestId);
  await syncLinkedRecord(request, actor);
  await audit(orgId, actor, "payment_refunded", current, { amount_cents: Number(data.amount_cents), receipt: data.receipt_number, status: request.status });
  return request;
}

export async function voidPaymentRequest(orgId: number, id: number, reason: string, actor: Actor): Promise<PaymentRequest> {
  const current = await requireRequest(orgId, id);
  if (current.status === "void") throw new Error("VOID");
  if (!canVoidRequest(current)) throw new Error("HAS_PAYMENTS");
  const why = reason.trim().slice(0, 300);
  if (!why) throw new Error("NEEDS_REASON");
  const { data, error } = await getSupabaseAdmin()
    .from("payment_requests")
    .update({ status: "void", voided_reason: why })
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("paid_cents", 0)
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error?.code === "23514") throw new Error("HAS_PAYMENTS");
  throwIfSupabaseError(error, "Could not void the request");
  if (!data) throw new Error("HAS_PAYMENTS");
  const request = toRequest(data);
  await audit(orgId, actor, "voided", request, { reason: why });
  return request;
}

// "Not received yet": staff checked and the money isn't there.
export async function clearCustomerSaysPaid(orgId: number, id: number, actor: Actor): Promise<PaymentRequest> {
  const current = await requireRequest(orgId, id);
  const { data, error } = await getSupabaseAdmin()
    .from("payment_requests")
    .update({ customer_says_paid_at: null, customer_says_paid_note: null })
    .eq("id", id)
    .eq("organization_id", orgId)
    .select(REQUEST_COLUMNS)
    .single();
  throwIfSupabaseError(error, "Could not clear the flag");
  await audit(orgId, actor, "flag_cleared", current, { said_paid_at: current.customerSaysPaidAt });
  return toRequest(data!);
}

// A request made from a registration, a private session or a reservation
// keeps that record's own payment status in step, the same way its own
// screen would.
async function syncLinkedRecord(request: PaymentRequest, actor: Actor): Promise<void> {
  const db = getSupabaseAdmin();
  if (request.registrationId !== null) {
    const { data: registration, error } = await db.from("registrations").select("id,amount_due_cents,payment_frequency").eq("id", request.registrationId).maybeSingle();
    throwIfSupabaseError(error, "Could not load the registration");
    if (!registration) return;
    const { data: rows, error: sumError } = await db.from("payments").select("amount_cents").eq("registration_id", request.registrationId).eq("status", "received");
    throwIfSupabaseError(sumError, "Could not total the registration's payments");
    const paid = (rows ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
    const status = derivePaymentStatus({ paymentFrequency: registration.payment_frequency as PaymentFrequency, paidCents: paid, amountDueCents: Number(registration.amount_due_cents) });
    const { error: updateError } = await db.from("registrations").update({ payment_status: status }).eq("id", request.registrationId);
    throwIfSupabaseError(updateError, "Could not update the registration's payment status");
  }
  if (request.privateSessionRequestId !== null) {
    const { data: session, error } = await db.from("private_session_requests").select("id,price_cents").eq("id", request.privateSessionRequestId).maybeSingle();
    throwIfSupabaseError(error, "Could not load the private session");
    if (!session) return;
    const { data: rows, error: sumError } = await db.from("payments").select("amount_cents").eq("private_session_request_id", request.privateSessionRequestId).eq("status", "received");
    throwIfSupabaseError(sumError, "Could not total the session's payments");
    const paid = (rows ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
    const now = new Date().toISOString();
    const { error: updateError } = await db.from("private_session_requests").update({ payment_status: privatePaymentStatus(session.price_cents === null ? null : Number(session.price_cents), paid), updated_at: now }).eq("id", request.privateSessionRequestId);
    throwIfSupabaseError(updateError, "Could not update the session's payment status");
    await db.from("private_session_events").insert({ request_id: request.privateSessionRequestId, actor_account: actor.name, action: "payment", note: `Payment request ${request.referenceCode}: ${request.status.replace("_", " ")}` });
  }
  if (request.reservationId !== null) {
    const now = new Date().toISOString();
    const update =
      request.status === "paid"
        ? db.from("reservations").update({ payment_status: "paid", paid_at: now, updated_at: now }).eq("id", request.reservationId).eq("status", "active").eq("payment_status", "pending")
        : db.from("reservations").update({ payment_status: "pending", paid_at: null, updated_at: now }).eq("id", request.reservationId).eq("payment_status", "paid");
    const { error } = await update;
    throwIfSupabaseError(error, "Could not update the reservation");
  }
}

// ---- the customer's page --------------------------------------------------------------

export type PublicBusiness = {
  id: number;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  whatsappE164: string | null;
  phoneE164: string | null;
  publicEmail: string | null;
  // The demo business (brief 18, part B): the page says nothing is owed.
  isDemo: boolean;
};

export type PublicPayment = { receiptNumber: string | null; amountCents: number; method: string; receivedAt: string; status: RequestPayment["status"] };

export type PublicRequest = {
  token: string;
  referenceCode: string;
  customerName: string;
  lines: LineItem[];
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string;
  status: RequestStatus;
  allowPartPayment: boolean;
  methods: RequestMethod[];
  customerSaysPaidAt: string | null;
  expired: boolean;
  // A TEST request the owner sent themselves: the page says so.
  isTest: boolean;
};

export type PublicView = { request: PublicRequest; business: PublicBusiness; howToPay: HowToPay; payments: PublicPayment[] };

export function isPublicToken(value: string): boolean {
  return /^[a-f0-9]{40}$/.test(value);
}

// By token only. What a customer may see: the business, what it's for,
// the amounts and how to pay. Never the customer's contact details (a link
// can be forwarded), never staff notes or who recorded what.
export async function getPublicPaymentRequest(token: string, now: Date = new Date()): Promise<PublicView | null> {
  if (!isPublicToken(token)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("payment_requests").select(REQUEST_COLUMNS).eq("public_token", token).maybeSingle();
  throwIfSupabaseError(error, "Could not load the payment request");
  if (!data) return null;
  const request = toRequest(data);
  const [{ data: org, error: orgError }, settings, { data: payments, error: paymentsError }] = await Promise.all([
    db.from("organizations").select("id,name,slug,logo_url,brand_color,whatsapp_e164,phone_e164,public_email,is_demo").eq("id", request.organizationId).single(),
    getPaymentSettings(request.organizationId),
    db.from("payments").select(PAYMENT_COLUMNS).eq("payment_request_id", request.id).in("status", ["received", "refunded"]).order("received_at", { ascending: true }),
  ]);
  throwIfSupabaseError(orgError, "Could not load the business");
  throwIfSupabaseError(paymentsError, "Could not load the payments");
  return {
    request: {
      token,
      referenceCode: request.referenceCode,
      customerName: request.customerName,
      lines: request.lines,
      totalCents: request.totalCents,
      paidCents: request.paidCents,
      balanceCents: balanceCents(request),
      dueDate: request.dueDate,
      status: request.status,
      allowPartPayment: request.allowPartPayment,
      methods: request.methods,
      customerSaysPaidAt: request.customerSaysPaidAt,
      expired: linkExpired(request, now),
      isTest: request.isTest,
    },
    business: {
      id: Number(org!.id),
      name: org!.name as string,
      slug: (org!.slug as string | null) ?? null,
      logoUrl: (org!.logo_url as string | null) ?? null,
      brandColor: (org!.brand_color as string | null) ?? null,
      whatsappE164: (org!.whatsapp_e164 as string | null) ?? null,
      phoneE164: (org!.phone_e164 as string | null) ?? null,
      publicEmail: (org!.public_email as string | null) ?? null,
      isDemo: Boolean(org!.is_demo),
    },
    howToPay: settings ?? { bankName: "", accountName: "", accountNumberLast4: null, transferInstructions: "", kanooHandleOrPhone: "", cashNote: "", acceptedMethods: [] },
    payments: (payments ?? []).map((row) => {
      const p = toPayment(row);
      return { receiptNumber: p.receiptNumber, amountCents: p.amountCents, method: p.method, receivedAt: p.receivedAt, status: p.status };
    }),
  };
}

// The customer tapped "I've paid": a flag on the business's dashboard. It
// never marks the request paid; only staff do that.
export async function customerSaysPaid(token: string, note: string): Promise<"flagged" | "not_found" | "closed"> {
  if (!isPublicToken(token)) return "not_found";
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("payment_requests").select(REQUEST_COLUMNS).eq("public_token", token).maybeSingle();
  throwIfSupabaseError(error, "Could not load the payment request");
  if (!data) return "not_found";
  const request = toRequest(data);
  if ((request.status !== "sent" && request.status !== "part_paid") || linkExpired(request)) return "closed";
  // The demo keeps the tap, never the words: nothing a visitor types is
  // shown to the next visitor.
  const clean = request.organizationId === (await demoOrganizationIdOrNull()) ? "" : note.replace(/\s+/g, " ").trim().slice(0, 300);
  const { error: updateError } = await db
    .from("payment_requests")
    .update({ customer_says_paid_at: new Date().toISOString(), customer_says_paid_note: clean || null })
    .eq("id", request.id);
  throwIfSupabaseError(updateError, "Could not record that");
  await audit(request.organizationId, null, "customer_says_paid", request, { has_note: clean.length > 0 });
  return "flagged";
}

// ---- requests from existing records ----------------------------------------------------------

export type Prefill = {
  customer: { name: string; email: string | null; phone: string | null };
  lines: LineItem[];
  link: { registrationId?: number; privateSessionRequestId?: number; reservationId?: number };
  source: string;
  openRequests: { id: number; referenceCode: string; status: RequestStatus; balanceCents: number }[];
};

async function openRequestsFor(orgId: number, column: "registration_id" | "private_session_request_id" | "reservation_id", id: number): Promise<Prefill["openRequests"]> {
  const { data, error } = await getSupabaseAdmin()
    .from("payment_requests")
    .select("id,reference_code,status,total_cents,paid_cents")
    .eq("organization_id", orgId)
    .eq(column, id)
    .in("status", ["draft", "sent", "part_paid"])
    .order("id", { ascending: false });
  throwIfSupabaseError(error, "Could not load open requests");
  return (data ?? []).map((r) => ({ id: Number(r.id), referenceCode: r.reference_code as string, status: r.status as RequestStatus, balanceCents: Math.max(0, Number(r.total_cents) - Number(r.paid_cents)) }));
}

const contact = (name: unknown, email: unknown, phone: unknown) => ({
  name: String(name ?? "").trim(),
  email: typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null,
  phone: typeof phone === "string" && phone.trim() ? normalizePhoneE164(phone) : null,
});

// Futprep "Request payment" on a registration: the child's fee less what's
// already recorded against it.
export async function prefillFromRegistration(orgId: number, registrationId: number): Promise<Prefill | null> {
  const db = getSupabaseAdmin();
  const { data: reg, error } = await db
    .from("registrations")
    .select("id,reference_code,program_id,child_name,parent_name,parent_email,parent_phone,amount_due_cents,payment_frequency")
    .eq("id", registrationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the registration");
  if (!reg) return null;
  const [{ data: program }, { data: payments, error: paymentsError }] = await Promise.all([
    db.from("programs").select("name").eq("id", reg.program_id).maybeSingle(),
    db.from("payments").select("amount_cents").eq("registration_id", registrationId).eq("status", "received"),
  ]);
  throwIfSupabaseError(paymentsError, "Could not total the registration's payments");
  const paidCents = (payments ?? []).reduce((sum, p) => sum + Number(p.amount_cents), 0);
  const line = futprepFeeLine({ programName: (program?.name as string) ?? "Programme", childName: reg.child_name as string, paymentFrequency: reg.payment_frequency as string, amountDueCents: Number(reg.amount_due_cents), paidCents });
  return {
    customer: contact(reg.parent_name, reg.parent_email, reg.parent_phone),
    lines: line ? [line] : [],
    link: { registrationId },
    source: `Registration ${reg.reference_code}`,
    openRequests: await openRequestsFor(orgId, "registration_id", registrationId),
  };
}

export async function prefillFromPrivateSession(orgId: number, sessionId: number): Promise<Prefill | null> {
  const db = getSupabaseAdmin();
  const { data: s, error } = await db
    .from("private_session_requests")
    .select("id,reference_code,child_name,parent_name,parent_email,parent_phone,requested_date,price_cents")
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the private session");
  if (!s) return null;
  const { data: payments, error: paymentsError } = await db.from("payments").select("amount_cents").eq("private_session_request_id", sessionId).eq("status", "received");
  throwIfSupabaseError(paymentsError, "Could not total the session's payments");
  const paidCents = (payments ?? []).reduce((sum, p) => sum + Number(p.amount_cents), 0);
  const due = Math.max(0, Number(s.price_cents ?? 0) - paidCents);
  const label = `Private session ${formatDay(s.requested_date as string)} — ${firstName(s.child_name as string)}`;
  return {
    customer: contact(s.parent_name, s.parent_email, s.parent_phone),
    lines: due > 0 ? [{ label, qty: 1, unitCents: due }] : [],
    link: { privateSessionRequestId: sessionId },
    source: `Private session ${s.reference_code}`,
    openRequests: await openRequestsFor(orgId, "private_session_request_id", sessionId),
  };
}

export async function prefillFromReservation(orgId: number, reservationId: number): Promise<Prefill | null> {
  const db = getSupabaseAdmin();
  const { data: r, error } = await db
    .from("reservations")
    .select("id,reference_code,buyer_name,buyer_email,buyer_phone,items,total_cents,status,payment_status")
    .eq("id", reservationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the reservation");
  if (!r) return null;
  const owing = r.status === "active" && r.payment_status === "pending";
  const items = Array.isArray(r.items) ? (r.items as { title: string; label: string; qty: number; unitCents: number }[]) : [];
  return {
    customer: contact(r.buyer_name, r.buyer_email, r.buyer_phone),
    lines: owing ? items.map((i) => ({ label: `${i.title} (${i.label})`.slice(0, 160), qty: Number(i.qty), unitCents: Number(i.unitCents) })) : [],
    link: { reservationId },
    source: `Reservation ${r.reference_code}`,
    openRequests: await openRequestsFor(orgId, "reservation_id", reservationId),
  };
}

// ---- customers ----------------------------------------------------------------------------

export type CustomerMatch = { name: string; email: string | null; phone: string | null; source: string };

// "Pick a customer": people this business already deals with, from its
// own requests, registrations, private sessions and reservations.
export async function searchCustomers(orgId: number, q: string): Promise<CustomerMatch[]> {
  // Letters, digits and the few marks names, emails and numbers use: no
  // commas, brackets or wildcards to upset the filter.
  const term = q.normalize("NFC").replace(/[^\p{L}\p{N}@.+' -]/gu, "").trim().slice(0, 60);
  if (term.length < 2) return [];
  const db = getSupabaseAdmin();
  const like = `%${term}%`;
  const or = (name: string, email: string, phone: string) => `${name}.ilike.${like},${email}.ilike.${like},${phone}.ilike.${like}`;
  const [requests, registrations, sessions, reservations] = await Promise.all([
    db.from("payment_requests").select("customer_name,customer_email,customer_phone").eq("organization_id", orgId).eq("is_test", false).or(or("customer_name", "customer_email", "customer_phone")).order("id", { ascending: false }).limit(10),
    db.from("registrations").select("parent_name,parent_email,parent_phone").eq("organization_id", orgId).or(or("parent_name", "parent_email", "parent_phone")).order("id", { ascending: false }).limit(10),
    db.from("private_session_requests").select("parent_name,parent_email,parent_phone").eq("organization_id", orgId).or(or("parent_name", "parent_email", "parent_phone")).order("id", { ascending: false }).limit(10),
    db.from("reservations").select("buyer_name,buyer_email,buyer_phone").eq("organization_id", orgId).or(or("buyer_name", "buyer_email", "buyer_phone")).order("id", { ascending: false }).limit(10),
  ]);
  for (const result of [requests, registrations, sessions, reservations]) throwIfSupabaseError(result.error, "Could not search customers");
  const out: CustomerMatch[] = [];
  const seen = new Set<string>();
  const add = (rows: Record<string, unknown>[] | null, keys: [string, string, string], source: string) => {
    for (const row of rows ?? []) {
      const c = contact(row[keys[0]], row[keys[1]], row[keys[2]]);
      if (!c.name || (!c.email && !c.phone)) continue;
      const key = `${c.name.toLowerCase()}|${c.email ?? ""}|${c.phone ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...c, source });
    }
  };
  add(requests.data, ["customer_name", "customer_email", "customer_phone"], "Earlier request");
  add(registrations.data, ["parent_name", "parent_email", "parent_phone"], "Registration");
  add(sessions.data, ["parent_name", "parent_email", "parent_phone"], "Private session");
  add(reservations.data, ["buyer_name", "buyer_email", "buyer_phone"], "Reservation");
  return out.slice(0, 10);
}

// ---- who handles payments --------------------------------------------------------------------

export async function memberCanManagePayments(orgId: number, userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("organization_members").select("can_manage_payments").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
  throwIfSupabaseError(error, "Could not check the payments permission");
  return Boolean(data?.can_manage_payments);
}

export type PaymentTeamMember = { userId: string; name: string; role: string; canManagePayments: boolean };

export async function listPaymentTeam(orgId: number): Promise<PaymentTeamMember[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("organization_members").select("user_id,role,can_manage_payments").eq("organization_id", orgId).order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load the team");
  const ids = (data ?? []).map((m) => m.user_id as string);
  const { data: profiles, error: profileError } = ids.length ? await db.from("profiles").select("user_id,full_name").in("user_id", ids) : { data: [], error: null };
  throwIfSupabaseError(profileError, "Could not load the team's names");
  const names = new Map((profiles ?? []).map((p): [string, string] => [p.user_id as string, (p.full_name as string) || "Team member"]));
  return (data ?? []).map((m) => ({ userId: m.user_id as string, name: names.get(m.user_id as string) ?? "Team member", role: m.role as string, canManagePayments: Boolean(m.can_manage_payments) }));
}

// Owners and admins always handle payments; this switches it on or off for
// one staff member.
export async function setPaymentPermission(orgId: number, userId: string, allowed: boolean, actor: Actor): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_members")
    .update({ can_manage_payments: allowed })
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("role", "org_staff")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not change the payments permission");
  if (!data) throw new Error("NOT_FOUND");
  await logAudit({ actorUserId: actor.userId, organizationId: orgId, action: allowed ? "member.payments_granted" : "member.payments_removed", targetTable: "organization_members", targetId: Number(data.id), after: { user_id: userId, by: actor.name } });
}

// ---- Admin -> Payments ----------------------------------------------------------------------------

export type VolumeReport = { rows: VolumeRow[]; businesses: Map<number, { name: string; slug: string | null }> };

// Payment volume through PortPass by month and by business, for the Kanoo
// conversation and for invoicing later (fees are invoiced from these
// numbers, never deducted). Payments recorded outside a request (the
// Futprep desk) are shown alongside, not mixed in.
export async function paymentVolumeReport(): Promise<VolumeReport> {
  const db = getSupabaseAdmin();
  const [requests, payments, registrations, sessions, orgs] = await Promise.all([
    pageAll<Record<string, unknown>>((from, to) => db.from("payment_requests").select("id,organization_id,sent_at,total_cents,paid_cents,status").eq("is_test", false).order("id").range(from, to), "Could not load payment requests"),
    pageAll<Record<string, unknown>>((from, to) => db.from("payments").select("id,amount_cents,received_at,created_at,status,payment_request_id,registration_id,private_session_request_id").eq("status", "received").order("id").range(from, to), "Could not load payments"),
    pageAll<Record<string, unknown>>((from, to) => db.from("registrations").select("id,organization_id").order("id").range(from, to), "Could not load registrations"),
    pageAll<Record<string, unknown>>((from, to) => db.from("private_session_requests").select("id,organization_id").order("id").range(from, to), "Could not load private sessions"),
    pageAll<Record<string, unknown>>((from, to) => db.from("organizations").select("id,name,slug").order("id").range(from, to), "Could not load businesses"),
  ]);
  // The demo business's example requests and payments are not volume.
  const demoId = await demoOrganizationIdOrNull();
  const requestOrg = new Map(requests.map((r): [number, number] => [Number(r.id), Number(r.organization_id)]));
  const registrationOrg = new Map(registrations.map((r): [number, number | null] => [Number(r.id), r.organization_id === null ? null : Number(r.organization_id)]));
  const sessionOrg = new Map(sessions.map((r): [number, number] => [Number(r.id), Number(r.organization_id)]));
  const volumeRequests: VolumeRequest[] = requests.filter((r) => Number(r.organization_id) !== demoId).map((r) => ({ organizationId: Number(r.organization_id), sentAt: (r.sent_at as string | null) ?? null, totalCents: Number(r.total_cents), paidCents: Number(r.paid_cents), status: r.status as RequestStatus }));
  const volumePayments: VolumePayment[] = [];
  for (const p of payments) {
    const viaRequest = p.payment_request_id !== null;
    const org = viaRequest
      ? requestOrg.get(Number(p.payment_request_id))
      : p.registration_id !== null
        ? registrationOrg.get(Number(p.registration_id))
        : p.private_session_request_id !== null
          ? sessionOrg.get(Number(p.private_session_request_id))
          : null;
    if (org === null || org === undefined || org === demoId) continue;
    volumePayments.push({ organizationId: org, receivedAt: (p.received_at as string | null) ?? (p.created_at as string), amountCents: Number(p.amount_cents), viaRequest });
  }
  return {
    rows: paymentVolume(volumeRequests, volumePayments),
    businesses: new Map(orgs.map((o): [number, { name: string; slug: string | null }] => [Number(o.id), { name: o.name as string, slug: (o.slug as string | null) ?? null }])),
  };
}

// ---- the TEST request (brief 18, E3) ---------------------------------------------------

// One request the owner sends to their own email, to see the customer's
// page and mark it paid once. It is never money: it is flagged, the
// database refuses any payment row against it, and every total leaves it
// out. An open one is reused rather than making another.
export async function createTestRequest(orgId: number, to: { name: string; email: string }, actor: Actor, defaultPrefix: string): Promise<PaymentRequest> {
  const settings = await getPaymentSettings(orgId);
  if (getPaidProblem(settings)) throw new Error("NEEDS_GET_PAID");
  const db = getSupabaseAdmin();
  const { data: open, error } = await db.from("payment_requests").select(REQUEST_COLUMNS).eq("organization_id", orgId).eq("is_test", true).in("status", ["draft", "sent"]).order("id", { ascending: false }).limit(1).maybeSingle();
  throwIfSupabaseError(error, "Could not look for a test request");
  if (open) return toRequest(open);
  const methods = methodsSetUp(settings);
  return createPaymentRequest(
    orgId,
    {
      customerName: `TEST: ${to.name}`.slice(0, 120),
      customerEmail: to.email,
      customerPhone: null,
      personId: null,
      lines: [{ label: "TEST request: nothing to pay", qty: 1, unitCents: 100 }],
      totalCents: 100,
      dueDate: addDays(nassauToday(), settings?.defaultDueDays ?? 7),
      allowPartPayment: false,
      methods,
      offeringId: null,
      registrationId: null,
      privateSessionRequestId: null,
      reservationId: null,
    },
    actor,
    settings?.referencePrefix ?? defaultPrefix,
    { isTest: true },
  );
}

// "Mark paid" on a TEST request: it shows as paid and nothing else happens.
export async function completeTestRequest(orgId: number, id: number, actor: Actor): Promise<PaymentRequest> {
  const { data, error } = await getSupabaseAdmin().rpc("payment_request_complete_test", { p_org: orgId, p_id: id });
  rpcError(error, "Could not finish the test request");
  const request = toRequest(data as Record<string, unknown>);
  await audit(orgId, actor, "test_completed", request, { test: true });
  return request;
}

// ---- Admin -> Payments: who can be paid (brief 18, E5) -----------------------------------

export type PaymentSetupRow = { organizationId: number; name: string; slug: string | null; status: string; isPublished: boolean; methods: RequestMethod[]; problem: string | null };

// Every business that is live or on its way (not a draft nobody has
// submitted, unless it already has payment details), with whether it has
// said how it gets paid. Names of methods only: never the bank details.
export async function listPaymentSetup(): Promise<PaymentSetupRow[]> {
  const db = getSupabaseAdmin();
  const [orgs, settings] = await Promise.all([
    pageAll<Record<string, unknown>>((from, to) => db.from("organizations").select("id,name,slug,status,is_published").eq("is_demo", false).order("name").range(from, to), "Could not load businesses"),
    pageAll<Record<string, unknown>>((from, to) => db.from("organization_payment_settings").select(SETTINGS_COLUMNS).order("organization_id").range(from, to), "Could not load payment settings"),
  ]);
  const byOrg = new Map(settings.map((row) => [Number(row.organization_id), toSettings(row)]));
  return orgs
    .map((org) => {
      const s = byOrg.get(Number(org.id)) ?? null;
      return { organizationId: Number(org.id), name: String(org.name), slug: (org.slug as string | null) ?? null, status: String(org.status ?? ""), isPublished: Boolean(org.is_published), methods: methodsSetUp(s), problem: getPaidProblem(s) };
    })
    .filter((row) => row.status !== "draft" || row.problem === null);
}
