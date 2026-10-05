// Captures staff and admin pages at phone width for the staff screenshot
// job. Runs against `next start` on localhost with the TEST fixture from
// seed-staff-fixture.ts. Staff pages: signs in with the one-run PIN the
// workflow generated (never printed). Admin pages: signs in as the TEST
// platform owner through the real routes (a one-time code issued by the
// local Supabase stack, then an authenticator code computed here from the
// secret that enrolment returns). Writes PNGs to ./screenshots.
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
// A secret key issues the sign-in codes here, so this only ever runs
// against a local Supabase stack and the app on localhost.
if (!process.env.SUPABASE_URL?.includes("127.0.0.1") && !process.env.SUPABASE_URL?.includes("localhost")) throw new Error("Refusing to sign in to anything but a local Supabase stack.");
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Refusing to run against anything but the app on localhost.");
const PIN = process.env.SCREENSHOT_PIN;
const fixture = JSON.parse(readFileSync(process.env.SCREENSHOT_FIXTURE, "utf8"));
if (!PIN) throw new Error("SCREENSHOT_PIN is not set.");
mkdirSync("screenshots", { recursive: true });

// [file name, account, path, element to also capture on its own, link to press first]
// account "admin" is the TEST platform owner; "anon" is a visitor; "demo"
// is a visitor who pressed "Open the demo"; anything else is a staff PIN
// account. The fifth item, when there is one, is pressed after the page
// loads and the screen it opens is the one captured.
const SHOTS = [
  ["brief12-roster-coaches-today-375", "test-coach", `/futprep/staff/coach?session=${fixture.sessionId}`, ".coach-ratio"],
  // Brief 13: Alex's Coach pay view, a coach's own view, and who coached.
  ["brief13-coach-pay-ceo-375", "test-ceo", "/futprep/staff/pay", null],
  ["brief13-coach-pay-coach-375", "test-coach", "/futprep/staff/pay", null],
  ["brief13-roster-who-coached-375", "test-coach", `/futprep/staff/coach?session=${fixture.sessionId}`, ".coach-staff"],
  // Brief 16: the coach's own card on the public coaches page, with the
  // "add your weekly slots" prompt; the Team page's photo upload.
  ["brief16-coaches-own-prompt-375", "test-coach", "/futprep/coaches", ".coach-own-prompt"],
  ["brief16-team-photo-upload-375", "test-ceo", "/futprep/staff/team", ".team-photo-actions"],
  // Brief 05: the growth report, with the CEO login.
  ["brief05-growth-report-375", "test-ceo", "/futprep/staff/growth", ".growth-panel"],
  // Brief 08: Admin -> Businesses (approve, send back, publish, claim link,
  // suspend) and People & access.
  ["brief08-admin-businesses-375", "admin", "/admin/businesses", ".admin-row-actions"],
  ["brief08-admin-people-375", "admin", "/admin/people", ".admin-table"],
  // Brief 19, part D: what each business's page is missing, in one table.
  ["brief19-d-admin-missing-375", "admin", "/admin/businesses", "#missing"],
  // Brief 19, part F: what is in place and what is left, from live state.
  ["brief19-f-admin-phase1-375", "admin", "/admin/phase1", ".p1-total"],
  // Brief 08, build B: bookings across every business, one registration
  // with its health details hidden behind Reveal, payments month by month,
  // the leads board, and Content.
  ["brief08-admin-bookings-375", "admin", "/admin/bookings", ".admin-table"],
  ["brief08-admin-registration-reveal-375", "admin", `/admin/bookings/registrations/${fixture.registrationId}`, ".admin-reveal"],
  ["brief08-admin-payments-months-375", "admin", "/admin/payments/recorded?view=months", ".admin-table"],
  ["brief08-admin-leads-board-375", "admin", "/admin/leads?view=board", ".leads-board"],
  ["brief08-admin-content-375", "admin", "/admin/content", ".admin-content-form"],
  // Brief 08, build C: the Overview with its health tiles, the Messages
  // log, Health and Settings.
  ["brief08-admin-overview-375", "admin", "/admin", "#health"],
  ["brief08-admin-messages-375", "admin", "/admin/messages", ".admin-table"],
  ["brief08-admin-health-375", "admin", "/admin/health", ".admin-facts"],
  ["brief08-admin-settings-375", "admin", "/admin/settings", ".admin-table"],
  // Brief 09: Admin -> Billing, one draft invoice, and one account.
  ["brief09-admin-billing-375", "admin", "/admin/billing", ".billing-morning"],
  ["brief09-admin-invoice-375", "admin", `/admin/billing/invoices/${fixture.billingDraftId}`, ".billing-lines"],
  ["brief09-admin-billing-account-375", "admin", `/admin/billing/accounts/${fixture.billingOrgId}`, ".billing-form"],
  // Brief 14: Admin -> Leads with five TEST leads, and one lead's card.
  ["brief14-leads-table-375", "admin", "/admin/leads", ".leads-table"],
  ["brief14-lead-card-375", "admin", `/admin/leads/${fixture.leadId}`, ".lead-panel"],
  // Brief 10: the Member Pass, a business's perk screen (reached by PortPass
  // staff through the platform door), Admin -> Perks, and the public side.
  ["brief10-member-pass-375", "admin", "/pass", ".pass-code-box"],
  ["brief10-business-perks-375", "admin", "/business/test-delete-photo-booth/perks", ".pass-check"],
  ["brief10-admin-perks-375", "admin", "/admin/perks", ".admin-table"],
  ["brief10-perks-page-375", "admin", "/perks", null],
  ["brief10-home-perks-row-375", "admin", "/", null],
  ["brief10-section-card-chip-375", "admin", "/entertainment", null],
  ["brief10-business-page-perk-375", "admin", "/entertainment/test-delete-photo-booth", null],
  // Brief 11: Admin -> Guides with the five drafts, a draft's editor, and
  // the site search.
  ["brief11-admin-guides-375", "admin", "/admin/guides", ".admin-table"],
  ["brief11-guide-editor-375", "admin", `/admin/guides/${fixture.guideId}`, ".guide-editor"],
  // Brief 18, part A: the homepage (open now, live sections, one "Coming
  // next" row), a section with nothing live yet, "Tell us what you need"
  // and /business.
  ["brief18-home-375", "admin", "/", ".home-coming-next"],
  ["brief18-section-soon-375", "admin", "/venues", ".soon-panel"],
  ["brief18-tell-us-375", "admin", "/tell-us", null],
  ["brief18-business-375", "admin", "/business", ".biz-shots"],
  // Brief 18, part F: the header a visitor sees (Sign in · Sign up), the
  // sign-up doors, and My account.
  ["brief18-header-signed-out-375", "anon", "/", null],
  ["brief18-signup-375", "anon", "/signup?as=customer", ".auth-doors"],
  ["brief18-account-375", "admin", "/account", null],
  // Brief 18, part G: a lime brand colour with no photo and no WhatsApp
  // number (as Carv is): the brand header, navy on lime, the Enquire form.
  ["brief18-lime-preview-375", "admin", "/business/test-delete-lime-gym/preview", ".tpl-enquire"],
  // Brief 18, part D: registration for a TEST business in its own colour:
  // the class step with a children's and an adults' class, and an adult's
  // form (no child or health steps).
  ["brief18-register-themed-375", "anon", "/entertainment/test-delete-photo-booth/register", ".class-choice-grid"],
  ["brief18-register-adult-375", "anon", "/entertainment/test-delete-photo-booth/register?program=test-delete-adult-fitness", ".registration-progress"],
  // Brief 18, part C: the 30-second sign-up form, the printable kit, and
  // the sign-ups in Admin -> Leads and on the Overview.
  ["brief18-own-375", "anon", "/own", ".application-form"],
  ["brief18-join-event-375", "anon", "/join/school-fair-nov", null],
  ["brief18-own-kit-375", "admin", "/own/kit", ".kit-grid"],
  ["brief18-leads-event-375", "admin", "/admin/leads?event=own2026", ".leads-events"],
  ["brief11-search-375", "admin", "/search?q=kids+football", ".search-results"],
  // Brief 18, part B: the demo business. Its front door, then every screen
  // a visitor reaches with a demo session (example data only).
  ["brief18-demo-375", "anon", "/demo", ".demo-start"],
  ["brief18-demo-home-375", "demo", "/demo/home", ".biz-home-grid"],
  ["brief18-demo-booking-375", "demo", "/demo/booking", "#offerings"],
  ["brief18-demo-registrations-375", "demo", "/demo/registrations", "#reg-people"],
  ["brief18-demo-registration-375", "demo", "/demo/registrations", ".account-details", "#reg-people + .reg-list a"],
  ["brief18-demo-payments-375", "demo", "/demo/payments?filter=all", ".preq-list"],
  ["brief18-demo-request-375", "demo", "/demo/payments?filter=overdue", "#preq-send", "a.preq-row"],
  ["brief18-demo-chase-375", "demo", "/demo/payments/chase", ".preq-chase"],
  ["brief18-demo-attendance-375", "demo", "/demo/attendance", ".reg-list"],
  ["brief18-demo-register-375", "demo", "/demo/attendance", ".att-register", ".reg-list a"],
  ["brief18-demo-growth-375", "demo", "/demo/growth", ".growth-panel"],
  // A real (TEST) business's own attendance register.
  ["brief18-business-attendance-375", "admin", "/business/test-delete-photo-booth/attendance", null],
];

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
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

