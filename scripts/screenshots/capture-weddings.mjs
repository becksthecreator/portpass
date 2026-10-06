// Captures Bahamas Weddings By The Sea's page and the Wedding Desk's
// content screen at 375px, for the WeddingWire widgets becoming a member ID
// and three switches (security review of PR #183). Runs against
// `next start` on localhost and a local Supabase stack only. The wedding
// screenshot job runs it three times, named by SCREENSHOT_PHASE:
//
//   before  main's code on the database as it is live today
//   window  main's code after migration 202610190002: what is live between
//           applying the migration and merging
//   after   this branch's code
//
// Each run writes to screenshots/weddings/<phase>/: the PNGs; ssr.json, the
// page's proof and reviews sections as the server sends them; injected.json,
// every snippet the page puts into its WeddingWire containers, scripts
// included; and checks.json. compare-weddings.mjs checks the three agree.
// The Desk sign-in uses the one-run PIN the workflow generated (never
// printed).
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const PHASE = process.env.SCREENSHOT_PHASE ?? "";
const PIN = process.env.SCREENSHOT_PIN;
if (!["before", "window", "after"].includes(PHASE)) throw new Error("SCREENSHOT_PHASE must be before, window or after.");
if (!PIN) throw new Error("SCREENSHOT_PIN is not set.");
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Refusing to run against anything but the app on localhost.");
if (!process.env.SUPABASE_URL?.includes("127.0.0.1") && !process.env.SUPABASE_URL?.includes("localhost")) throw new Error("Refusing to read anything but a local Supabase stack.");

const PAGE = "/weddings/bahamas-weddings-by-the-sea";
const DESK_ACCOUNT = "test-delete-desk"; // seed-weddings-fixture.ts
const OUT = `screenshots/weddings/${PHASE}`;
mkdirSync(OUT, { recursive: true });
const checks = { phase: PHASE };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

// Every string the page sets as the innerHTML of one of its WeddingWire
// containers (ExternalWidget's .tpl-proof-widget, ReviewsPanel's
// .tpl-reviews-scroll; React's dangerouslySetInnerHTML sets innerHTML too).
await context.addInitScript(() => {
  const injected = [];
  Object.defineProperty(window, "__weddingWireInjected", { value: injected });
  const original = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  Object.defineProperty(Element.prototype, "innerHTML", {
    configurable: true,
    enumerable: original.enumerable,
    get() {
      return original.get.call(this);
    },
    set(value) {
      if (this.classList?.contains("tpl-proof-widget") || this.classList?.contains("tpl-reviews-scroll")) injected.push(String(value));
      original.set.call(this, value);
    },
  });
});

// WeddingWire's reviews widget is never loaded here: its content is real
// couples' names and words, which must not be copied into an artifact (the
// PR #26 rule). Its loader is refused, so the reviews panel shows the
// snippet's own fallback in every run alike; the badges load as on the site.
// Which WeddingWire requests were answered is noted for the summary.
await context.route(/^https:\/\/cdn1\.weddingwire\.com\/js\/wp-widget\.js/, (route) => route.abort());
const weddingWire = new Set();
const where = (url) => {
  const { host, pathname } = new URL(url);
  return `${host}${pathname}`;
};
context.on("response", (response) => {
  if (/(^|\.)weddingwire\.com$/.test(new URL(response.url()).hostname)) weddingWire.add(`${response.status()} ${where(response.url())}`);
});
context.on("requestfailed", (request) => {
  if (/(^|\.)weddingwire\.com$/.test(new URL(request.url()).hostname)) weddingWire.add(`not loaded ${where(request.url())}`);
});

const page = await context.newPage();
const failures = [];
try {
  // The two sections as the server sends them, before any script runs.
  const html = await (await page.request.get(`${BASE}${PAGE}`)).text();
  writeFileSync(
    `${OUT}/ssr.json`,
    JSON.stringify({
      proof: html.match(/<section class="tpl-proof"[\s\S]*?<\/section>/)?.[0] ?? null,
      reviews: html.match(/<section class="tpl-reviews">[\s\S]*?<\/section>/)?.[0] ?? null,
    }, null, 2),
  );

  // "load", not "networkidle": WeddingWire's own requests are not ours to wait on.
  await page.goto(`${BASE}${PAGE}`, { waitUntil: "load", timeout: 60_000 });
  // Down the whole page, so every widget and lazy photo comes into view,
  // then time for the deferred loaders (a 4 s fallback, and the reviews
  // panel's 6 s wait for WeddingWire's content).
  for (let step = 0; step < 40; step += 1) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(8000);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/wedding-page-375.png`, fullPage: true });
  for (const [name, selector] of [["wedding-proof-375", ".tpl-proof"], ["wedding-reviews-375", ".tpl-reviews"]]) {
    const element = page.locator(selector).first();
    if (await element.count()) await element.screenshot({ path: `${OUT}/${name}.png` });
  }
  writeFileSync(`${OUT}/injected.json`, JSON.stringify((await page.evaluate(() => window.__weddingWireInjected)).sort(), null, 2));
  checks.pageWiderThanPhone = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  checks.weddingWireRequests = [...weddingWire].sort();
  console.log(`captured the wedding page (${PHASE})`);

  // The Wedding Desk's content screen, as the TEST Desk account.
  await page.goto(`${BASE}/weddings/staff/login`, { waitUntil: "networkidle" });
  const signIn = await page.evaluate(async ({ accountKey, pin }) => {
    const response = await fetch("/api/weddings/staff/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountKey, pin }) });
    return response.status;
  }, { accountKey: DESK_ACCOUNT, pin: PIN });
  if (signIn !== 200) throw new Error(`The Desk sign-in returned ${signIn}`);
  await page.goto(`${BASE}/weddings/admin/content`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.screenshot({ path: `${OUT}/wedding-desk-content-375.png`, fullPage: true });
  checks.deskWiderThanPhone = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  if (PHASE === "after") {
    // What the screen shows, and a save with nothing changed: it works, and
    // the audit log has it, with the account that saved.
    checks.memberIdShown = await page.getByLabel("WeddingWire member ID").inputValue();
    checks.switchesOn = await page.locator(".wedding-admin-checks input[type=checkbox]").evaluateAll((boxes) => boxes.map((box) => box.checked));
    checks.textareasLeft = await page.locator("textarea").count();
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText("Saved ✓").waitFor({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/wedding-desk-content-saved-375.png`, fullPage: true });
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { count } = await db.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "wedding_site.updated").eq("after->>by", `desk:${DESK_ACCOUNT}`);
    checks.auditEntries = count ?? 0;
  }
  if (PHASE === "window") {
    // main's screen still shows the snippets, now built by the database,
    // and its save, which writes HTML, is refused.
    await page.getByRole("button", { name: "Save" }).click();
    await page.locator(".form-error").waitFor({ timeout: 15_000 });
    checks.oldSaveRefused = (await page.locator(".form-error").textContent())?.trim() ?? "";
    await page.screenshot({ path: `${OUT}/wedding-desk-content-old-save-refused-375.png`, fullPage: true });
  }
  console.log(`captured the Desk's content screen (${PHASE})`);
} catch (error) {
  failures.push(error instanceof Error ? error.message.split("\n")[0] : String(error));
  console.error(`FAILED (${PHASE}): ${failures.at(-1)}`);
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
} finally {
  checks.failures = failures;
  writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  await browser.close();
}
if (failures.length) process.exitCode = 1;
