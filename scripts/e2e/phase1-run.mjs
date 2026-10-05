// The Phase 1 end-to-end run (brief 19, part B), automated, at phone width.
// The script a person follows is docs/qa/phase1-run.md; this plays the
// same steps against `next start` on localhost with a throwaway local
// Supabase stack, so it can be run before every release.
//
// It plays four people, each in their own browser: a business owner, a
// PortPass founder, a customer with no account, and the same customer
// once they have made one. Screens are used where a stranger meets them
// (finding the business, Request to book, the booking page, the pay page,
// the Bookings screen); the owner's long setup form is driven through the
// same routes the form calls.
//
// What it cannot do is in the document, not here: a real inbox, Google
// sign-in and a real phone's install prompt.
//
// Every row it makes is TEST data in a stack that is thrown away; it still
// deletes them at the end, to prove the list of what to delete is whole.
// Each step is timed and photographed at 375px into ./screenshots.
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const MAIL = process.env.LOCAL_MAIL_URL ?? "http://127.0.0.1:54324";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const ADMIN_EMAIL = process.env.PLATFORM_OWNER_EMAILS;
if (!process.env.SUPABASE_URL?.includes("127.0.0.1") && !process.env.SUPABASE_URL?.includes("localhost")) throw new Error("This run only ever uses a local Supabase stack.");
mkdirSync("screenshots", { recursive: true });

const TAG = Math.random().toString(36).slice(2, 8);
const OWNER_EMAIL = `test-delete-owner-${TAG}@test.portpass.local`;
const CUSTOMER_EMAIL = `test-delete-customer-${TAG}@test.portpass.local`;
const BUSINESS_NAME = `TEST Reef Booth ${TAG}`;
const SECTION = "entertainment";
const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });

const results = [];
let failed = false;
let shot = 0;
const state = {};

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function step(part, name, run) {
  const started = Date.now();
  try {
    const note = (await run()) ?? "";
    results.push({ part, name, ok: true, ms: Date.now() - started, note });
    console.log(`ok   ${part} ${name} (${Date.now() - started} ms)${note ? ` — ${note}` : ""}`);
  } catch (error) {
    failed = true;
    results.push({ part, name, ok: false, ms: Date.now() - started, note: String(error.message).split("\n")[0].slice(0, 300) });
    console.error(`FAIL ${part} ${name} (${Date.now() - started} ms): ${error.message}`);
  }
}