async function post(page, url, body) {
  return page.evaluate(async ({ url, body }) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }, { url, body });
}

async function staffSignIn(page, account) {
  await page.goto(`${BASE}/futprep/staff/login`, { waitUntil: "networkidle" });
  const signIn = await post(page, "/api/futprep/staff/session", { accountKey: account, pin: PIN });
  if (signIn.status !== 200) throw new Error(`Sign-in as ${account} returned ${signIn.status}`);
}

async function adminSignIn(page) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email: fixture.adminEmail });
  if (error || !data?.properties?.email_otp) throw new Error(`Could not issue a sign-in code: ${error?.message ?? "no code"}`);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const verified = await post(page, "/api/auth/verify", { email: fixture.adminEmail, token: data.properties.email_otp });
  if (verified.status !== 200) throw new Error(`Admin sign-in returned ${verified.status}`);

  const enrolled = await post(page, "/api/admin/mfa/enroll", {});
  if (enrolled.status !== 200 || !enrolled.data.secret) throw new Error(`Two-step enrolment returned ${enrolled.status}`);
  const stepUp = await post(page, "/api/admin/mfa/verify", { factorId: enrolled.data.factorId, code: totp(enrolled.data.secret) });
  if (stepUp.status !== 200) throw new Error(`Two-step verification returned ${stepUp.status}`);
}

