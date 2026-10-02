import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addManualEvent,
  billingExport,
  claimReminder,
  completeWedding,
  createManualInvoice,
  getAccount,
  getBillingOverview,
  getInvoice,
  getPlanCard,
  invoiceAsSent,
  listEvents,
  listInvoices,
  markInvoiceSent,
  recordReceipt,
  redraftPeriod,
  removeEvent,
  reverseReceipt,
  runDailyBilling,
  saveAccount,
  saveBankDetails,
  voidInvoice,
  WEDDING_COORDINATION_FEE_CENTS,
  type AccountInput,
} from "./billing";
import { createDraftBusiness } from "./business";
import { createWeddingLead } from "./weddingLeads";

// PortPass billing (brief 09, parts 2 and 3) against CI's local Supabase
// stack: the free period, the daily job drafting once however often it
// runs, sending blocked without bank details, overdue and the 14-day stop,
// receipts, the wedding coordination fee, and what a business sees of its
// own plan. Every business, person and invoice is "TEST — delete" and
// removed afterwards. No email is ever sent: the addresses are test ones.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let founder = "";
let orgId = 0;
let otherOrgId = 0;
let weddingsId = 0;
let weddingLeadId = 0;
let hadWeddingAccount = false;
let soloInvoiceId = 0;
let scheduleOrgId = 0;
// Invoices this file voided for the wedding business: no fee points at them any more.
const voidedWeddingInvoices: number[] = [];

const account = (over: Partial<AccountInput> = {}): AccountInput => ({
  planCode: "solo", cycle: "monthly", priceCents: 6500, annualMonthsCharged: 10, retainerCents: 0, extraLocations: 0, extraLocationCents: 2500, commissionBps: 0, goLiveOn: "2026-10-05",
  freeMonthsCredit: 0, creditReason: null, freeUntilOverride: null, freeUntilOverrideReason: null, setupFeeCents: 0, setupStatus: "waived", agreementSignedOn: null, agreementVersion: null,
  billingEmail: `test-delete-billing-${TAG}@test.portpass.local`, billingWhatsappE164: null, paused: false, ended: false, statusReason: null, notes: null, ...over,
});

const BANK = { bank: "TEST Bank", accountName: "PortPass Bahamas Technologies", accountNumber: "0000000", branch: "TEST Main" };

