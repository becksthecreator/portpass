// Captures staff pages at phone width for the staff screenshot job. Runs
// against `next start` on localhost with the TEST fixture from
// seed-staff-fixture.ts; signs in with the one-run PIN the workflow
// generated (never printed). Writes PNGs to ./screenshots.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const PIN = process.env.SCREENSHOT_PIN;
const fixture = JSON.parse(readFileSync(process.env.SCREENSHOT_FIXTURE, "utf8"));
if (!PIN) throw new Error("SCREENSHOT_PIN is not set.");
mkdirSync("screenshots", { recursive: true });

// [file name, account, path, element to also capture on its own]
const SHOTS = [
  ["brief12-roster-coaches-today-375", "test-coach", `/futprep/staff/coach?session=${fixture.sessionId}`, ".coach-ratio"],
  // Brief 13: Alex's Coach pay view, a coach's own view, and who coached.
  ["brief13-coach-pay-ceo-375", "test-ceo", "/futprep/staff/pay", null],
  ["brief13-coach-pay-coach-375", "test-coach", "/futprep/staff/pay", null],
  ["brief13-roster-who-coached-375", "test-coach", `/futprep/staff/coach?session=${fixture.sessionId}`, ".coach-staff"],
];

const browser = await chromium.launch();
try {
  for (const [name, account, path, focus] of SHOTS) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`${BASE}/futprep/staff/login`, { waitUntil: "networkidle" });
    const signIn = await page.evaluate(async ({ accountKey, pin }) => {
      const response = await fetch("/api/futprep/staff/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountKey, pin }) });
      return response.status;
    }, { accountKey: account, pin: PIN });
    if (signIn !== 200) throw new Error(`Sign-in as ${account} returned ${signIn}`);

    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
    if (focus) {
      const element = page.locator(focus).first();
      await element.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `screenshots/${name}-viewport.png` });
    }
    console.log(`captured ${name}`);
    await context.close();
  }
} finally {
  await browser.close();
}
