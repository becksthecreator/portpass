// Captures the payment request screens (brief 17) at phone width for the
// payments screenshot job. Runs against `next start` on localhost with the
// TEST business from seed-payments-fixture.ts. The customer's /pay pages
// need no sign-in; the business's pages sign in as the TEST owner through
// the real routes (a one-time code issued by the local Supabase stack).
// Nothing is sent: no button that messages anyone is pressed. Writes PNGs
// to ./screenshots.
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
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    if (before) await before(page);
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
    if (focus) {
      await page.locator(focus).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `screenshots/${name}-viewport.png` });
    }
    console.log(`captured ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`failed ${name}:`, error.message);
  }
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  // The customer's side: unpaid, paid, and the receipt.
  await shoot(page, "brief17-pay-unpaid-375", `/pay/${fixture.unpaid.token}`, { focus: "#paypage-how" });
  await shoot(page, "brief17-pay-ive-paid-375", `/pay/${fixture.unpaid.token}`, {
    focus: ".paypage-said",
    before: async (p) => {
      await p.getByRole("button", { name: "I’ve paid" }).click();
      await p.getByLabel(/A note for/).fill("Sent by transfer, ref 1234");
    },
  });
  await shoot(page, "brief17-pay-paid-375", `/pay/${fixture.paid.token}`);
  await shoot(page, "brief17-pay-receipt-375", `/pay/${fixture.paid.token}/receipt`);
  await shoot(page, "brief17-pay-part-paid-375", `/pay/${fixture.part.token}`);

  // The business's side, signed in as the TEST owner.
  await ownerSignIn(page);
  const base = `/business/${fixture.slug}/payments`;
  await shoot(page, "brief17-requests-list-375", base, { focus: ".preq-list" });
  await shoot(page, "brief17-new-request-375", `${base}/new`, {
    before: async (p) => {
      await p.getByLabel("Name", { exact: true }).fill("TEST Parent Pinder");
      await p.getByLabel("WhatsApp / phone").fill("242 555 0110");
      await p.getByLabel("Line 1", { exact: true }).fill("Lil Kickers term fee — Ava");
      await p.getByLabel("Price ($)", { exact: true }).fill("420");
    },
  });
  await shoot(page, "brief17-new-request-preview-375", `${base}/new`, {
    before: async (p) => {
      await p.getByLabel("Name", { exact: true }).fill("TEST Parent Pinder");
      await p.getByLabel("WhatsApp / phone").fill("242 555 0110");
      await p.getByLabel("Line 1", { exact: true }).fill("Lil Kickers term fee — Ava");
      await p.getByLabel("Price ($)", { exact: true }).fill("420");
      await p.getByRole("button", { name: "Preview" }).click();
      await p.waitForTimeout(600);
    },
  });
  await shoot(page, "brief17-request-detail-375", `${base}/${fixture.unpaid.id}`);
  await shoot(page, "brief17-request-check-375", `${base}/${fixture.says.id}`);
  await shoot(page, "brief17-chase-375", `${base}/chase`);
  await shoot(page, "brief17-settings-375", `${base}/settings`);
  // Brief 18, part E: the Get paid step in the business's setup, and the
  // test request the owner sends themselves.
  await shoot(page, "brief18-get-paid-step-375", `/business/${fixture.slug}/settings?step=5`, { focus: ".preq-methods" });
  await shoot(page, "brief18-test-request-375", `${base}/settings`, {
    focus: ".preq-test",
    before: async (p) => {
      await p.getByRole("button", { name: "Send yourself a test request" }).click();
      await p.waitForTimeout(1500);
    },
  });
  await context.close();
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`Shots that failed: ${failures.join(", ")}`);
  process.exit(1);
}