async function removeBilling(organizationId: number) {
  const { data: invoices } = await admin.from("portpass_invoices").select("id").eq("organization_id", organizationId);
  const ids = (invoices ?? []).map((invoice) => invoice.id);
  if (ids.length) await admin.from("portpass_receipts").delete().in("invoice_id", ids);
  await admin.from("billing_events").delete().eq("organization_id", organizationId).in("source_table", ["manual", "wedding_leads"]);
  if (ids.length) await admin.from("portpass_invoices").delete().in("id", ids);
  await admin.from("billing_reminders").delete().eq("organization_id", organizationId);
}

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `test-delete-billing-founder-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  founder = created.data.user.id;
  orgId = (await createDraftBusiness({ name: `TEST delete ${TAG} Billing Solo`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder })).id;
  otherOrgId = (await createDraftBusiness({ name: `TEST delete ${TAG} Billing Other`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder })).id;
  scheduleOrgId = (await createDraftBusiness({ name: `TEST delete ${TAG} Billing Schedule`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder })).id;
  const { data: weddings } = await admin.from("organizations").select("id").eq("slug", "bahamas-weddings").maybeSingle();
  weddingsId = weddings ? Number(weddings.id) : 0;
  if (weddingsId) hadWeddingAccount = Boolean(await getAccount(weddingsId));
  await admin.from("site_content").delete().eq("key", "billing_bank");
});

afterAll(async () => {
  for (const id of [orgId, otherOrgId, scheduleOrgId]) {
    if (!id) continue;
    await removeBilling(id);
    await admin.from("billing_accounts").delete().eq("organization_id", id);
    await admin.from("audit_log").delete().eq("organization_id", id);
    await admin.from("organizations").delete().eq("id", id);
  }
  if (weddingsId) {
    // Only what this file made for the wedding business.
    if (weddingLeadId) {
      const { data: events } = await admin.from("billing_events").select("id,invoice_line_id").eq("source_table", "wedding_leads").eq("source_id", weddingLeadId);
      const lineIds = (events ?? []).map((event) => event.invoice_line_id).filter(Boolean);
      if (lineIds.length) {
        const { data: lines } = await admin.from("portpass_invoice_lines").select("invoice_id").in("id", lineIds);
        const invoiceIds = (lines ?? []).map((line) => line.invoice_id);
        await admin.from("billing_events").delete().eq("source_table", "wedding_leads").eq("source_id", weddingLeadId);
        if (invoiceIds.length) await admin.from("portpass_invoices").delete().in("id", invoiceIds);
      } else await admin.from("billing_events").delete().eq("source_table", "wedding_leads").eq("source_id", weddingLeadId);
      await admin.from("wedding_leads").delete().eq("id", weddingLeadId);
    }
    if (voidedWeddingInvoices.length) await admin.from("portpass_invoices").delete().in("id", voidedWeddingInvoices);
    if (!hadWeddingAccount) await admin.from("billing_accounts").delete().eq("organization_id", weddingsId);
  }
  await admin.from("site_content").delete().eq("key", "billing_bank");
  if (founder) {
    await admin.from("audit_log").delete().eq("actor_user_id", founder);
    await admin.auth.admin.deleteUser(founder);
  }
});

describe("a Solo business that goes live", () => {
  it("is free for 30 days, and its first invoice is the day after", async () => {
    const saved = await saveAccount(orgId, account(), founder, "2026-10-05");
    expect(saved).toMatchObject({ status: "trial", freeUntil: "2026-11-04", firstInvoiceOn: "2026-11-05", nextInvoiceOn: "2026-11-05", priceCents: 6500 });
  });

  it("moves both dates by two months with a two-month credit, which needs its reason", async () => {
    await expect(saveAccount(orgId, account({ freeMonthsCredit: 2 }), founder, "2026-10-05")).rejects.toThrow("CREDIT_REASON_REQUIRED");
    const credited = await saveAccount(orgId, account({ freeMonthsCredit: 2, creditReason: "TEST signage sponsor: banner" }), founder, "2026-10-05");
    expect(credited).toMatchObject({ freeUntil: "2027-01-04", firstInvoiceOn: "2027-01-05" });
    await expect(saveAccount(orgId, account({ freeUntilOverride: "2026-12-05" }), founder, "2026-10-05")).rejects.toThrow("OVERRIDE_REASON_REQUIRED");
    await expect(saveAccount(orgId, account({ paused: true }), founder, "2026-10-05")).rejects.toThrow("STATUS_REASON_REQUIRED");
    // Back to the plain account for the rest of the file.
    await saveAccount(orgId, account(), founder, "2026-10-05");
    const { data: logged } = await admin.from("audit_log").select("action").eq("organization_id", orgId).like("action", "billing.account.%");
    expect(logged!.map((row) => row.action)).toEqual(expect.arrayContaining(["billing.account.created", "billing.account.updated"]));
  });
});

describe("the daily job", () => {
  it("drafts nothing during the free period", async () => {
    await runDailyBilling("2026-11-04");
    expect(await listInvoices({ organizationId: orgId })).toEqual([]);
  });

  it("drafts the first invoice the day after, for $65, and running it twice still makes one", async () => {
    await runDailyBilling("2026-11-05");
    await runDailyBilling("2026-11-05");
    const invoices = await listInvoices({ organizationId: orgId });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ kind: "subscription", status: "draft", periodStart: "2026-11-05", periodEnd: "2026-12-04", totalCents: 6500, vatCents: 0 });
    expect(invoices[0].number).toMatch(/^PP-2026-\d{3,}$/);
    soloInvoiceId = invoices[0].id;
    const detail = await getInvoice(soloInvoiceId);
    expect(detail!.lines.map((line) => [line.source, line.amountCents])).toEqual([["plan", 6500]]);
    expect((await getAccount(orgId))!.nextInvoiceOn).toBe("2026-12-05");
  });
});

describe("sending", () => {
  it("is refused until PortPass's bank details are filled in", async () => {
    await expect(markInvoiceSent(soloInvoiceId, "email", founder, "2026-11-05")).rejects.toThrow("BANK_DETAILS_MISSING");
    await saveBankDetails({ ...BANK, accountNumber: "" }, founder);
    await expect(markInvoiceSent(soloInvoiceId, "email", founder, "2026-11-05")).rejects.toThrow("BANK_DETAILS_MISSING");
    expect((await getInvoice(soloInvoiceId))!.status).toBe("draft");
  });

  it("dates the invoice the day it is sent and makes it due 14 days later", async () => {
    await saveBankDetails(BANK, founder);
    // Worked out before anything is sent, and nothing is changed by looking.
    expect(await invoiceAsSent(soloInvoiceId, "2026-11-05")).toMatchObject({ status: "sent", issuedOn: "2026-11-05", dueOn: "2026-11-19" });
    expect((await getInvoice(soloInvoiceId))!.status).toBe("draft");
    const sent = await markInvoiceSent(soloInvoiceId, "email", founder, "2026-11-05");
    expect(sent).toMatchObject({ status: "sent", issuedOn: "2026-11-05", dueOn: "2026-11-19", sentVia: "email" });
  });

  it("a business never sees a draft of its own, or anything of another business's", async () => {
    const draft = await createManualInvoice({ organizationId: otherOrgId, periodStart: "2026-11-01", periodEnd: "2026-11-30", issuedOn: "2026-11-10", lines: [{ description: "TEST other business's line", amountCents: 9900 }] }, founder);
    expect(draft.status).toBe("draft");
    expect((await getPlanCard(otherOrgId, "2026-11-10")).invoices).toEqual([]);
    const mine = await getPlanCard(orgId, "2026-11-10");
    expect(mine.invoices.map((invoice) => invoice.id)).toEqual([soloInvoiceId]);
    expect(mine).toMatchObject({ planName: expect.any(String), status: "active", freeUntil: null, nextInvoiceOn: "2026-12-05", nextInvoiceCents: 6500 });
  });
});

describe("an invoice that isn't paid", () => {
  it("goes overdue the day after it was due, puts the account past due, and is chased once", async () => {
    const day = await runDailyBilling("2026-11-20");
    expect((await getInvoice(soloInvoiceId))!.status).toBe("overdue");
    expect((await getAccount(orgId))!.status).toBe("past_due");
    const { data: logged } = await admin.from("audit_log").select("action,before,after").eq("organization_id", orgId).eq("action", "billing.invoice.overdue");
    expect(logged).toHaveLength(1);
    expect(logged![0]).toMatchObject({ before: { status: "sent" }, after: { status: "overdue" } });
    const mine = day.reminders.filter((entry) => entry.account.organizationId === orgId);
    expect(mine.map((entry) => entry.reminder.kind)).toEqual(["invoice_overdue_1"]);
    // Claimed once: a second run the same day sends nothing.
    expect(await claimReminder(mine[0].reminder, orgId)).toBe(true);
    expect(await claimReminder(mine[0].reminder, orgId)).toBe(false);
  });

  it("stops the emails at 14 days overdue and asks for a founder's call instead", async () => {
    const day = await runDailyBilling("2026-12-03");
    expect(day.reminders.filter((entry) => entry.account.organizationId === orgId)).toEqual([]);
    const overview = await getBillingOverview("2026-12-03");
    expect(overview.founderCalls.map((invoice) => invoice.id)).toContain(soloInvoiceId);
    expect(overview.roster.find((row) => row.account.organizationId === orgId)).toMatchObject({ status: "past_due", owesCents: 6500, overdueCents: 6500 });
    expect(overview.morning).toContain("overdue");
  });

  it("takes part payments, and is paid when they add up", async () => {
    const part = await recordReceipt(soloInvoiceId, { amountCents: 3000, method: "bank_transfer", reference: "TEST-REF", receivedOn: "2026-12-03", note: null }, founder, "2026-12-03");
    expect(part).toMatchObject({ status: "overdue", paidCents: 3000 });
    await expect(voidInvoice(soloInvoiceId, "TEST should be refused", founder, "2026-12-03")).rejects.toThrow("HAS_RECEIPTS");
    // More than is still owed is a mistake, and is refused.
    await expect(recordReceipt(soloInvoiceId, { amountCents: 3501, method: "cash", reference: null, receivedOn: "2026-12-03", note: null }, founder, "2026-12-03")).rejects.toThrow("OVERPAID");
    const paid = await recordReceipt(soloInvoiceId, { amountCents: 3500, method: "cash", reference: null, receivedOn: "2026-12-03", note: null }, founder, "2026-12-03");
    expect(paid).toMatchObject({ status: "paid", paidCents: 6500 });
    expect(paid.receipts).toHaveLength(2);
    expect((await getAccount(orgId))!.status).toBe("active");
  });

  it("reverses a receipt recorded by mistake: it stays on the record, stops counting, and is logged", async () => {
    const cash = (await getInvoice(soloInvoiceId))!.receipts.find((receipt) => receipt.method === "cash")!;
    await expect(reverseReceipt(soloInvoiceId, cash.id, " ", founder, "2026-12-03")).rejects.toThrow("REASON_REQUIRED");
    // A receipt is reversed from its own invoice's page only.
    await expect(reverseReceipt(soloInvoiceId + 100000, cash.id, "TEST wrong invoice", founder, "2026-12-03")).rejects.toThrow("NOT_FOUND");
    const back = await reverseReceipt(soloInvoiceId, cash.id, "TEST typed on the wrong invoice", founder, "2026-12-03");
    expect(back).toMatchObject({ status: "overdue", paidCents: 3000 });
    expect(back.receipts).toHaveLength(2);
    expect(back.receipts.find((receipt) => receipt.id === cash.id)).toMatchObject({ reversedReason: "TEST typed on the wrong invoice" });
    await expect(reverseReceipt(soloInvoiceId, cash.id, "TEST twice", founder, "2026-12-03")).rejects.toThrow("ALREADY_REVERSED");
    expect((await getAccount(orgId))!.status).toBe("past_due");
    // The accountant's export leaves the reversed receipt out, and reads each invoice's status as it stands today.
    const exported = await billingExport("2026-11-01", "2026-12-31", "2026-12-03");
    expect(exported.receipts.filter((receipt) => receipt.invoiceId === soloInvoiceId).map((receipt) => receipt.amountCents)).toEqual([3000]);
    expect(exported.invoices.find((invoice) => invoice.id === soloInvoiceId)!.status).toBe("overdue");
    const { data: logged } = await admin.from("audit_log").select("action").eq("organization_id", orgId).eq("action", "billing.receipt.reversed");
    expect(logged).toHaveLength(1);
    // Paid again, properly, for the rest of the file.
    expect((await recordReceipt(soloInvoiceId, { amountCents: 3500, method: "bank_transfer", reference: "TEST-REF-2", receivedOn: "2026-12-03", note: null }, founder, "2026-12-03")).status).toBe("paid");
  });
});

describe("invoice numbers", () => {
  it("are never reused: a void invoice keeps its number, and the next one gets a new one", async () => {
    const first = await createManualInvoice({ organizationId: orgId, periodStart: "2026-12-01", periodEnd: "2026-12-01", issuedOn: "2026-12-01", lines: [{ description: "TEST manual line", amountCents: 1000 }] }, founder);
    await expect(voidInvoice(first.id, "  ", founder)).rejects.toThrow("REASON_REQUIRED");
    const voided = await voidInvoice(first.id, "TEST raised by mistake", founder, "2026-12-03");
    expect(voided).toMatchObject({ status: "void", number: first.number, voidReason: "TEST raised by mistake" });
    const second = await createManualInvoice({ organizationId: orgId, periodStart: "2026-12-01", periodEnd: "2026-12-01", issuedOn: "2026-12-01", lines: [{ description: "TEST manual line", amountCents: 1000 }] }, founder);
    expect(second.number).not.toBe(first.number);
    await expect(recordReceipt(second.id, { amountCents: 1000, method: "cash", reference: null, receivedOn: "2026-12-03", note: null }, founder)).rejects.toThrow("NOT_PAYABLE");
  });

  it("keeps an old invoice's own number, and never gives it a PP- one", async () => {
    const number = `TEST-BUILD-${TAG}`.toUpperCase();
    const old = await createManualInvoice({ organizationId: orgId, periodStart: "2026-08-01", periodEnd: "2026-08-01", issuedOn: "2026-08-01", lines: [{ description: "TEST build fee", amountCents: 30000 }], historicalNumber: number }, founder);
    expect(old).toMatchObject({ number, kind: "historical", status: "sent", totalCents: 30000 });
    expect((await recordReceipt(old.id, { amountCents: 30000, method: "bank_transfer", reference: number, receivedOn: "2026-08-10", note: null }, founder)).status).toBe("paid");
    await expect(createManualInvoice({ organizationId: orgId, periodStart: "2026-08-01", periodEnd: "2026-08-01", issuedOn: "2026-08-01", lines: [{ description: "TEST", amountCents: 100 }], historicalNumber: "PP-2026-999" }, founder)).rejects.toThrow("BAD_NUMBER");
    await expect(createManualInvoice({ organizationId: orgId, periodStart: "2026-08-01", periodEnd: "2026-08-01", issuedOn: "2026-08-01", lines: [{ description: "TEST", amountCents: 100 }], historicalNumber: number }, founder)).rejects.toThrow("NUMBER_TAKEN");
  });
});

describe("a wedding the Desk coordinated", () => {
  it("earns exactly one coordination fee, which goes on the next monthly invoice, once", async () => {
    expect(weddingsId).toBeGreaterThan(0);
    const lead = await createWeddingLead({ idempotencyKey: `test-delete-billing-${TAG}`, names: `TEST delete ${TAG} wedding`, contactConsent: true, marketingConsent: false });
    weddingLeadId = lead.id;
    if (!hadWeddingAccount) await saveAccount(weddingsId, account({ planCode: "wedding_desk", cycle: "per_event", priceCents: 0, goLiveOn: "2026-01-01", billingEmail: `test-delete-weddings-${TAG}@test.portpass.local` }), founder, "2026-10-20");

    expect(await completeWedding(weddingLeadId, { completedOn: "2026-10-20", deskCoordinated: true }, "TEST desk")).toMatchObject({ feeCreated: true });
    expect(await completeWedding(weddingLeadId, { completedOn: "2026-10-20", deskCoordinated: true }, "TEST desk")).toEqual({ feeCreated: false, feeRemoved: false, feeRedated: false, alreadyInvoiced: false });
    // Un-ticked by mistake, then ticked again with the right date: one fee, on the new date.
    expect(await completeWedding(weddingLeadId, { completedOn: "2026-10-20", deskCoordinated: false }, "TEST desk")).toMatchObject({ feeRemoved: true });
    expect((await listEvents({ organizationId: weddingsId })).filter((event) => event.note === `Wedding enquiry ${weddingLeadId}`)).toEqual([]);
    expect(await completeWedding(weddingLeadId, { completedOn: "2026-10-19", deskCoordinated: true }, "TEST desk")).toMatchObject({ feeCreated: true });
    expect(await completeWedding(weddingLeadId, { completedOn: "2026-10-20", deskCoordinated: true }, "TEST desk")).toMatchObject({ feeCreated: false, feeRedated: true });
    const mine = (await listEvents({ organizationId: weddingsId })).filter((event) => event.note === `Wedding enquiry ${weddingLeadId}`);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "wedding_coordination", feeCents: WEDDING_COORDINATION_FEE_CENTS, eventOn: "2026-10-20", invoiceLineId: null });
    // The couple's names are not copied onto the fee.
    expect(JSON.stringify(mine[0])).not.toContain(`TEST delete ${TAG} wedding`);

    if (hadWeddingAccount) return;
    await runDailyBilling("2026-11-01");
    await runDailyBilling("2026-11-01");
    const invoiced = (await listEvents({ organizationId: weddingsId })).find((event) => event.id === mine[0].id)!;
    expect(invoiced.invoiceLineId).not.toBeNull();
    expect(invoiced.invoiceNumber).toMatch(/^PP-2026-\d{3,}$/);
    const drafts = (await listInvoices({ organizationId: weddingsId })).filter((invoice) => invoice.kind === "commission" && invoice.periodStart === "2026-10-01");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ status: "draft", periodEnd: "2026-10-31" });
    expect((await getInvoice(drafts[0].id))!.lines.filter((line) => line.billingEventId === mine[0].id).map((line) => line.amountCents)).toEqual([15000]);
    // Once it is on an invoice the Desk can no longer change it: it says so.
    expect(await completeWedding(weddingLeadId, { completedOn: "2026-10-20", deskCoordinated: false }, "TEST desk")).toEqual({ feeCreated: false, feeRemoved: false, feeRedated: false, alreadyInvoiced: true });
    expect((await listEvents({ organizationId: weddingsId })).find((event) => event.id === mine[0].id)!.invoiceLineId).not.toBeNull();
    // Voiding the draft releases the fee, and the next run drafts the month again.
    await voidInvoice(drafts[0].id, "TEST wrong draft", founder, "2026-11-01");
    voidedWeddingInvoices.push(drafts[0].id);
    expect((await listEvents({ organizationId: weddingsId })).find((event) => event.id === mine[0].id)!.invoiceLineId).toBeNull();
    await runDailyBilling("2026-11-02");
    const again = (await listInvoices({ organizationId: weddingsId })).filter((invoice) => invoice.kind === "commission" && invoice.periodStart === "2026-10-01");
    expect(again.map((invoice) => invoice.status).sort()).toEqual(["draft", "void"]);
  });

  it("earns nothing when the Desk did not coordinate it", async () => {
    const lead = await createWeddingLead({ idempotencyKey: `test-delete-billing-b-${TAG}`, names: `TEST delete ${TAG} wedding B`, contactConsent: true, marketingConsent: false });
    try {
      expect(await completeWedding(lead.id, { completedOn: "2026-10-21", deskCoordinated: false }, "TEST desk")).toEqual({ feeCreated: false });
      const { data: events } = await admin.from("billing_events").select("id").eq("source_table", "wedding_leads").eq("source_id", lead.id);
      expect(events).toEqual([]);
    } finally {
      await admin.from("wedding_leads").delete().eq("id", lead.id);
    }
  });
});

describe("a schedule that has started", () => {
  const plain = () => account({ planCode: "growing", priceCents: 12000, setupFeeCents: 45000, setupStatus: "due", billingEmail: `test-delete-schedule-${TAG}@test.portpass.local` });
  const periods = async () => (await listInvoices({ organizationId: scheduleOrgId })).filter((invoice) => invoice.kind === "subscription" && invoice.status !== "void").map((invoice) => invoice.periodStart).sort();

  it("puts the setup fee on the first invoice only, and catches up every period since", async () => {
    await saveAccount(scheduleOrgId, plain(), founder, "2026-10-05");
    await runDailyBilling("2026-12-10");
    expect(await periods()).toEqual(["2026-11-05", "2026-12-05"]);
    const invoices = await listInvoices({ organizationId: scheduleOrgId });
    const first = await getInvoice(invoices.find((invoice) => invoice.periodStart === "2026-11-05")!.id);
    const second = await getInvoice(invoices.find((invoice) => invoice.periodStart === "2026-12-05")!.id);
    expect(first!.lines.map((line) => line.source)).toEqual(["plan", "setup"]);
    expect(second!.lines.map((line) => line.source)).toEqual(["plan"]);
  });

  it("fixes the go-live and free-until dates, and never takes back a credit", async () => {
    await expect(saveAccount(scheduleOrgId, { ...plain(), goLiveOn: "2026-10-08" }, founder, "2026-12-10")).rejects.toThrow("BILLING_STARTED");
    await expect(saveAccount(scheduleOrgId, { ...plain(), freeUntilOverride: "2027-01-31", freeUntilOverrideReason: "TEST" }, founder, "2026-12-10")).rejects.toThrow("BILLING_STARTED");
    expect(await periods()).toEqual(["2026-11-05", "2026-12-05"]);
  });

  it("moves the next invoice back when free months are given later, without calling it a free period again", async () => {
    const credited = await saveAccount(scheduleOrgId, { ...plain(), freeMonthsCredit: 2, creditReason: "TEST signage sponsor" }, founder, "2026-12-20");
    // The next period would have started 5 January: two months later it starts 5 March.
    expect(credited).toMatchObject({ status: "active", nextInvoiceOn: "2027-03-05", billingResumesOn: "2027-03-05" });
    const january = await runDailyBilling("2027-01-05");
    expect(january.reminders.filter((entry) => entry.account.organizationId === scheduleOrgId && entry.reminder.kind.startsWith("trial_"))).toEqual([]);
    await runDailyBilling("2027-03-04");
    expect(await periods()).toEqual(["2026-11-05", "2026-12-05"]);
    await runDailyBilling("2027-03-05");
    expect(await periods()).toEqual(["2026-11-05", "2026-12-05", "2027-03-05"]);
    // The setup fee was on the first invoice: it is not charged again.
    const march = (await listInvoices({ organizationId: scheduleOrgId })).find((invoice) => invoice.periodStart === "2027-03-05")!;
    expect((await getInvoice(march.id))!.lines.map((line) => line.source)).toEqual(["plan"]);
    await expect(saveAccount(scheduleOrgId, { ...plain(), freeMonthsCredit: 1, creditReason: "TEST signage sponsor" }, founder, "2027-03-06")).rejects.toThrow("CREDIT_FIXED");
  });

  it("starts the year where the last month ended when the plan becomes annual", async () => {
    const credit = { freeMonthsCredit: 2, creditReason: "TEST signage sponsor" };
    await saveAccount(scheduleOrgId, { ...plain(), ...credit, cycle: "annual" }, founder, "2027-03-20");
    await runDailyBilling("2027-04-05");
    const annual = (await listInvoices({ organizationId: scheduleOrgId })).find((invoice) => invoice.periodStart === "2027-04-05")!;
    // Ten months charged for twelve.
    expect(annual).toMatchObject({ periodEnd: "2028-04-04", totalCents: 120000 });
    await runDailyBilling("2027-12-05");
    expect(await periods()).toEqual(["2026-11-05", "2026-12-05", "2027-03-05", "2027-04-05"]);
  });

  it("drafts a voided period again, and bills nothing for the time an account was paused", async () => {
    const annual = (await listInvoices({ organizationId: scheduleOrgId })).find((invoice) => invoice.periodStart === "2027-04-05")!;
    await voidInvoice(annual.id, "TEST wrong price", founder, "2027-12-05");
    // The latest period is free again: the business sees no trace of a draft voided before it was sent.
    expect((await getPlanCard(scheduleOrgId, "2027-12-05")).invoices.map((invoice) => invoice.id)).not.toContain(annual.id);
    const redrafted = await redraftPeriod(annual.id, founder, "2027-12-05");
    expect(redrafted).toMatchObject({ kind: "subscription", status: "draft", periodStart: "2027-04-05", periodEnd: "2028-04-04" });
    await expect(redraftPeriod(annual.id, founder, "2027-12-05")).rejects.toThrow("PERIOD_COVERED");

    const credit = { freeMonthsCredit: 2, creditReason: "TEST signage sponsor" };
    await saveAccount(scheduleOrgId, { ...plain(), ...credit, cycle: "monthly", paused: true, statusReason: "TEST closed for the season" }, founder, "2028-04-01");
    await runDailyBilling("2028-07-10");
    expect(await periods()).toEqual(["2026-11-05", "2026-12-05", "2027-03-05", "2027-04-05"]);
    const resumed = await saveAccount(scheduleOrgId, { ...plain(), ...credit, cycle: "monthly" }, founder, "2028-07-20");
    expect(resumed).toMatchObject({ billingResumesOn: "2028-07-20", nextInvoiceOn: "2028-07-20" });
    await runDailyBilling("2028-07-20");
    // One invoice from the day it resumed: none for April to July.
    expect(await periods()).toEqual(["2026-11-05", "2026-12-05", "2027-03-05", "2027-04-05", "2028-07-20"]);
  });
});

describe("fees and credits typed in by a founder", () => {
  it("takes a flat fee or a share of a booking, never both; a credit comes off the next invoice", async () => {
    await expect(addManualEvent({ organizationId: otherOrgId, kind: "supplier_commission", eventOn: "2026-11-10", bookingValueCents: 50000, rateBps: 800, flatCents: 15000, note: "TEST both" }, founder)).rejects.toThrow("FLAT_OR_SHARE");
    const fee = await addManualEvent({ organizationId: otherOrgId, kind: "supplier_commission", eventOn: "2026-11-10", bookingValueCents: 50000, rateBps: 800, flatCents: 0, note: "TEST supplier booking" }, founder);
    expect(fee.feeCents).toBe(4000);
    const credit = await addManualEvent({ organizationId: otherOrgId, kind: "supplier_commission", eventOn: "2026-11-12", bookingValueCents: 0, rateBps: 0, flatCents: 1000, note: "TEST refunded booking", credit: true }, founder);
    expect(credit).toMatchObject({ feeCents: -1000, note: "Credit: TEST refunded booking" });

    // No billing account yet: nothing is drafted for it.
    await runDailyBilling("2026-12-01");
    expect((await listInvoices({ organizationId: otherOrgId })).filter((invoice) => invoice.kind === "commission")).toEqual([]);

    // With a plan agreed (a monthly one, here), the fees go on a fees invoice on the 1st, net of the credit.
    await saveAccount(otherOrgId, account({ goLiveOn: "2026-09-01", billingEmail: `test-delete-other-${TAG}@test.portpass.local` }), founder, "2026-12-01");
    await runDailyBilling("2026-12-01");
    const fees = (await listInvoices({ organizationId: otherOrgId })).filter((invoice) => invoice.kind === "commission");
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ status: "draft", periodStart: "2026-11-01", totalCents: 3000 });

    // A fee on an invoice can't be removed; one that isn't can, with a reason.
    await expect(removeEvent(fee.id, "TEST", founder)).rejects.toThrow("INVOICED");
    const spare = await addManualEvent({ organizationId: otherOrgId, kind: "wedding_coordination", eventOn: "2026-12-02", bookingValueCents: 0, rateBps: 0, flatCents: 15000, note: "TEST typed by mistake" }, founder);
    await expect(removeEvent(spare.id, "  ", founder)).rejects.toThrow("REASON_REQUIRED");
    await removeEvent(spare.id, "TEST typed by mistake", founder);
    expect((await listEvents({ organizationId: otherOrgId })).map((event) => event.id)).not.toContain(spare.id);
  });
});
