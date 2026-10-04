import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as payRoute } from "@/app/api/pay/[token]/route";
import { POST as createRoute } from "@/app/api/payments/orgs/[id]/requests/route";
import { POST as actionRoute } from "@/app/api/payments/orgs/[id]/requests/[requestId]/route";
import { PATCH as refundRoute, POST as markPaidRoute } from "@/app/api/payments/orgs/[id]/requests/[requestId]/payments/route";
import { POST as testRequestRoute } from "@/app/api/payments/orgs/[id]/test-request/route";
import { sendEmail } from "@/lib/email";
import { nassauToday } from "@/lib/futprepTerms";
import { paymentsApiAccess, type PaymentsAccess } from "@/lib/paymentRequests/access";
import { addDays, chaseList, isOverdue } from "@/lib/paymentRequests/rules";
import { createDraftBusiness, getBusiness } from "./business";
import {
  customerSaysPaid,
  getPaymentRequest,
  getPublicPaymentRequest,
  listPaymentRequests,
  listPaymentSetup,
  paymentVolumeReport,
  prefillFromRegistration,
  recordRequestPayment,
  savePaymentSettings,
  updatePaymentRequest,
} from "./paymentRequests";
import { voidFutprepPayment } from "./staff";

// Payment requests (brief 17) against the local Supabase stack, with a TEST
// business, TEST customers and a TEST registration, all deleted afterwards.
// No email leaves: sendEmail is replaced, and every address is on the
// reserved test domain anyway. Who may call the routes is tested in
// lib/paymentRequests/rules.test.ts; here the door is held open for the
// TEST business's owner.
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/email")>()), sendEmail: vi.fn(async () => "sent" as const) }));
vi.mock("@/lib/paymentRequests/access", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/paymentRequests/access")>()), paymentsApiAccess: vi.fn() }));

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
const MARK = "TEST — delete";
const today = nassauToday();
let userId = "";
let orgId = 0;
let otherOrgId = 0;
let prefix = "";
let programId = 0;
let registrationId = 0;
let ip = 0;

const actor = () => ({ userId, name: `${MARK} owner` });
const access = (): PaymentsAccess => ({ orgId, orgName: `${MARK} Pay Biz ${tag}`, orgSlug: null, door: "business", actor: actor(), actorEmail: `pay-owner-${tag}@test.portpass.local`, canEditSettings: true, canManageTeam: true, basePath: "/business/test/payments" });

function call(handler: (request: Request, ctx: never) => Promise<Response>, path: string, params: Record<string, string>, body: unknown, method = "POST") {
  ip += 1;
  const request = new Request(`https://portpass.test${path}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": `10.17.0.${ip}` }, body: JSON.stringify(body) });
  return handler(request, { params: Promise.resolve(params) } as never);
}

const newRequest = (over: Record<string, unknown> = {}) => ({
  customerName: `${MARK} Customer`,
  customerPhone: "242-555-0177",
  customerEmail: `pay-customer-${tag}@test.portpass.local`,
  lines: [{ label: "TEST term fee", qty: 1, unitCents: 40000 }, { label: "TEST kit", qty: 2, unitCents: 1000 }],
  dueDate: addDays(today, 7),
  methods: ["bank_transfer", "cash"],
  allowPartPayment: false,
  ...over,
});

async function create(over: Record<string, unknown> = {}): Promise<number> {
  const response = await call(createRoute, `/api/payments/orgs/${orgId}/requests`, { id: String(orgId) }, newRequest(over));
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: number }).id;
}

const act = (id: number, body: Record<string, unknown>) => call(actionRoute, `/api/payments/orgs/${orgId}/requests/${id}`, { id: String(orgId), requestId: String(id) }, body);
const markPaid = (id: number, amountCents: number, method = "bank_transfer") =>
  call(markPaidRoute, `/api/payments/orgs/${orgId}/requests/${id}/payments`, { id: String(orgId), requestId: String(id) }, { amountCents, method, receivedOn: today, reference: "TEST-REF" });

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `pay-owner-${tag}@test.portpass.local`, email_confirm: true });
  expect(created.error).toBeNull();
  userId = created.data.user!.id;
  await admin.from("profiles").upsert({ user_id: userId, full_name: `${MARK} owner` });

  orgId = (await createDraftBusiness({ name: `${MARK} Pay Biz ${tag}`, section: "shop", subcategory: null, ownerUserId: userId, actorUserId: userId })).id;
  otherOrgId = (await createDraftBusiness({ name: `${MARK} Other Pay Biz ${tag}`, section: "shop", subcategory: null, ownerUserId: null, actorUserId: userId })).id;

  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
  prefix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => letters[b % letters.length]).join("");
  await savePaymentSettings(orgId, { referencePrefix: prefix, bankName: "TEST Bank", accountName: MARK, accountNumberLast4: "0000", transferInstructions: "TEST — transit 00000, account TEST", kanooHandleOrPhone: "", cashNote: "TEST desk", defaultDueDays: 7, acceptedMethods: ["bank_transfer", "cash"] }, actor());

  // A TEST class and a child registered on it, as the Futprep desk has them.
  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: orgId, slug: `test-delete-pay-${tag}`, name: "TEST Kickers", age_min: 3, age_max: 6, location: "TEST field", day_of_week: "Saturday", start_time: "10:00 AM", capacity: 20 })
    .select("id")
    .single();
  expect(programError).toBeNull();
  programId = Number(program!.id);
  const { data: term, error: termError } = await admin.from("program_terms").insert({ program_id: programId, name: "TEST Term", start_date: today, end_date: addDays(today, 70), weekly_fee_cents: 4500, term_fee_cents: 42000 }).select("id").single();
  expect(termError).toBeNull();
  const { data: reg, error: regError } = await admin
    .from("registrations")
    .insert({
      reference_code: `FP-TEST-${tag.toUpperCase()}`, organization_id: orgId, program_id: programId, term_id: term!.id,
      parent_name: `${MARK} Parent`, parent_email: `pay-parent-${tag}@test.portpass.local`, parent_phone: "242 555 0188",
      child_name: "Amara TEST Smith", allergies: "TEST — must never appear", payment_frequency: "term", payment_method: "bank_transfer", amount_due_cents: 42000,
      registration_status: "confirmed", payment_status: "partial", consent_version: "test", consent_accepted: true, submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(regError).toBeNull();
  registrationId = Number(reg!.id);
  // $100 already recorded on the desk.
  const { error: paymentError } = await admin.from("payments").insert({ registration_id: registrationId, amount_cents: 10000, method: "cash", status: "received", note: MARK, received_at: new Date().toISOString() });
  expect(paymentError).toBeNull();
});

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
  vi.mocked(paymentsApiAccess).mockImplementation(async (id: number) =>
    id === orgId ? { ok: true as const, access: access() } : { ok: false as const, response: Response.json({ error: "Not allowed." }, { status: 403 }) as never },
  );
});

afterAll(async () => {
  if (registrationId) await admin.from("registrations").delete().eq("id", registrationId);
  if (programId) await admin.from("programs").delete().eq("id", programId);
  for (const id of [orgId, otherOrgId].filter(Boolean)) {
    await admin.from("audit_log").delete().eq("organization_id", id);
    const { error } = await admin.from("organizations").delete().eq("id", id);
    expect(error).toBeNull();
  }
  await admin.from("message_log").delete().like("template", "payment_%").like("recipient", `%${tag}@test.portpass.local`);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("create → send", () => {
  it("creates a draft with the business's next number and sends nothing", async () => {
    const id = await create();
    const found = await getPaymentRequest(orgId, id);
    expect(found?.request.referenceCode).toMatch(new RegExp(`^${prefix}-\\d{4}$`));
    expect(found?.request.status).toBe("draft");
    expect(found?.request.totalCents).toBe(42000);
    expect(found?.request.customerPhone).toBe("+12425550177");
    expect(found?.request.publicToken).toMatch(/^[a-f0-9]{40}$/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("marks it sent when staff press WhatsApp, still without any email", async () => {
    const id = await create();
    const response = await act(id, { action: "send", via: "whatsapp_link" });
    expect(response.status).toBe(200);
    const { request } = (await getPaymentRequest(orgId, id))!;
    expect(request.status).toBe("sent");
    expect(request.sentVia).toBe("whatsapp_link");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails once, only when staff press Send by email", async () => {
    const id = await create();
    expect(sendEmail).not.toHaveBeenCalled();
    const response = await act(id, { action: "send", via: "email" });
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe(`pay-customer-${tag}@test.portpass.local`);
    expect(mail.subject).toContain("Payment request");
    expect(mail.html).toContain("PortPass never holds your money.");
    if (mail.from) expect(mail.from).toContain(" via PortPass\" <");
    expect((await getPaymentRequest(orgId, id))!.request.sentVia).toBe("email");
  });

  it("refuses a method the business hasn't set up", async () => {
    const response = await call(createRoute, `/api/payments/orgs/${orgId}/requests`, { id: String(orgId) }, newRequest({ methods: ["kanoo_wallet_manual"] }));
    expect(response.status).toBe(400);
  });
});

describe("mark paid", () => {
  it("part payment → part paid, the rest → paid, each with a receipt number", async () => {
    const id = await create({ allowPartPayment: true });
    await act(id, { action: "send", via: "link" });
    const first = await markPaid(id, 12000);
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { status: string; receiptNumber: string };
    expect(firstBody.status).toBe("part_paid");
    expect(firstBody.receiptNumber).toMatch(new RegExp(`^${prefix}-R\\d{4}$`));
    expect((await getPaymentRequest(orgId, id))!.request.paidCents).toBe(12000);

    const second = await markPaid(id, 30000, "kanoo_wallet_manual");
    const secondBody = (await second.json()) as { status: string; receiptNumber: string };
    expect(secondBody.status).toBe("paid");
    expect(secondBody.receiptNumber).not.toBe(firstBody.receiptNumber);
    const { request, payments } = (await getPaymentRequest(orgId, id))!;
    expect(request.paidAt).not.toBeNull();
    expect(payments.map((p) => p.receiptNumber)).toEqual([firstBody.receiptNumber, secondBody.receiptNumber]);
    expect((await markPaid(id, 100)).status).toBe(409);
  });

  it("takes only the full balance when part payments aren't allowed, and never more", async () => {
    const id = await create();
    await act(id, { action: "send", via: "in_person" });
    const part = await markPaid(id, 1000);
    expect(part.status).toBe(400);
    expect(((await part.json()) as { code: string }).code).toBe("PART_NOT_ALLOWED");
    expect((await markPaid(id, 42001)).status).toBe(400);
    expect((await markPaid(id, 42000)).status).toBe(201);
    expect((await getPaymentRequest(orgId, id))!.request.status).toBe("paid");
  });

  it("a refund puts the balance back, keeping the payment in the history", async () => {
    const id = await create({ allowPartPayment: true });
    await act(id, { action: "send", via: "link" });
    const paid = (await (await markPaid(id, 5000)).json()) as { paymentId: number };
    const refund = await call(refundRoute, `/api/payments/orgs/${orgId}/requests/${id}/payments`, { id: String(orgId), requestId: String(id) }, { paymentId: paid.paymentId, note: "TEST — refunded by transfer" }, "PATCH");
    expect(refund.status).toBe(200);
    const { request, payments } = (await getPaymentRequest(orgId, id))!;
    expect(request.status).toBe("sent");
    expect(request.paidCents).toBe(0);
    expect(payments[0]).toMatchObject({ status: "refunded", refundNote: "TEST — refunded by transfer" });
  });
});

describe("overdue", () => {
  it("is derived from the due date in Nassau, never stored", async () => {
    const id = await create();
    await act(id, { action: "send", via: "whatsapp_link" });
    await admin.from("payment_requests").update({ due_date: addDays(today, -3) }).eq("id", id);
    const rows = await listPaymentRequests(orgId);
    const row = rows.find((r) => r.id === id)!;
    expect(row.status).toBe("sent");
    expect(isOverdue(row, today)).toBe(true);
    expect(chaseList(rows, today).map((r) => r.id)).toContain(id);
    const remind = await act(id, { action: "remind", via: "whatsapp_link" });
    expect(remind.status).toBe(200);
    expect((await getPaymentRequest(orgId, id))!.request.lastRemindedAt).not.toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("I've paid", () => {
  it("flags the request for staff without changing its status", async () => {
    const id = await create();
    await act(id, { action: "send", via: "whatsapp_link" });
    const token = (await getPaymentRequest(orgId, id))!.request.publicToken;
    const response = await call(payRoute, `/api/pay/${token}`, { token }, { note: "TEST — sent by transfer, ref 1234" });
    expect(response.status).toBe(200);
    const { request } = (await getPaymentRequest(orgId, id))!;
    expect(request.status).toBe("sent");
    expect(request.paidCents).toBe(0);
    expect(request.customerSaysPaidAt).not.toBeNull();
    expect(request.customerSaysPaidNote).toBe("TEST — sent by transfer, ref 1234");

    // Staff confirm: marking it paid clears the flag.
    expect((await markPaid(id, 42000)).status).toBe(201);
    expect((await getPaymentRequest(orgId, id))!.request.customerSaysPaidAt).toBeNull();
    expect(await customerSaysPaid(token, "again")).toBe("closed");
    expect((await call(payRoute, `/api/pay/${"0".repeat(40)}`, { token: "0".repeat(40) }, {})).status).toBe(404);
  });
});

describe("void", () => {
  it("needs a reason, stays in the history, and is refused once money is recorded", async () => {
    const id = await create({ allowPartPayment: true });
    await act(id, { action: "send", via: "link" });
    expect((await act(id, { action: "void", reason: " " })).status).toBe(400);
    await markPaid(id, 1000);
    const refused = await act(id, { action: "void", reason: "TEST — changed our mind" });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { code: string }).code).toBe("HAS_PAYMENTS");

    const other = await create();
    const voided = await act(other, { action: "void", reason: "TEST — sent to the wrong parent" });
    expect(voided.status).toBe(200);
    const { request } = (await getPaymentRequest(orgId, other))!;
    expect(request.status).toBe("void");
    expect(request.voidedReason).toBe("TEST — sent to the wrong parent");
    expect((await markPaid(other, 42000)).status).toBe(409);
    expect((await getPublicPaymentRequest(request.publicToken))!.request.status).toBe("void");
  });
});

describe("who can see a request", () => {
  it("another business can't read or change it", async () => {
    const id = await create();
    expect(await getPaymentRequest(otherOrgId, id)).toBeNull();
    await expect(recordRequestPayment(otherOrgId, id, { amountCents: 42000, method: "cash", receivedAt: new Date().toISOString(), reference: "", note: "" }, actor())).rejects.toThrow("NOT_FOUND");
    const parsed = { customerName: "x", customerEmail: null, customerPhone: "+12425550100", personId: null, lines: [{ label: "x", qty: 1, unitCents: 1 }], totalCents: 1, dueDate: today, allowPartPayment: false, methods: ["cash" as const], offeringId: null, registrationId: null, privateSessionRequestId: null, reservationId: null };
    await expect(updatePaymentRequest(otherOrgId, id, parsed, actor())).rejects.toThrow("NOT_FOUND");
    expect((await call(actionRoute, `/api/payments/orgs/${otherOrgId}/requests/${id}`, { id: String(otherOrgId), requestId: String(id) }, { action: "void", reason: "x" })).status).toBe(403);
  });

  it("the public page works by token only, without the customer's contact details", async () => {
    const id = await create();
    const { request } = (await getPaymentRequest(orgId, id))!;
    const view = await getPublicPaymentRequest(request.publicToken);
    expect(view?.request.referenceCode).toBe(request.referenceCode);
    expect(JSON.stringify(view)).not.toContain("pay-customer-");
    expect(JSON.stringify(view)).not.toContain("+12425550177");
    expect(await getPublicPaymentRequest(String(id))).toBeNull();
    expect(await getPublicPaymentRequest(request.publicToken.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBeNull();
  });

  it("browsers can't read payment requests or call the functions", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { data } = await anon.from("payment_requests").select("id").limit(1);
    expect(data ?? []).toEqual([]);
    const { data: settings } = await anon.from("organization_payment_settings").select("organization_id").limit(1);
    expect(settings ?? []).toEqual([]);
    const { error } = await anon.rpc("payment_request_record_payment", { p: { organization_id: orgId, request_id: 1, amount_cents: 1 } });
    expect(error).not.toBeNull();
  });
});

describe("Futprep: request payment from a registration", () => {
  it("asks for the term fee less what's already recorded, and paying it updates the registration", async () => {
    const prefill = (await prefillFromRegistration(orgId, registrationId))!;
    expect(prefill.lines).toEqual([{ label: "TEST Kickers term fee (balance) — Amara", qty: 1, unitCents: 42000 - 10000 }]);
    expect(prefill.customer).toEqual({ name: `${MARK} Parent`, email: `pay-parent-${tag}@test.portpass.local`, phone: "+12425550188" });
    expect(JSON.stringify(prefill)).not.toContain("must never appear");
    expect(JSON.stringify(prefill)).not.toContain("Smith");
    expect(await prefillFromRegistration(otherOrgId, registrationId)).toBeNull();

    const id = await create({ customerName: prefill.customer.name, customerEmail: prefill.customer.email, customerPhone: prefill.customer.phone, lines: prefill.lines, registrationId });
    expect((await prefillFromRegistration(orgId, registrationId))!.openRequests.map((r) => r.id)).toContain(id);
    await act(id, { action: "send", via: "whatsapp_link" });
    const paid = (await (await markPaid(id, 32000)).json()) as { paymentId: number };

    const { data: registration } = await admin.from("registrations").select("payment_status").eq("id", registrationId).single();
    expect(registration!.payment_status).toBe("paid");
    const { data: payment } = await admin.from("payments").select("registration_id,payment_request_id,receipt_number").eq("id", paid.paymentId).single();
    expect(payment).toMatchObject({ registration_id: registrationId, payment_request_id: id });
    // The desk can't delete a payment that has a receipt: it's refunded on the request.
    await expect(voidFutprepPayment({ paymentId: paid.paymentId, voidedBy: MARK })).rejects.toThrow("payment request");
    expect((await prefillFromRegistration(orgId, registrationId))!.lines).toEqual([]);
  });
});

describe("Admin -> Payments", () => {
  it("counts this business's requests and recorded payments by month", async () => {
    const { rows, businesses } = await paymentVolumeReport();
    const mine = rows.filter((r) => r.organizationId === orgId);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.reduce((sum, r) => sum + r.requestsSent, 0)).toBeGreaterThan(3);
    expect(mine.reduce((sum, r) => sum + r.recordedPaidCents, 0)).toBeGreaterThan(0);
    expect(mine.reduce((sum, r) => sum + r.otherRecordedCents, 0)).toBe(10000);
    expect(businesses.get(orgId)?.name).toContain("Pay Biz");
  });
});

describe("Get paid (brief 18, E)", () => {
  it("keeps the business's page and shop in step with how it says it gets paid", async () => {
    const business = (await getBusiness(orgId))!;
    expect(business.paymentMethods.sort()).toEqual(["bank_transfer", "cash"]);
    // Only the last four digits have a field; the full number is only in the business's own words.
    expect(business.bankTransferDetails).toMatchObject({ bank: "TEST Bank", accountNumber: "Ending 0000", instructions: "TEST — transit 00000, account TEST" });
    const setup = await listPaymentSetup();
    expect(setup.find((row) => row.organizationId === orgId)).toMatchObject({ problem: null, methods: ["bank_transfer", "cash"] });
    // Bank details never leave with the list.
    expect(JSON.stringify(setup)).not.toContain("transit 00000");
  });

  it("refuses a request from a business that hasn't said how it gets paid", async () => {
    vi.mocked(paymentsApiAccess).mockResolvedValue({ ok: true, access: { ...access(), orgId: otherOrgId } });
    const response = await call(createRoute, `/api/payments/orgs/${otherOrgId}/requests`, { id: String(otherOrgId) }, newRequest({ methods: ["cash"] }));
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("NEEDS_GET_PAID");
    const test = await call(testRequestRoute, `/api/payments/orgs/${otherOrgId}/test-request`, { id: String(otherOrgId) }, {});
    expect(((await test.json()) as { code: string }).code).toBe("NEEDS_GET_PAID");
    vi.mocked(paymentsApiAccess).mockResolvedValue({ ok: true, access: access() });
  });

  it("sends a TEST request to the owner's own email, and marking it paid records no money", async () => {
    vi.mocked(sendEmail).mockClear();
    const response = await call(testRequestRoute, `/api/payments/orgs/${orgId}/test-request`, { id: String(orgId) }, { email: "someone-else@test.portpass.local" });
    expect(response.status).toBe(201);
    const sent = (await response.json()) as { id: number; payUrl: string; email: string; emailed: boolean };
    // The address comes from the session, never from the request.
    expect(sent.email).toBe(`pay-owner-${tag}@test.portpass.local`);
    expect(sent.emailed).toBe(true);
    expect(vi.mocked(sendEmail).mock.calls).toHaveLength(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(`pay-owner-${tag}@test.portpass.local`);

    // Pressing again reuses the open one: no second request, no second email.
    const again = (await (await call(testRequestRoute, `/api/payments/orgs/${orgId}/test-request`, { id: String(orgId) }, {})).json()) as { id: number };
    expect(again.id).toBe(sent.id);
    expect(vi.mocked(sendEmail).mock.calls).toHaveLength(1);

    const found = (await getPaymentRequest(orgId, sent.id))!;
    expect(found.request).toMatchObject({ isTest: true, status: "sent", totalCents: 100 });
    expect(found.request.customerName).toMatch(/^TEST: /);
    const view = (await getPublicPaymentRequest(sent.payUrl.split("/pay/")[1]))!;
    expect(view.request.isTest).toBe(true);

    // The database refuses real money against it, whatever asks.
    await expect(recordRequestPayment(orgId, sent.id, { amountCents: 100, method: "cash", receivedAt: new Date().toISOString(), reference: "", note: "" }, actor())).rejects.toThrow();
    const direct = await admin.from("payments").insert({ payment_request_id: sent.id, amount_cents: 100, method: "cash", status: "received", recorded_by: MARK });
    expect(direct.error).not.toBeNull();

    const before = await paymentVolumeReport();
    const paid = await markPaid(sent.id, 100, "cash");
    expect(paid.status).toBe(201);
    expect((await paid.json()) as { test?: boolean; status?: string }).toMatchObject({ test: true, status: "paid" });
    expect((await getPaymentRequest(orgId, sent.id))!.payments).toHaveLength(0);
    const { count } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("payment_request_id", sent.id);
    expect(count).toBe(0);
    // Nothing in Admin -> Payments moved.
    const after = await paymentVolumeReport();
    const total = (report: typeof before) => report.rows.filter((r) => r.organizationId === orgId).reduce((sum, r) => sum + r.requestsSent * 1_000_000 + r.recordedPaidCents + r.requestedCents, 0);
    expect(total(after)).toBe(total(before));
  });
});
