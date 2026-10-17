// The billing rehearsal (growth plan, 16 Oct 2026, week 1): PortPass's own
// money chain played once end to end on a throwaway local Supabase stack,
// before the first real invoice goes to anyone. The chain is built and has
// never run in production.
//
//   1. A TEST founder signs in (code and authenticator step).
//   2. Sending is refused while PortPass's bank details are missing.
//   3. The four bank details go in (TEST values), through Admin -> Settings'
//      own route.
//   4. A TEST business gets a billing account through Admin -> Billing's own
//      route: monthly, $65 per month, its free 30 days ending yesterday, an
//      agreement date and version, and a billing email at @example.com.
//   5. The daily job (/api/cron/daily, with this run's own CRON_SECRET)
//      drafts its first invoice. Run twice: still one invoice.
//   6. "Send by email" is pressed: the address is @example.com, so nothing
//      leaves (lib/email.ts) and the invoice stays a draft.
//   7. "Mark as sent another way": sent, dated today, due in 14 days. Its PDF
//      is saved into the artifact.
//   8. A part payment, an overpayment (refused) and the rest: part paid,
//      then paid; the account reads active. The paid PDF is saved too.
//   9. Every row it made is deleted.
//
// No real database and no real inbox: the app runs with no email key, and
// the only address is @example.com. Each screen a founder sees is
// photographed at 375px into ./screenshots.
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../../lib/localStackOnly.mjs";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
assertLocalSupabase();
// The cron secret goes to BASE and the daily job runs there, so BASE must
// be this machine too: never a preview or the live site.
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("SCREENSHOT_BASE_URL must be the app on this machine (localhost or 127.0.0.1): the rehearsal runs the daily job wherever it points.");
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) throw new Error("Set CRON_SECRET for this run: the daily job refuses every call without it.");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const ADMIN_EMAIL = process.env.PLATFORM_OWNER_EMAILS ?? "";
if (!/^[^\s@,]+@test\.portpass\.local$/i.test(ADMIN_EMAIL)) throw new Error("PLATFORM_OWNER_EMAILS must be one TEST founder at @test.portpass.local.");
mkdirSync("screenshots", { recursive: true });
mkdirSync("invoices", { recursive: true });

const TAG = Math.random().toString(36).slice(2, 8);
const BUSINESS_NAME = `TEST Billing Rehearsal ${TAG} (delete)`;
const SLUG = `test-delete-billing-${TAG}`;
const BILLING_EMAIL = `test-delete-billing-${TAG}@example.com`;
const AGREEMENT_VERSION = "TEST v1.0";
const PRICE_CENTS = 6500;
const BANK = { bank: "TEST Bank of Nassau", accountName: "PortPass Bahamas Technologies (TEST)", accountNumber: "000-TEST-0042", branch: "TEST Bay Street" };
const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
const TODAY = day(0);

const results = [];
let failed = false;
let shot = 0;
const state = {};

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function step(name, run) {
  const started = Date.now();
  try {
    const note = (await run()) ?? "";
    results.push({ name, ok: true, ms: Date.now() - started, note });
    console.log(`ok   ${name} (${Date.now() - started} ms)${note ? ` — ${note}` : ""}`);
  } catch (error) {
    failed = true;
    results.push({ name, ok: false, ms: Date.now() - started, note: String(error.message).split("\n")[0].slice(0, 300) });
    console.error(`FAIL ${name} (${Date.now() - started} ms): ${error.message}`);
  }
}

async function photo(page, name) {
  shot += 1;
  const file = `screenshots/billing-${String(shot).padStart(2, "0")}-${name}-375.png`;
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  return file;
}

async function call(page, method, url, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json().catch(() => ({})) };
    },
    { method, url, body },
  );
}

// RFC 6238: the six-digit code an authenticator app would show right now.
function totp(base32Secret, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value >= 0) bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function invoiceRow() {
  const { data, error } = await admin.from("portpass_invoices").select("id,number,kind,status,issued_on,due_on,subtotal_cents,vat_cents,total_cents,paid_cents,sent_via").eq("organization_id", state.orgId).order("id");
  if (error) throw new Error(`Could not read the invoices: ${error.message}`);
  return data ?? [];
}