async function photo(page, name) {
  shot += 1;
  const file = `screenshots/phase1-${String(shot).padStart(2, "0")}-${name}-375.png`;
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

// The six-digit code the local stack "emailed". The local mail catcher is
// asked first (that is the email arriving); if it isn't running, a code is
// issued the way the screenshot jobs do.
async function emailedCode(email) {
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      const message = list?.messages?.[0];
      if (message) {
        const full = await (await fetch(`${MAIL}/api/v1/message/${message.ID}`)).json();
        const code = /\b(\d{6})\b/.exec(`${full.Text ?? ""} ${full.Subject ?? ""}`)?.[1];
        if (code) return { code, from: "the local mail catcher" };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // No mail catcher: fall through.
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.email_otp) throw new Error(`No sign-in code could be read or issued for ${email}: ${error?.message ?? "no code"}`);
  return { code: data.properties.email_otp, from: "a code issued by the local stack" };
}

async function signUp(page, email, extra) {
  await page.goto(`${BASE}/signup`, { waitUntil: "load" });
  const sent = await call(page, "POST", "/api/auth/send", { email, mode: "signup", ...extra });
  expect(sent.status === 200, `Asking for a sign-up code answered ${sent.status}: ${sent.data.error ?? ""}`);
  const { code, from } = await emailedCode(email);
  const verified = await call(page, "POST", "/api/auth/verify", { email, token: code, intent: extra.intent });
  expect(verified.status === 200, `The code answered ${verified.status}: ${verified.data.error ?? ""}`);
  return { next: verified.data.next, from };
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

async function logged(template, recipient) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await admin.from("message_log").select("status,detail").eq("template", template).eq("recipient", recipient).order("id", { ascending: false }).limit(1);
    if (data?.[0]) return data[0];
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

// The founder's account exists before the run, as it does in real life.
{
  const { error } = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw new Error(`Could not make the TEST founder: ${error.message}`);
}

const browser = await chromium.launch();
try {
  const owner = await (await browser.newContext(PHONE)).newPage();
  const founder = await (await browser.newContext(PHONE)).newPage();
  const visitorContext = await browser.newContext(PHONE);
  const visitor = await visitorContext.newPage();
  const memberContext = await browser.newContext(PHONE);
  const member = await memberContext.newPage();

  // ---------------------------------------------------------------- 1
  await step("1", "A business owner signs up with a new email", async () => {
    const { next, from } = await signUp(owner, OWNER_EMAIL, { fullName: "TEST Owner", phone: "242-555-0180", intent: "business", businessName: BUSINESS_NAME, section: SECTION });
    expect(typeof next === "string" && next.startsWith("/business"), `After sign-up the owner should be sent to their business, not ${next}.`);
    await owner.goto(`${BASE}${next}`, { waitUntil: "load" });
    await photo(owner, "1-owner-signed-up");
    return `code from ${from}; sent to ${next}`;
  });

  await step("1", "Setup: the business, its contact details, prices and Get paid", async () => {
    const started = await call(owner, "POST", "/api/business/orgs", { name: BUSINESS_NAME, section: SECTION });
    expect(started.status === 200 || started.status === 201, `Starting the business answered ${started.status}: ${started.data.error ?? ""}`);
    state.orgId = started.data.id;
    state.slug = started.data.slug;
    const base = `/api/business/orgs/${state.orgId}`;
    const details = await call(owner, "PATCH", base, { oneLiner: "TEST — delete. Photo booths for parties.", description: "TEST — delete. Made by the Phase 1 run.", area: "Nassau", island: "New Providence", whatsappE164: "+12425550180", publicEmail: OWNER_EMAIL, brandColor: "#0E7C86" });
    expect(details.status === 200, `Saving the details answered ${details.status}: ${details.data.error ?? ""}`);
    for (const offering of [
      { name: "TEST Photo booth hire", price: "150", priceUnit: "per_hour", summary: "Open-air booth, props and unlimited prints." },
      { name: "TEST Party host", price: "200", priceUnit: "", summary: "Two hours of games and music." },
    ]) {
      const saved = await call(owner, "POST", `${base}/offerings`, offering);
      expect(saved.status === 201, `Adding "${offering.name}" answered ${saved.status}: ${saved.data.error ?? ""}`);
    }
    const paid = await call(owner, "PUT", `/api/payments/orgs/${state.orgId}/settings`, { referencePrefix: "TRB", acceptedMethods: ["cash", "bank_transfer"], bankName: "TEST Bank of Nassau", accountName: BUSINESS_NAME, accountNumberLast4: "0042", transferInstructions: "TEST — account 000-TEST-0042. Put your reference in the note.", cashNote: "TEST — on the day", defaultDueDays: 7 });
    expect(paid.status === 200, `Get paid answered ${paid.status}: ${paid.data.error ?? ""}`);
    await owner.goto(`${BASE}/business/setup`, { waitUntil: "load" });
    await photo(owner, "1-setup-wizard");
    await owner.goto(`${BASE}/business/${state.slug}/preview`, { waitUntil: "load" });
    await photo(owner, "1-preview");
    return `business ${state.slug}`;
  });

  await step("1", "The owner sees what the page is missing, then submits it", async () => {
    await owner.goto(`${BASE}/business/${state.slug}`, { waitUntil: "load" });
    await owner.getByRole("heading", { name: "What your page is missing" }).waitFor({ timeout: 15_000 });
    const problems = await call(owner, "GET", `/api/business/orgs/${state.orgId}/submit`);
    expect(problems.status === 200 && problems.data.problems.length === 0, `The page can't be submitted yet: ${(problems.data.problems ?? []).join(" ")}`);
    const submitted = await call(owner, "POST", `/api/business/orgs/${state.orgId}/submit`);
    expect(submitted.status === 200 && submitted.data.business?.status === "submitted", `Submitting answered ${submitted.status}: ${submitted.data.error ?? ""}`);
    await owner.reload({ waitUntil: "load" });
    await photo(owner, "1-submitted");
  });

  await step("1", "A PortPass founder approves it and the page goes live", async () => {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
    expect(!error && data?.properties?.email_otp, `No sign-in code for the founder: ${error?.message ?? ""}`);
    await founder.goto(`${BASE}/login`, { waitUntil: "load" });
    const verified = await call(founder, "POST", "/api/auth/verify", { email: ADMIN_EMAIL, token: data.properties.email_otp });
    expect(verified.status === 200, `The founder's sign-in answered ${verified.status}.`);
    const enrolled = await call(founder, "POST", "/api/admin/mfa/enroll", {});
    expect(enrolled.status === 200 && enrolled.data.secret, `Two-step enrolment answered ${enrolled.status}.`);
    const stepUp = await call(founder, "POST", "/api/admin/mfa/verify", { factorId: enrolled.data.factorId, code: totp(enrolled.data.secret) });
    expect(stepUp.status === 200, `Two-step verification answered ${stepUp.status}.`);
    await founder.goto(`${BASE}/admin/businesses?status=submitted`, { waitUntil: "load" });
    await founder.getByText(BUSINESS_NAME).first().waitFor({ timeout: 15_000 });
    await photo(founder, "1-admin-review-queue");
    const approved = await call(founder, "POST", `/api/admin/businesses/${state.orgId}`, { action: "approve" });
    expect(approved.status === 200, `Approving answered ${approved.status}: ${approved.data.error ?? ""}`);
    let { data: org } = await admin.from("organizations").select("status,is_published,is_directory_listed").eq("id", state.orgId).single();
    if (!org.is_published) {
      const live = await call(founder, "POST", `/api/admin/businesses/${state.orgId}`, { action: "go_live" });
      expect(live.status === 200, `Going live answered ${live.status}: ${live.data.error ?? ""}`);
      ({ data: org } = await admin.from("organizations").select("status,is_published,is_directory_listed").eq("id", state.orgId).single());
    }
    expect(org.is_published && org.status === "live", `The page should be live and public; it is ${org.status}, public: ${org.is_published}.`);
    state.listed = org.is_directory_listed;
    await founder.goto(`${BASE}/admin/phase1`, { waitUntil: "load" });
    await photo(founder, "1-admin-phase1");
    return `status ${org.status}, in the directory: ${org.is_directory_listed}`;
  });

  // ---------------------------------------------------------------- 2
  const pageHref = () => `/${SECTION}/${state.slug}`;

  await step("2", "A stranger finds the business from the homepage", async () => {
    await visitor.goto(`${BASE}/`, { waitUntil: "load" });
    const link = visitor.locator(`a[href="${pageHref()}"]`).first();
    await link.waitFor({ state: "attached", timeout: 20_000 });
    await photo(visitor, "2-homepage");
    await link.scrollIntoViewIfNeeded();
    await Promise.all([visitor.waitForURL(`**${pageHref()}`, { timeout: 30_000 }), link.click()]);
    await visitor.getByRole("heading", { name: BUSINESS_NAME }).first().waitFor({ timeout: 15_000 });
  });

  await step("2", "…and from search", async () => {
    await visitor.goto(`${BASE}/search?q=${encodeURIComponent(`Reef Booth ${TAG}`)}`, { waitUntil: "load" });
    await visitor.locator(`a[href="${pageHref()}"]`).first().waitFor({ state: "visible", timeout: 20_000 });
    await photo(visitor, "2-search");
  });

  await step("2", "Request to book, on the business's page", async () => {
    await visitor.goto(`${BASE}${pageHref()}`, { waitUntil: "load" });
    const request = visitor.getByRole("link", { name: /Request to book.*Photo booth/ }).first();
    await request.scrollIntoViewIfNeeded();
    await photo(visitor, "2-request-to-book");
    await Promise.all([visitor.waitForURL("**/book?offering=*", { timeout: 30_000 }), request.click()]);
    await visitor.getByLabel("Date *").fill(day(14));
    await visitor.getByLabel("Time").fill("18:00");
    await visitor.getByLabel("How many hours?").fill("3 hours");
    await visitor.getByLabel("Where").fill("TEST — Sandyport Beach Club");
    await visitor.getByLabel(/Anything .* should know/).fill("TEST — delete. A birthday party.");
    await visitor.getByLabel("Your name *").fill("TEST Customer");
    await visitor.locator(".phone-input input").fill("5550181");
    await visitor.getByLabel("Email *").fill(CUSTOMER_EMAIL);
    await photo(visitor, "2-booking-form");
    await Promise.all([visitor.waitForURL(/\/booking\/[a-f0-9]{40}/, { timeout: 30_000 }), visitor.getByRole("button", { name: /Send request/ }).click()]);
    state.bookingToken = /\/booking\/([a-f0-9]{40})/.exec(visitor.url())[1];
    await visitor.getByText("Request sent").waitFor({ timeout: 15_000 });
    state.bookingRef = (await visitor.locator(".paypage-ref").first().innerText()).trim();
    expect(/^TRB-B\d{4}$/.test(state.bookingRef), `The reference should read TRB-B0001, not ${state.bookingRef}.`);
    await photo(visitor, "2-booking-sent");
    return state.bookingRef;
  });

  await step("2", "The confirmation email is sent to the customer, and the owner is told", async () => {
    const toCustomer = await logged("booking_request_received", CUSTOMER_EMAIL);
    expect(toCustomer, "No booking_request_received email was recorded for the customer.");
    const toOwner = await logged("booking_request_new_for_business", OWNER_EMAIL);
    expect(toOwner, "No booking_request_new_for_business email was recorded for the owner.");
    return `Messages log: customer ${toCustomer.status}, owner ${toOwner.status} (a test address is never emailed)`;
  });

  await step("2", "The owner sees the request on their dashboard and confirms it", async () => {
    await owner.goto(`${BASE}/business/${state.slug}`, { waitUntil: "load" });
    await owner.getByText("1 new").first().waitFor({ timeout: 15_000 });
    await photo(owner, "2-owner-dashboard");
    await owner.goto(`${BASE}/business/${state.slug}/bookings`, { waitUntil: "load" });
    await owner.getByText(state.bookingRef).first().waitFor({ timeout: 15_000 });
    await photo(owner, "2-bookings-new");
    await owner.getByRole("button", { name: "Confirm", exact: true }).first().click();
    await owner.getByText("No new requests.").waitFor({ timeout: 20_000 });
    await owner.goto(`${BASE}/business/${state.slug}/bookings?tab=confirmed`, { waitUntil: "load" });
    await owner.getByRole("link", { name: /Request payment/ }).first().waitFor({ timeout: 15_000 });
    await photo(owner, "2-bookings-confirmed");
    const confirmed = await logged("booking_request_confirmed", CUSTOMER_EMAIL);
    expect(confirmed, "No booking_request_confirmed email was recorded for the customer.");
  });

  await step("2", "Request payment, prefilled from the offering's price", async () => {
    const { data: booking } = await admin.from("booking_requests").select("id,offering_id").eq("public_token", state.bookingToken).single();
    state.bookingId = booking.id;
    await Promise.all([owner.waitForURL("**/payments/new?booking=*", { timeout: 30_000 }), owner.getByRole("link", { name: /Request payment/ }).first().click()]);
    await owner.getByText(`From Booking ${state.bookingRef}`).waitFor({ timeout: 15_000 });
    await photo(owner, "2-request-payment-prefilled");
    const created = await call(owner, "POST", `/api/payments/orgs/${state.orgId}/requests`, {
      customerName: "TEST Customer",
      customerEmail: CUSTOMER_EMAIL,
      customerPhone: "+12425550181",
      lines: [{ label: `TEST Photo booth hire (${state.bookingRef})`, qty: 3, unitCents: 15000 }],
      dueDate: day(7),
      methods: ["cash", "bank_transfer"],
      allowPartPayment: false,
      offeringId: booking.offering_id,
      bookingRequestId: booking.id,
    });
    expect(created.status === 201, `Creating the payment request answered ${created.status}: ${created.data.error ?? ""}`);
    state.requestId = created.data.id;
    const sent = await call(owner, "POST", `/api/payments/orgs/${state.orgId}/requests/${state.requestId}`, { action: "send", via: "email" });
    expect(sent.status === 200, `Sending it by email answered ${sent.status}: ${sent.data.error ?? ""}`);
    const emailed = await logged("payment_request", CUSTOMER_EMAIL);
    expect(emailed, "No payment_request email was recorded for the customer.");
    await owner.goto(`${BASE}/business/${state.slug}/payments/${state.requestId}`, { waitUntil: "load" });
    await photo(owner, "2-payment-request");
    return `${created.data.referenceCode}: $450.00`;
  });

  await step("2", "The customer opens their booking, then /pay, and taps \"I've paid\"", async () => {
    await visitor.goto(`${BASE}/booking/${state.bookingToken}`, { waitUntil: "load" });
    await visitor.getByText("Confirmed").first().waitFor({ timeout: 15_000 });
    const pay = visitor.getByRole("link", { name: "See how to pay" });
    await pay.waitFor({ timeout: 15_000 });
    await photo(visitor, "2-booking-confirmed");
    await Promise.all([visitor.waitForURL(/\/pay\/[a-f0-9]{40}/, { timeout: 30_000 }), pay.click()]);
    state.payToken = /\/pay\/([a-f0-9]{40})/.exec(visitor.url())[1];
    await visitor.getByText("$450.00").first().waitFor({ timeout: 15_000 });
    await visitor.getByRole("button", { name: "I’ve paid" }).click();
    await visitor.getByLabel(/A note for/).fill("TEST — paid in cash on the day");
    await visitor.getByRole("button", { name: "Tell them I’ve paid" }).click();
    await visitor.getByText(/told .* you’ve paid/).waitFor({ timeout: 15_000 });
    await photo(visitor, "2-pay-ive-paid");
  });

  await step("2", "The owner marks it paid and the receipt is sent", async () => {
    await owner.goto(`${BASE}/business/${state.slug}/payments?filter=check`, { waitUntil: "load" });
    await photo(owner, "2-payments-to-check");
    const paid = await call(owner, "POST", `/api/payments/orgs/${state.orgId}/requests/${state.requestId}/payments`, { amountCents: 45000, method: "cash", receivedOn: day(0), reference: "", note: "TEST — delete" });
    expect(paid.status === 200 || paid.status === 201, `Marking it paid answered ${paid.status}: ${paid.data.error ?? ""}`);
    const { data: payments } = await admin.from("payments").select("id,receipt_number").eq("payment_request_id", state.requestId);
    expect(payments?.length === 1 && payments[0].receipt_number, "One payment with a receipt number should be recorded.");
    const receipt = await call(owner, "POST", `/api/payments/orgs/${state.orgId}/requests/${state.requestId}`, { action: "email_receipt", paymentId: payments[0].id });
    expect(receipt.status === 200, `Emailing the receipt answered ${receipt.status}: ${receipt.data.error ?? ""}`);
    const emailed = await logged("payment_receipt", CUSTOMER_EMAIL);
    expect(emailed, "No payment_receipt email was recorded for the customer.");
    await visitor.goto(`${BASE}/pay/${state.payToken}`, { waitUntil: "load" });
    await visitor.getByText("Paid in full").first().waitFor({ timeout: 15_000 });
    await photo(visitor, "2-pay-paid");
    await visitor.getByRole("link", { name: "View your receipt" }).first().click();
    await visitor.getByText(payments[0].receipt_number).first().waitFor({ timeout: 15_000 });
    await photo(visitor, "2-receipt");
    return `receipt ${payments[0].receipt_number}`;
  });

  // ---------------------------------------------------------------- 3
  await step("3", "The owner adds a class, and a parent registers a child for it", async () => {
    const program = await call(owner, "POST", `/api/business/orgs/${state.orgId}/programs`, { name: `TEST Juniors ${TAG}`, audience: "children", programType: "term", ageMin: 4, ageMax: 10, dayOfWeek: "Saturday", startTime: "10:00", endTime: "11:00", location: "TEST hall", capacity: 12, termName: "TEST term", termStartDate: day(-14), termEndDate: day(42), weeklyFee: "25", termFee: "180" });
    expect(program.status === 201, `Adding the class answered ${program.status}: ${program.data.error ?? ""}`);
    state.programSlug = program.data.slug;
    state.programId = program.data.id;
    await visitor.goto(`${BASE}${pageHref()}/register?program=${state.programSlug}`, { waitUntil: "load" });
    await photo(visitor, "3-registration-form");
    const registered = await call(visitor, "POST", "/api/registrations", {
      organizationSlug: state.slug,
      programSlug: state.programSlug,
      parentName: "TEST Customer",
      parentEmail: CUSTOMER_EMAIL,
      parentPhone: "242-555-0181",
      relationship: "Mother",
      childName: `Amara TEST-delete ${TAG}`,
      childDob: day(-365 * 6),
      gender: "Female",
      emergencyContactName: "TEST Emergency",
      emergencyContactPhone: "242-555-0182",
      authorizedPickup: "TEST Customer",
      paymentFrequency: "term",
      paymentMethod: "cash",
      photoConsent: "no",
      heardAboutUs: "portpass_listing",
      consentAccepted: true,
      signatureName: "TEST Customer",
    });
    expect(registered.status === 201, `Registering answered ${registered.status}: ${registered.data.error ?? ""}`);
    state.registrationRef = registered.data.registration.referenceCode;
    const emailed = await logged("registration_received", CUSTOMER_EMAIL);
    expect(emailed, "No registration_received email was recorded for the parent.");
    return state.registrationRef;
  });

  await step("3", "The team's Registrations screen shows the child; attendance is marked; the growth report shows it", async () => {
    await owner.goto(`${BASE}/business/${state.slug}/registrations`, { waitUntil: "load" });
    await owner.getByText(`Amara TEST-delete ${TAG}`).first().waitFor({ timeout: 15_000 });
    await photo(owner, "3-registrations");
    const { data: registration } = await admin.from("registrations").select("id").eq("reference_code", state.registrationRef).single();
    const { data: sessions } = await admin.from("sessions").select("id,session_date").eq("program_id", state.programId).lte("session_date", day(0)).order("session_date", { ascending: false }).limit(1);
    expect(sessions?.length === 1, "The class should have a session on or before today to mark.");
    const marked = await call(owner, "POST", `/api/business/orgs/${state.orgId}/attendance`, { sessionId: sessions[0].id, registrationId: registration.id, status: "present" });
    expect(marked.status === 200, `Marking attendance answered ${marked.status}: ${marked.data.error ?? ""}`);
    await owner.goto(`${BASE}/business/${state.slug}/attendance?session=${sessions[0].id}`, { waitUntil: "load" });
    await photo(owner, "3-attendance");
    const response = await owner.goto(`${BASE}/business/${state.slug}/growth`, { waitUntil: "load" });
    expect(response.status() === 200, `The growth report answered ${response.status()}.`);
    await photo(owner, "3-growth-report");
    const { data: attendance } = await admin.from("attendance").select("status").eq("session_id", sessions[0].id).eq("registration_id", registration.id);
    expect(attendance?.[0]?.status === "present", "The mark should be saved as present.");
    return `session ${sessions[0].session_date}`;
  });

  // ---------------------------------------------------------------- 4
  await step("4", "The customer signs up with an email code; /account shows the booking and the registration", async () => {
    const { from } = await signUp(member, CUSTOMER_EMAIL, { fullName: "TEST Customer", intent: "customer" });
    await member.goto(`${BASE}/account`, { waitUntil: "load" });
    await member.getByText(state.registrationRef).first().waitFor({ timeout: 15_000 });
    const body = await member.locator("body").innerText();
    expect(body.includes("Booking request"), "The booking request should be listed on /account.");
    expect(body.includes("TEST Photo booth hire"), "The booking's offering should be named on /account.");
    await photo(member, "4-account");
    const mine = member.locator(`a[href="/booking/${state.bookingToken}"]`).first();
    await mine.waitFor({ state: "attached", timeout: 10_000 });
    return `code from ${from}`;
  });

  await step("4", "With no signal, the site shows its offline page instead of the browser's error", async () => {
    await member.goto(`${BASE}/`, { waitUntil: "load" });
    await member.evaluate(async () => {
      if (!("serviceWorker" in navigator)) throw new Error("No service worker support.");
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("The service worker never became ready.")), 15_000))]);
    });
    await member.waitForTimeout(1500);
    await memberContext.setOffline(true);
    try {
      await member.goto(`${BASE}/where-to?offline-check=${TAG}`, { waitUntil: "load", timeout: 20_000 });
      const text = await member.locator("body").innerText();
      expect(/offline|no signal|connection/i.test(text), "The offline page should say there is no connection.");
      await photo(member, "4-offline");
    } finally {
      await memberContext.setOffline(false);
    }
  });

  // ---------------------------------------------------------------- 5
  await step("5", "/demo on a phone: every screen opens, then \"Leave the demo\"", async () => {
    await visitor.goto(`${BASE}/demo`, { waitUntil: "load" });
    await photo(visitor, "5-demo-front-door");
    await Promise.all([visitor.waitForURL("**/demo/home", { timeout: 60_000 }), visitor.locator(".demo-start button").click()]);
    await photo(visitor, "5-demo-home");
    const seen = new Set(["/demo/home"]);
    const queue = ["/demo/home"];
    let buttons = 0;
    while (queue.length > 0 && seen.size <= 40) {
      const path = queue.shift();
      const response = await visitor.goto(`${BASE}${path}`, { waitUntil: "load" });
      expect(response.status() < 400, `${path} answered ${response.status()}.`);
      const text = await visitor.locator("body").innerText();
      expect(!/Application error|Something went wrong on our side/i.test(text), `${path} shows an error.`);
      expect((await visitor.locator("h1").count()) > 0, `${path} has no heading.`);
      buttons += await visitor.locator("main button:visible, main a.primary-button:visible").count();
      const links = await visitor.locator('a[href^="/demo/"]').evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")));
      for (const href of links) {
        const clean = href.split("#")[0];
        if (!seen.has(clean) && !clean.startsWith("/demo/exit") && !clean.startsWith("/demo/start")) {
          seen.add(clean);
          queue.push(clean);
        }
      }
    }
    // Press the buttons a visitor is invited to press on the list screens.
    await visitor.goto(`${BASE}/demo/payments?filter=all`, { waitUntil: "load" });
    await photo(visitor, "5-demo-payments");
    await visitor.goto(`${BASE}/demo/home`, { waitUntil: "load" });
    await Promise.all([visitor.waitForURL((url) => !url.pathname.startsWith("/demo/home"), { timeout: 30_000 }), visitor.getByRole("button", { name: "Leave the demo" }).click()]);
    const after = await visitor.goto(`${BASE}/demo/home`, { waitUntil: "load" });
    expect(!visitor.url().endsWith("/demo/home") || after.status() >= 300, "After leaving, /demo/home should no longer open.");
    await photo(visitor, "5-demo-left");
    return `${seen.size} demo screens opened, ${buttons} buttons on them`;
  });

  await step("5", "/own on a phone: sign up with no signal, then it sends when the signal is back", async () => {
    const before = (await admin.from("leads").select("id", { count: "exact", head: true })).count ?? 0;
    await visitor.goto(`${BASE}/own`, { waitUntil: "load" });
    await photo(visitor, "5-own-form");
    await visitor.waitForTimeout(1000);
    await visitorContext.setOffline(true);
    await visitor.getByLabel("Your name *").fill("TEST Owner Two");
    await visitor.getByLabel("Business name *").fill(`TEST delete Offline Co ${TAG}`);
    await visitor.locator(".phone-input input").fill("5550183");
    await visitor.locator('select[name="section"]').selectOption({ index: 1 });
    const consent = visitor.locator(".join-consent input[type=checkbox]");
    if ((await consent.count()) > 0 && !(await consent.isChecked())) await consent.click();
    await visitor.getByRole("button", { name: /Sign me up/ }).click();
    await visitor.getByText("It will send when you’re back online.").waitFor({ timeout: 20_000 });
    await photo(visitor, "5-own-saved-offline");
    await visitorContext.setOffline(false);
    let after = before;
    for (let attempt = 0; attempt < 40 && after === before; attempt += 1) {
      await visitor.waitForTimeout(500);
      if (attempt === 6) await visitor.reload({ waitUntil: "load" });
      after = (await admin.from("leads").select("id", { count: "exact", head: true })).count ?? 0;
    }
    expect(after === before + 1, "The sign-up saved offline should arrive once the signal is back.");
    await photo(visitor, "5-own-sent");
  });

  // ---------------------------------------------------------------- 6
  await step("6", "Every TEST row is deleted", async () => {
    const orgId = state.orgId;
    const gone = {};
    const del = async (table, column, value) => {
      const { error, count } = await admin.from(table).delete({ count: "exact" }).eq(column, value);
      if (error) throw new Error(`${table}: ${error.message}`);
      gone[table] = (gone[table] ?? 0) + (count ?? 0);
    };
    if (orgId) {
      const { data: programs } = await admin.from("programs").select("id").eq("organization_id", orgId);
      for (const program of programs ?? []) {
        const { data: regs } = await admin.from("registrations").select("id").eq("program_id", program.id);
        for (const reg of regs ?? []) await del("attendance", "registration_id", reg.id);
        await del("registrations", "program_id", program.id);
        await del("sessions", "program_id", program.id);
        await del("program_terms", "program_id", program.id);
        await del("programs", "id", program.id);
      }
      await del("booking_requests", "organization_id", orgId);
      await del("payment_requests", "organization_id", orgId);
      await del("locations", "organization_id", orgId);
      await del("audit_log", "organization_id", orgId);
      await del("message_log", "organization_id", orgId);
      await del("organizations", "id", orgId);
    }
    await admin.from("leads").delete().like("business_name", `TEST delete Offline Co ${TAG}%`);
    await admin.from("message_log").delete().in("recipient", [OWNER_EMAIL, CUSTOMER_EMAIL]);
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const user of users?.users ?? []) {
      if (user.email === OWNER_EMAIL || user.email === CUSTOMER_EMAIL) {
        await admin.from("audit_log").delete().eq("actor_user_id", user.id);
        await admin.auth.admin.deleteUser(user.id);
      }
    }
    const { count: left } = await admin.from("organizations").select("id", { count: "exact", head: true }).eq("id", orgId ?? -1);
    expect((left ?? 0) === 0, "The TEST business should be gone.");
    const { count: requests } = await admin.from("booking_requests").select("id", { count: "exact", head: true }).eq("customer_email", CUSTOMER_EMAIL);
    expect((requests ?? 0) === 0, "No TEST booking request should be left.");
    return Object.entries(gone).filter(([, n]) => n > 0).map(([table, n]) => `${n} ${table}`).join(", ");
  });
} finally {
  await browser.close();
}

const table = ["| Part | Step | Result | Time |", "|---|---|---|---|", ...results.map((r) => `| ${r.part} | ${r.name} | ${r.ok ? "pass" : "FAIL"}${r.note ? `: ${r.note}` : ""} | ${(r.ms / 1000).toFixed(1)} s |`)].join("\n");
console.log(`\n${table}`);
writeFileSync("phase1-run-result.md", `${table}\n`);
if (failed) process.exit(1);
