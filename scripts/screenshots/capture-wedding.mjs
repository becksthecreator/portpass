// Captures the Wedding Desk gallery at phone width for the wedding
// screenshot job. Runs against `next start` on localhost with the TEST
// login from seed-wedding-fixture.ts, signing in with the one-run PIN the
// workflow generated (never printed). The refused shot types an outside
// link into a new photo and presses Save: the route answers 400 and
// nothing is written. Writes PNGs to ./screenshots.
import { mkdirSync } from "node:fs";
import { assertLocalSupabase } from "../../lib/localStackOnly.mjs";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
assertLocalSupabase();
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Refusing to run against anything but the app on localhost.");
const PIN = process.env.SCREENSHOT_PIN;
if (!PIN) throw new Error("SCREENSHOT_PIN is not set.");
mkdirSync("screenshots", { recursive: true });

async function addPhoto(page) {
  await page.getByRole("button", { name: "+ Add a photo" }).click();
  await page.locator(".wedding-admin-panel").last().waitFor();
}

async function refusedLink(page) {
  await addPhoto(page);
  const editor = page.locator(".wedding-admin-panel").last();
  await editor.locator('label:has-text("Image (path under") input').fill("https://tracker.example.com/pixel.gif");
  await editor.getByRole("button", { name: "Save" }).click();
  await editor.locator(".form-error").waitFor({ timeout: 30_000 });
}

// [file name, path, element to also capture on its own, what to do first]
const SHOTS = [
  ["wedding-gallery-intro-375", "/weddings/admin/gallery", ".staff-page-intro"],
  ["wedding-gallery-add-375", "/weddings/admin/gallery", ".wedding-admin-panel", addPhoto],
  ["wedding-gallery-refused-375", "/weddings/admin/gallery", ".form-error", refusedLink],
];

const browser = await chromium.launch();
const failed = [];
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/weddings/staff/login`, { waitUntil: "networkidle", timeout: 60_000 });
  const signIn = await page.evaluate(async (pin) => {
    const response = await fetch("/api/weddings/staff/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountKey: "test-wedding-desk", pin }) });
    return response.status;
  }, PIN);
  if (signIn !== 200) throw new Error(`Wedding Desk sign-in returned ${signIn}`);

  for (const [name, path, focus, act] of SHOTS) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
      if (act) await act(page);
      await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
      const element = page.locator(focus).last();
      await element.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `screenshots/${name}-viewport.png` });
      console.log(`captured ${name}`);
    } catch (error) {
      failed.push(name);
      console.error(`FAILED ${name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    }
  }
  // The page's width at 375px: no sideways scroll.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`horizontal overflow at 375px: ${overflow}px`);
  await context.close();
  if (failed.length) {
    console.error(`${failed.length} shot(s) failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
