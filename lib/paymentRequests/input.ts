import { nassauLocalToIso, nassauToday } from "@/lib/futprepTerms";
import { normalizePhoneE164 } from "@/lib/phone";
import { addDays, isIsoDate, isRequestMethod, isValidPrefix, linesTotal, methodMissing, REQUEST_METHODS, type LineItem, type ReminderVia, type RequestMethod, type SentVia } from "./rules";

// Payment requests (brief 17): what the business screens may send, checked
// on the server. Each parser returns the clean value or an error code;
// paymentErrorMessage() turns the code into words for the screen.

export const MAX_LINES = 20;
export const MAX_TOTAL_CENTS = 10_000_000; // $100,000
const MAX_UNIT_CENTS = 99_999_999;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): Parsed<T> => ({ ok: false, error });

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalId(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isInteger(n) && n > 0 ? n : null;
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export type RequestInput = {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  personId: number | null;
  lines: LineItem[];
  totalCents: number;
  dueDate: string;
  allowPartPayment: boolean;
  methods: RequestMethod[];
  offeringId: number | null;
  registrationId: number | null;
  privateSessionRequestId: number | null;
  reservationId: number | null;
};

export function parseLines(value: unknown): Parsed<LineItem[]> {
  if (!Array.isArray(value) || value.length === 0) return fail("NEEDS_LINES");
  if (value.length > MAX_LINES) return fail("TOO_MANY_LINES");
  const lines: LineItem[] = [];
  for (const raw of value) {
    const line = (raw ?? {}) as Record<string, unknown>;
    const label = text(line.label, 160);
    const qty = Number(line.qty);
    const unitCents = Number(line.unitCents);
    if (!label) return fail("LINE_NEEDS_LABEL");
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return fail("BAD_QTY");
    if (!Number.isInteger(unitCents) || unitCents < 0 || unitCents > MAX_UNIT_CENTS) return fail("BAD_PRICE");
    lines.push({ label, qty, unitCents });
  }
  const total = linesTotal(lines);
  if (total <= 0) return fail("ZERO_TOTAL");
  if (total > MAX_TOTAL_CENTS) return fail("TOTAL_TOO_BIG");
  return { ok: true, value: lines };
}

// A new or changed request. methodsAvailable is what the business has set
// up how-to-pay details for; a due date in the past is refused for a new
// request (an existing one may keep its date).
export function parseRequestInput(body: Record<string, unknown>, options: { methodsAvailable: RequestMethod[]; today?: string; existingDueDate?: string | null }): Parsed<RequestInput> {
  const today = options.today ?? nassauToday();
  const customerName = text(body.customerName, 120);
  if (!customerName) return fail("NEEDS_CUSTOMER");
  const emailText = text(body.customerEmail, 254).toLowerCase();
  if (emailText && !isEmail(emailText)) return fail("BAD_EMAIL");
  const phoneText = text(body.customerPhone, 40);
  const phone = phoneText ? normalizePhoneE164(phoneText) : null;
  if (phoneText && !phone) return fail("BAD_PHONE");
  if (!emailText && !phone) return fail("NEEDS_CONTACT");

  const lines = parseLines(body.lines);
  if (!lines.ok) return lines;

  const dueDate = body.dueDate;
  if (!isIsoDate(dueDate)) return fail("BAD_DUE_DATE");
  if (dueDate < today && dueDate !== options.existingDueDate) return fail("DUE_DATE_PAST");
  if (dueDate > addDays(today, 366)) return fail("BAD_DUE_DATE");

  const methods = Array.isArray(body.methods) ? [...new Set(body.methods.filter(isRequestMethod))] : [];
  if (methods.length === 0) return fail("NEEDS_METHOD");
  if (methods.some((m) => !options.methodsAvailable.includes(m))) return fail("METHOD_NOT_SET_UP");

  const links = [optionalId(body.registrationId), optionalId(body.privateSessionRequestId), optionalId(body.reservationId)];
  if (links.filter((l) => l !== null).length > 1) return fail("ONE_LINK");

  return {
    ok: true,
    value: {
      customerName,
      customerEmail: emailText || null,
      customerPhone: phone,
      personId: optionalId(body.personId),
      lines: lines.value,
      totalCents: linesTotal(lines.value),
      dueDate,
      allowPartPayment: body.allowPartPayment === true,
      methods,
      offeringId: optionalId(body.offeringId),
      registrationId: links[0],
      privateSessionRequestId: links[1],
      reservationId: links[2],
    },
  };
}

export type MarkPaidInput = { amountCents: number; method: RequestMethod; receivedAt: string; reference: string; note: string };

// "Mark paid": the amount, the method, the day it was received (not in the
// future, not more than a year back) and the transfer reference.
export function parseMarkPaidInput(body: Record<string, unknown>, today: string = nassauToday()): Parsed<MarkPaidInput> {
  const amountCents = Number(body.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail("BAD_AMOUNT");
  if (!isRequestMethod(body.method)) return fail("BAD_METHOD");
  const receivedOn = body.receivedOn;
  if (!isIsoDate(receivedOn) || receivedOn > today || receivedOn < addDays(today, -366)) return fail("BAD_RECEIVED_DATE");
  // Noon in Nassau on that day: the day is what matters, never the hour.
  const receivedAt = receivedOn === today ? new Date().toISOString() : nassauLocalToIso(`${receivedOn}T12:00`);
  if (!receivedAt) return fail("BAD_RECEIVED_DATE");
  return { ok: true, value: { amountCents, method: body.method, receivedAt, reference: text(body.reference, 120), note: text(body.note, 300) } };
}

export function parseSentVia(value: unknown): SentVia | null {
  return value === "whatsapp_link" || value === "email" || value === "in_person" || value === "link" ? value : null;
}

export function parseReminderVia(value: unknown): ReminderVia | null {
  return value === "whatsapp_link" || value === "email" ? value : null;
}

export type SettingsInput = {
  referencePrefix: string;
  bankName: string;
  accountName: string;
  accountNumberLast4: string | null;
  transferInstructions: string;
  kanooHandleOrPhone: string;
  cashNote: string;
  defaultDueDays: number;
  acceptedMethods: RequestMethod[];
};

// How customers pay the business. Only the last four digits of an account
// number are kept in a field of their own; a full number is refused there
// (the business can write it into its transfer instructions, which only a
// request's own page shows).
export function parseSettingsInput(body: Record<string, unknown>): Parsed<SettingsInput> {
  const referencePrefix = text(body.referencePrefix, 8).toUpperCase();
  if (!isValidPrefix(referencePrefix)) return fail("BAD_PREFIX");
  const last4Text = text(body.accountNumberLast4, 40).replace(/[\s-]/g, "");
  if (last4Text && !/^\d{4}$/.test(last4Text)) return fail("LAST4_ONLY");
  const defaultDueDays = Number(body.defaultDueDays ?? 7);
  if (!Number.isInteger(defaultDueDays) || defaultDueDays < 0 || defaultDueDays > 90) return fail("BAD_DUE_DAYS");
  const details = {
    bankName: text(body.bankName, 120),
    accountName: text(body.accountName, 120),
    accountNumberLast4: last4Text || null,
    transferInstructions: text(body.transferInstructions, 1000),
    kanooHandleOrPhone: text(body.kanooHandleOrPhone, 80),
    cashNote: text(body.cashNote, 300),
  };
  // The methods the business picked (brief 18, E1): at least one, each a
  // real method (never a card), each with its details.
  if (!Array.isArray(body.acceptedMethods)) return fail("NEEDS_GET_PAID_METHOD");
  const acceptedMethods = REQUEST_METHODS.filter((method) => (body.acceptedMethods as unknown[]).includes(method));
  if ((body.acceptedMethods as unknown[]).some((method) => !isRequestMethod(method))) return fail("METHOD_NOT_AVAILABLE");
  if (acceptedMethods.length === 0) return fail("NEEDS_GET_PAID_METHOD");
  if (acceptedMethods.includes("bank_transfer") && methodMissing(details, "bank_transfer")) return fail("BANK_NEEDS_DETAILS");
  if (acceptedMethods.includes("kanoo_wallet_manual") && methodMissing(details, "kanoo_wallet_manual")) return fail("KANOO_NEEDS_HANDLE");
  return { ok: true, value: { referencePrefix, ...details, defaultDueDays, acceptedMethods } };
}

const MESSAGES: Record<string, string> = {
  NEEDS_CUSTOMER: "Add the customer's name.",
  BAD_EMAIL: "That email address doesn't look right.",
  BAD_PHONE: "That phone number doesn't look right. Use 7 or 10 digits, or start with +.",
  NEEDS_CONTACT: "Add the customer's phone or email, so the request can reach them.",
  NEEDS_LINES: "Add at least one line.",
  TOO_MANY_LINES: `A request can have up to ${MAX_LINES} lines.`,
  LINE_NEEDS_LABEL: "Every line needs to say what it's for.",
  BAD_QTY: "Quantities are whole numbers from 1 to 999.",
  BAD_PRICE: "Check the prices: dollars and cents, nothing negative.",
  ZERO_TOTAL: "The total has to be more than $0.",
  TOTAL_TOO_BIG: "A single request can be up to $100,000.",
  BAD_DUE_DATE: "Pick a due date within the next year.",
  DUE_DATE_PAST: "The due date can't be in the past.",
  NEEDS_METHOD: "Pick at least one way the customer can pay.",
  NEEDS_GET_PAID: "Add how you get paid first: Payments → Settings.",
  NEEDS_GET_PAID_METHOD: "Pick at least one way customers can pay you: cash, bank transfer or a Kanoo wallet transfer.",
  METHOD_NOT_AVAILABLE: "That way of paying isn't available. Card payments are coming with a licensed partner.",
  BANK_NEEDS_DETAILS: "Bank transfer needs the bank, the account name, and the last four digits of the account or your transfer instructions.",
  KANOO_NEEDS_HANDLE: "A Kanoo wallet transfer needs your Kanoo handle or number.",
  NOT_A_TEST: "That isn't a test request.",
  TEST_REQUEST: "A test request can't take a real payment.",
  NO_OWN_EMAIL: "A test request goes to your own PortPass account's email. Sign in with your PortPass account to send one.",
  METHOD_NOT_SET_UP: "Add how customers pay you in Payments → Settings before offering that method.",
  ONE_LINK: "A request can come from one record at most.",
  BAD_AMOUNT: "Enter the amount received.",
  OVER_BALANCE: "That's more than the balance.",
  PART_NOT_ALLOWED: "This request is for the full balance. Allow part payments on it first, or enter the full amount.",
  BAD_METHOD: "Pick how it was paid.",
  BAD_RECEIVED_DATE: "Pick the day it was received (today or earlier).",
  BAD_PREFIX: "The reference letters are two to four capital letters, like FP.",
  LAST4_ONLY: "Only the last four digits of the account number go here.",
  BAD_DUE_DAYS: "Days to pay is a whole number from 0 to 90.",
  NOT_FOUND: "That request wasn't found.",
  VOID: "That request was voided.",
  ALREADY_PAID: "That request is already paid in full.",
  HAS_PAYMENTS: "Money has been recorded against this request. Record a refund on the payment instead.",
  NEEDS_REASON: "Say why it's being voided.",
  NOT_SENT_YET: "Send the request first.",
  NO_EMAIL: "This customer has no email address. Send it by WhatsApp or copy the link.",
  EMAIL_FAILED: "The email couldn't be sent. Try again, or send it by WhatsApp.",
  NOT_OVERDUE: "Only overdue requests are chased.",
  LINK_NOT_FOUND: "That record wasn't found for this business.",
  ALREADY_REFUNDED: "That payment was already refunded.",
  NEEDS_REFUND_NOTE: "Say what was refunded and how.",
  NOTHING_DUE: "Nothing is due on that record.",
};

export function paymentErrorMessage(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Try again.";
}

export function isPaymentErrorCode(code: string): boolean {
  return code in MESSAGES;
}
