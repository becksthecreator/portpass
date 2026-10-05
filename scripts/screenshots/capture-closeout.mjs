// Captures the Phase 1 close-out screens (brief 19) at phone width. Runs
// against `next start` on localhost with the TEST business from
// seed-closeout-fixture.ts. The customer's pages need no sign-in; the
// business's pages sign in as the TEST owner through the real routes (a
// one-time code issued by the local Supabase stack). The one request sent
// through the form goes to a reserved test address that is never emailed.
// Writes PNGs to ./screenshots.
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const fixture = JSON.parse(readFileSync(process.env.SCREENSHOT_FIXTURE, "utf8"));
mkdirSync("screenshots", { recursive: true });

async function post(page, url, body) {
  return page.evaluate(async ({ url, body }) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }, { url, body });
}

async function ownerSignIn(page) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email: fixture.ownerEmail });
  if (error || !data?.properties?.email_otp) throw new Error(`Could not issue a sign-in code: ${error?.message ?? "no code"}`);
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  const verified = await post(page, "/api/auth/verify", { email: fixture.ownerEmail, token: data.properties.email_otp });
  if (verified.status !== 200) throw new Error(`Owner sign-in returned ${verified.status}`);
}

const failures = [];
async function shoot(page, name, path, { focus = null, before = null } = {}) {
  const started = Date.now();
  try {
    if (path) {
      await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(1200);
    }
    if (before) await before(page);
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
    if (focus) {
      await page.locator(focus).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/${name}-viewport.png` });
    }
    console.log(`captured ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    failures.push(name);
    console.error(`failed ${name}:`, error.message);
  }
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageHref = `/${fixture.category}/${fixture.slug}`;

  // Part A, the customer's side. The business's page: every priced
  // offering with no link of its own has "Request to book".
  await shoot(page, "brief19-a-offering-request-to-book-375", pageHref, { focus: "#offerings" });
  await shoot(page, "brief19-a-book-form-375", `${pageHref}/book?offering=photo-booth`);
  await shoot(page, "brief19-a-book-form-kids-375", `${pageHref}/book?offering=kids-party`, { focus: ".bkg-tick" });
  // Fill it in and send it: the customer lands on their own page.
  await shoot(page, "brief19-a-book-form-filled-375", `${pageHref}/book?offering=photo-booth`, {
    before: async (p) => {
      await p.getByLabel("Date *").fill(day(14));
      await p.getByLabel("Time").fill("18:00");
      await p.getByLabel("How many hours?").fill("3 hours");
      await p.getByLabel("Where").fill("TEST — Sandyport Beach Club");
      await p.getByLabel(/Anything .* should know/).fill("TEST — delete. A birthday party.");
      await p.getByLabel("Your name *").fill("TEST Screenshot Customer");
      await p.locator(".phone-input input").fill("5550110");
      await p.getByLabel("Email *").fill("test-delete-screenshot@test.portpass.local");
    },
  });
  await shoot(page, "brief19-a-booking-sent-375", null, {
    before: async (p) => {
      await p.getByRole("button", { name: /Send request/ }).click();
      await p.waitForURL(/\/booking\/[a-f0-9]{40}/, { timeout: 30_000 });
      await p.waitForTimeout(1000);
    },
  });
  await shoot(page, "brief19-a-booking-new-375", `/booking/${fixture.new1.token}`);
  await shoot(page, "brief19-a-booking-confirmed-with-payment-375", `/booking/${fixture.confirmed.token}`);
  await shoot(page, "brief19-a-booking-declined-375", `/booking/${fixture.declined.token}`);
  await shoot(page, "brief19-a-booking-cancel-ask-375", `/booking/${fixture.new2.token}`, {
    focus: "#booking-change",
    before: async (p) => {
      await p.getByRole("button", { name: "Cancel this request" }).click();
    },
  });

  // Part A, the business's side, signed in as the TEST owner.
  await ownerSignIn(page);
  const base = `/business/${fixture.slug}`;
  await shoot(page, "brief19-a-business-home-375", base, { focus: ".bkg-home-count" });
  // Part D: what this business's page is missing, on its own home.
  await shoot(page, "brief19-d-business-missing-375", base, { focus: ".pchk" });
  await shoot(page, "brief19-a-bookings-new-375", `${base}/bookings`);
  await shoot(page, "brief19-a-bookings-decline-reason-375", `${base}/bookings`, {
    focus: ".bkg-decline",
    before: async (p) => {
      await p.getByRole("button", { name: "Decline" }).first().click();
      await p.getByLabel(/Why can.t you take it/).fill("TEST — we're fully booked that day. Could you do the Sunday?");
    },
  });
  await shoot(page, "brief19-a-bookings-confirmed-375", `${base}/bookings?tab=confirmed`);
  await shoot(page, "brief19-a-bookings-done-375", `${base}/bookings?tab=done`);
  await shoot(page, "brief19-a-bookings-declined-375", `${base}/bookings?tab=declined`);
  // "Request payment" on a confirmed booking: prefilled from the offering.
  await shoot(page, "brief19-a-request-payment-prefilled-375", `${base}/payments/new?booking=${fixture.confirmed2.id}`);
  await context.close();
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`Shots that failed: ${failures.join(", ")}`);
  process.exit(1);
}