// One tap on /demo: the demo session a visitor gets.
async function demoStart(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await Promise.all([page.waitForURL("**/demo/home", { timeout: 60_000 }), page.locator(".demo-start button").click()]);
}

const browser = await chromium.launch();
// One signed-in browser context per account, reused for all its shots: an
// authenticator code can't be used twice, so the admin signs in once.
const contexts = new Map();
const reports = new Map();
async function pageFor(account) {
  if (!contexts.has(account)) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    // What keeps a page from settling: every request this browser makes
    // (the page's and the service worker's) is timed, and the ones that
    // took seconds, failed or never finished are named after a slow shot.
    const open = new Map();
    const slow = [];
    const where = (request) => `${request.method()} ${new URL(request.url()).pathname}${request.serviceWorker() ? " (service worker)" : ""}`;
    context.on("request", (request) => open.set(request, Date.now()));
    const closed = (how) => (request) => {
      const ms = Date.now() - (open.get(request) ?? Date.now());
      open.delete(request);
      if (ms > 3000) slow.push(`${how} after ${ms} ms: ${where(request)}`);
    };
    context.on("requestfinished", closed("finished"));
    context.on("requestfailed", closed("failed"));
    reports.set(account, () => {
      const lines = [...slow.splice(0), ...[...open.entries()].filter(([, at]) => Date.now() - at > 3000).map(([request, at]) => `still open after ${Date.now() - at} ms: ${where(request)}`)];
      return lines;
    });
    // "anon" is a visitor who hasn't signed in.
    if (account === "admin") await adminSignIn(page);
    else if (account === "demo") await demoStart(page);
    else if (account !== "anon") await staffSignIn(page, account);
    contexts.set(account, { context, page });
  }
  return contexts.get(account).page;
}

// One slow or broken page must not lose every shot after it: a failed shot
// is reported, the rest are still taken, and the job fails at the end.
const failed = [];
try {
  // The product shots on /business (brief 18, A7) come from the demo
  // business: its requests list, a customer's page with money owing, and
  // one that is paid. The links are read from the demo's own rows.
  await pageFor("demo");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data: demoOrg } = await supabase.from("organizations").select("id").eq("is_demo", true).maybeSingle();
  const { data: demoRequests } = demoOrg ? await supabase.from("payment_requests").select("reference_code,public_token").eq("organization_id", demoOrg.id).in("reference_code", ["HKC-0013", "HKC-0001"]) : { data: [] };
  const payPath = (reference) => `/pay/${(demoRequests ?? []).find((r) => r.reference_code === reference)?.public_token ?? "missing"}`;
  SHOTS.push(
    ["product-shot-requests", "demo", "/demo/payments?filter=all", ".preq-list"],
    ["product-shot-pay", "anon", payPath("HKC-0013"), ".paypage-demo"],
    ["product-shot-paid", "anon", payPath("HKC-0001"), ".paypage-demo"],
  );

  for (const [name, account, path, focus, press] of SHOTS) {
    const started = Date.now();
    let loaded = started;
    try {
      const page = await pageFor(account);
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
      if (press) {
        await page.locator(press).first().click();
        await page.waitForLoadState("networkidle", { timeout: 60_000 });
        if (focus) await page.locator(focus).first().waitFor({ timeout: 30_000 });
      }
      loaded = Date.now();
      await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
      if (focus) {
        const element = page.locator(focus).first();
        await element.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `screenshots/${name}-viewport.png` });
      }
      console.log(`captured ${name} (loaded in ${loaded - started} ms, shot in ${Date.now() - loaded} ms)`);
      const report = reports.get(account)?.() ?? [];
      if (loaded - started > 10_000) for (const line of report) console.log(`  ${line}`);
    } catch (error) {
      failed.push(name);
      console.error(`FAILED ${name} after ${Date.now() - started} ms: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    }
  }
  if (failed.length) {
    console.error(`${failed.length} shot(s) failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  for (const { context } of contexts.values()) await context.close();
  await browser.close();
}