async function dailyJob() {
  const response = await fetch(`${BASE}/api/cron/daily`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  return response.status;
}

// The PDF a business would download, read as bytes. The PDF is written
// uncompressed (lib/invoicePdf.ts), so its words can be searched.
async function savePdf(page, label) {
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { status: response.status, type: response.headers.get("content-type"), body: btoa(binary) };
  }, `/api/business/orgs/${state.orgId}/invoices/${state.invoiceId}/pdf`);
  expect(result.status === 200 && result.type === "application/pdf", `The invoice PDF answered ${result.status} (${result.type}).`);
  const bytes = Buffer.from(result.body, "base64");
  const file = `invoices/${state.number}-${label}.pdf`;
  writeFileSync(file, bytes);
  return { file, text: bytes.toString("latin1") };
}

// The founder's account exists before the run, as it does in real life.
{
  const { error } = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw new Error(`Could not make the TEST founder: ${error.message}`);
}

const browser = await chromium.launch();
try {
  const founder = await (await browser.newContext(PHONE)).newPage();

  await step("1. A TEST founder signs in, with the authenticator step", async () => {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
    expect(!error && data?.properties?.email_otp, `No sign-in code for the founder: ${error?.message ?? ""}`);
    await founder.goto(`${BASE}/login`, { waitUntil: "load" });
    const verified = await call(founder, "POST", "/api/auth/verify", { email: ADMIN_EMAIL, token: data.properties.email_otp });
    expect(verified.status === 200, `The founder's sign-in answered ${verified.status}.`);
    const enrolled = await call(founder, "POST", "/api/admin/mfa/enroll", {});
    expect(enrolled.status === 200 && enrolled.data.secret, `Two-step enrolment answered ${enrolled.status}.`);
    const stepUp = await call(founder, "POST", "/api/admin/mfa/verify", { factorId: enrolled.data.factorId, code: totp(enrolled.data.secret) });
    expect(stepUp.status === 200, `Two-step verification answered ${stepUp.status}.`);
  });

  await step("2. A TEST business and its billing account (monthly, $65, free 30 days ended yesterday)", async () => {
    const { data: org, error } = await admin.from("organizations").insert({ name: BUSINESS_NAME, slug: SLUG, primary_category: "sports-fitness", status: "draft", created_by_admin: true }).select("id").single();
    expect(!error && org, `Could not make the TEST business: ${error?.message ?? ""}`);
    state.orgId = org.id;
    // Nothing is left over from another run in this stack.
    await admin.from("site_content").delete().eq("key", "billing_bank");
    const saved = await call(founder, "PUT", `/api/admin/billing/accounts/${state.orgId}`, {
      planCode: "solo", cycle: "monthly", priceCents: PRICE_CENTS, goLiveOn: day(-31), setupFeeCents: 45000, setupStatus: "waived",
      agreementSignedOn: day(-31), agreementVersion: AGREEMENT_VERSION, billingEmail: BILLING_EMAIL, billingWhatsappE164: "242-555-0142",
    });
    expect(saved.status === 200, `Saving the account answered ${saved.status}: ${saved.data.error ?? ""}`);
    expect(saved.data.nextInvoiceOn === TODAY, `The first invoice should be due to draft today (${TODAY}), not ${saved.data.nextInvoiceOn}.`);
    await founder.goto(`${BASE}/admin/billing/accounts/${state.orgId}`, { waitUntil: "load" });
    await photo(founder, "account");
    return `free until ${saved.data.freeUntil}, first invoice ${saved.data.nextInvoiceOn}, status ${saved.data.status}`;
  });

  await step("3. The daily job drafts the first invoice, once", async () => {
    expect((await fetch(`${BASE}/api/cron/daily`)).status === 401, "The daily job ran without the cron secret.");
    expect((await dailyJob()) === 200, "The daily job did not answer 200.");
    expect((await dailyJob()) === 200, "The daily job's second run did not answer 200.");
    const invoices = await invoiceRow();
    expect(invoices.length === 1, `Two runs should leave one invoice; there are ${invoices.length}.`);
    const [invoice] = invoices;
    expect(invoice.kind === "subscription" && invoice.status === "draft", `The invoice should be a subscription draft; it is ${invoice.kind}, ${invoice.status}.`);
    expect(invoice.total_cents === PRICE_CENTS && invoice.vat_cents === 0, `The invoice should be $65.00 with no VAT; it is ${invoice.total_cents} cents, VAT ${invoice.vat_cents}.`);
    const { data: lines } = await admin.from("portpass_invoice_lines").select("description,amount_cents,source").eq("invoice_id", invoice.id);
    expect(lines?.length === 1 && lines[0].source === "plan", `One plan line expected (setup is waived); found ${JSON.stringify(lines)}.`);
    state.invoiceId = invoice.id;
    state.number = invoice.number;
    await founder.goto(`${BASE}/admin/billing`, { waitUntil: "load" });
    await photo(founder, "overview-draft");
    return `${invoice.number}: ${lines[0].description}`;
  });

  await step("4. Sending is refused while PortPass's bank details are missing", async () => {
    const refused = await call(founder, "POST", `/api/admin/billing/invoices/${state.invoiceId}`, { action: "mark_sent" });
    expect(refused.status === 409 && /bank details/i.test(refused.data.error ?? ""), `Sending without bank details answered ${refused.status}: ${refused.data.error ?? ""}`);
    const [invoice] = await invoiceRow();
    expect(invoice.status === "draft", `The invoice should still be a draft; it is ${invoice.status}.`);
  });

  await step("5. The four bank details go in (TEST values)", async () => {
    const saved = await call(founder, "PUT", "/api/admin/billing/bank", BANK);
    expect(saved.status === 200 && saved.data.complete === true, `Saving the bank details answered ${saved.status}, complete: ${saved.data.complete}.`);
    await founder.goto(`${BASE}/admin/billing/invoices/${state.invoiceId}`, { waitUntil: "load" });
    await photo(founder, "invoice-draft");
  });

  await step("6. \"Send by email\" to an @example.com address sends nothing and changes nothing", async () => {
    const pressed = await call(founder, "POST", `/api/admin/billing/invoices/${state.invoiceId}`, { action: "send_email" });
    expect(pressed.status === 502 && /test address|isn't set up/i.test(pressed.data.error ?? ""), `Send by email answered ${pressed.status}: ${pressed.data.error ?? ""}`);
    const [invoice] = await invoiceRow();
    expect(invoice.status === "draft", `A send that did not go must leave a draft; it is ${invoice.status}.`);
    const { data: logged } = await admin.from("message_log").select("status").eq("recipient", BILLING_EMAIL).eq("status", "sent");
    expect(!(logged ?? []).length, "The Messages log says an email was sent to the TEST address.");
    return "skipped: nothing left the app";
  });

  await step("7. Marked as sent another way: dated today, due in 14 days; the PDF", async () => {
    const sent = await call(founder, "POST", `/api/admin/billing/invoices/${state.invoiceId}`, { action: "mark_sent" });
    expect(sent.status === 200 && sent.data.status === "sent", `Mark as sent answered ${sent.status}: ${sent.data.error ?? sent.data.status}`);
    const [invoice] = await invoiceRow();
    expect(invoice.status === "sent" && invoice.sent_via === "in_person", `The invoice should be sent in person; it is ${invoice.status}, ${invoice.sent_via}.`);
    expect(invoice.issued_on === TODAY && invoice.due_on === day(14), `Issued ${invoice.issued_on}, due ${invoice.due_on}; expected ${TODAY} and ${day(14)}.`);
    const twice = await call(founder, "POST", `/api/admin/billing/invoices/${state.invoiceId}`, { action: "receipt", receipt: { amountCents: PRICE_CENTS + 1, method: "bank_transfer", receivedOn: TODAY } });
    expect(twice.status === 409, `An overpayment should be refused; it answered ${twice.status}.`);
    const pdf = await savePdf(founder, "sent");
    for (const words of [state.number, "INVOICE", "65.00", BANK.accountNumber]) expect(pdf.text.includes(words), `The sent PDF does not show "${words}".`);
    expect(!pdf.text.includes("DRAFT INVOICE"), "The sent PDF still says DRAFT.");
    state.agreementOnPdf = pdf.text.includes(AGREEMENT_VERSION);
    await founder.goto(`${BASE}/admin/billing/invoices/${state.invoiceId}`, { waitUntil: "load" });
    await photo(founder, "invoice-sent");
    return `${pdf.file}; agreement version on the PDF: ${state.agreementOnPdf ? "yes" : "no"}`;
  });

  await step("8. A part payment, then the rest: part paid, then paid; the account is active", async () => {
    const part = await call(founder, "POST", `/api/admin/billing/invoices/${state.invoiceId}`, { action: "receipt", receipt: { amountCents: 2500, method: "bank_transfer", reference: "TEST-REF-1", receivedOn: TODAY, note: "TEST — delete" } });
    expect(part.status === 200 && part.data.status === "part_paid" && part.data.paidCents === 2500, `The part payment answered ${part.status}: ${part.data.error ?? `${part.data.status}, ${part.data.paidCents}`}`);
    const rest = await call(founder, "POST", `/api/admin/billing/invoices/${state.invoiceId}`, { action: "receipt", receipt: { amountCents: PRICE_CENTS - 2500, method: "cash", receivedOn: TODAY, note: "TEST — delete" } });
    expect(rest.status === 200 && rest.data.status === "paid" && rest.data.paidCents === PRICE_CENTS, `The rest answered ${rest.status}: ${rest.data.error ?? `${rest.data.status}, ${rest.data.paidCents}`}`);
    const { data: account } = await admin.from("billing_accounts").select("status,next_invoice_on").eq("organization_id", state.orgId).single();
    expect(account.status === "active", `The account should be active once paid; it is ${account.status}.`);
    const pdf = await savePdf(founder, "paid");
    await founder.goto(`${BASE}/admin/billing/invoices/${state.invoiceId}`, { waitUntil: "load" });
    await photo(founder, "invoice-paid");
    await founder.goto(`${BASE}/admin/billing`, { waitUntil: "load" });
    await photo(founder, "overview-paid");
    return `${pdf.file}; next invoice ${account.next_invoice_on}`;
  });
} finally {
  await browser.close();
  // ---------------------------------------------------------------- cleanup
  await step("9. Every row the rehearsal made is deleted", async () => {
    const left = [];
    if (state.orgId) {
      const invoiceIds = (await invoiceRow().catch(() => [])).map((invoice) => invoice.id);
      if (invoiceIds.length) {
        for (const table of ["portpass_receipts", "portpass_invoice_lines"]) {
          const { error } = await admin.from(table).delete().in("invoice_id", invoiceIds);
          if (error) left.push(`${table}: ${error.message}`);
        }
        const { error } = await admin.from("portpass_invoices").delete().in("id", invoiceIds);
        if (error) left.push(`portpass_invoices: ${error.message}`);
      }
      for (const table of ["billing_reminders", "billing_accounts", "audit_log", "message_log"]) {
        const { error } = await admin.from(table).delete().eq("organization_id", state.orgId);
        if (error) left.push(`${table}: ${error.message}`);
      }
      const { error } = await admin.from("organizations").delete().eq("id", state.orgId);
      if (error) left.push(`organizations: ${error.message}`);
    }
    const { error: bankError } = await admin.from("site_content").delete().eq("key", "billing_bank");
    if (bankError) left.push(`site_content: ${bankError.message}`);
    const { error: bankAuditError } = await admin.from("audit_log").delete().eq("action", "billing.bank_details.updated").eq("target_id", "billing_bank");
    if (bankAuditError) left.push(`audit_log (bank details): ${bankAuditError.message}`);
    expect(!left.length, `Not deleted: ${left.join("; ")}`);
    if (state.orgId) {
      const { data } = await admin.from("organizations").select("id").eq("id", state.orgId);
      expect(!(data ?? []).length, "The TEST business is still there.");
    }
  });

  const lines = [
    "## Billing rehearsal (TEST data, local stack)",
    "",
    `Invoice ${state.number ?? "(none)"}, account version \`${AGREEMENT_VERSION}\`, billing email at @example.com. Nothing was emailed.`,
    "",
    "| Step | Result | Time | Note |",
    "| --- | --- | --- | --- |",
    ...results.map((r) => `| ${r.name} | ${r.ok ? "ok" : "**FAIL**"} | ${(r.ms / 1000).toFixed(1)} s | ${r.note.replace(/\|/g, "\\|")} |`),
  ];
  writeFileSync("billing-rehearsal-result.md", `${lines.join("\n")}\n`);
  if (failed) process.exitCode = 1;
}
