// Motion checks (brief 22, M1), run by .github/workflows/motion-checks.yml
// against `next start` on localhost with the local Supabase stack's TEST
// data. It proves the rules the brief set, and photographs the motion:
//
//   1. With reduced motion asked for, nothing animates on / after load
//      (document.getAnimations() is empty), and every reveal shows its
//      final state.
//   2. Without JavaScript, the hero headline, image and both buttons are
//      visible on the first screen, and no reveal is held hidden.
//   3. On a phone with the CPU slowed 4x: a filmstrip of the first 1.8 s
//      and of the first section revealing, every reveal has arrived after
//      one scroll through the page, and the layout shift (CLS) stays
//      under 0.05.
//
// Writes motion-checks/report.md and motion-checks/frames/*.png, and exits
// 1 when a check fails.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.MOTION_BASE_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Refusing to run against anything but the app on localhost.");

const OUT = "motion-checks";
mkdirSync(`${OUT}/frames`, { recursive: true });
const PHONE = { width: 375, height: 812 };
const CLS_LIMIT = 0.05;

const lines = [];
let failed = 0;
function check(ok, label, detail = "") {
  lines.push(`- ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed += 1;
}
const pad = (ms) => String(ms).padStart(4, "0");
const notAtFullOpacity = () => Array.from(document.querySelectorAll("[data-reveal], [data-reveal][data-stagger] > *")).filter((el) => getComputedStyle(el).opacity !== "1").length;

// Layout shifts, summed the way Lighthouse's CLS sums them (shifts that
// follow the visitor's own input are left out).
const CLS_SCRIPT = `
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  } catch (error) { window.__clsUnsupported = true; }
`;

const browser = await chromium.launch();
try {
  // 1. Reduced motion.
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const running = await page.evaluate(() => document.getAnimations().length);
    check(running === 0, "reduced motion: no animation runs on / after load", `${running} running`);
    const attr = await page.evaluate(() => document.documentElement.getAttribute("data-motion"));
    check(attr === "on" || attr === "off", "the kill switch is on <html>", `data-motion="${attr}"`);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(600);
    const later = await page.evaluate(() => document.getAnimations().length);
    check(later === 0, "reduced motion: nothing animates after scrolling to the end", `${later} running`);
    const hidden = await page.evaluate(notAtFullOpacity);
    check(hidden === 0, "reduced motion: every reveal shows its final state", `${hidden} not at full opacity`);
    await page.screenshot({ path: `${OUT}/frames/reduced-motion-end-375.png` });
    await context.close();
  }

  // 2. Without JavaScript.
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    const visible = async (selector) => {
      const el = page.locator(selector).first();
      const box = await el.boundingBox().catch(() => null);
      const opacity = await el.evaluate((node) => getComputedStyle(node).opacity).catch(() => "0");
      return Boolean(box && box.height > 0 && box.y < PHONE.height && opacity === "1");
    };
    check(await visible(".pp-hero h1"), "without JavaScript: the hero headline is on the first screen");
    check(await visible(".pp-hero-frame img"), "without JavaScript: the hero image is on the first screen");
    check((await visible(".pp-hero-actions a:nth-child(1)")) && (await visible(".pp-hero-actions a:nth-child(2)")), "without JavaScript: both hero buttons are on the first screen");
    const held = await page.evaluate(() => document.documentElement.hasAttribute("data-motion-js"));
    check(!held, "without JavaScript: no reveal is held hidden (data-motion-js is not set)");
    const hidden = await page.evaluate(notAtFullOpacity);
    check(hidden === 0, "without JavaScript: every reveal is visible", `${hidden} not at full opacity`);
    await page.screenshot({ path: `${OUT}/frames/no-javascript-375.png` });
    await context.close();
  }

  // 3. A phone with the CPU slowed 4x: the filmstrip, the reveals, CLS.
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(CLS_SCRIPT);
    const started = Date.now();
    await page.goto(`${BASE}/`, { waitUntil: "commit" });
    for (const t of [0, 150, 300, 450, 600, 900, 1200, 1800]) {
      const wait = started + t - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      await page.screenshot({ path: `${OUT}/frames/home-load-${pad(t)}ms-375.png` });
    }
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);
    const headline = await page.locator(".pp-hero h1").first().evaluate((node) => getComputedStyle(node).opacity);
    check(headline === "1", "the hero headline is at full opacity once loaded");
    const total = await page.evaluate(() => document.querySelectorAll("[data-reveal]").length);
    await page.evaluate(() => document.querySelector("#chooser")?.scrollIntoView({ behavior: "instant", block: "start" }));
    for (const t of [0, 150, 300, 450, 600, 900]) {
      if (t) await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/frames/home-chooser-${pad(t)}ms-375.png` });
    }
    // One scroll through the page, a screen at a time, so every reveal has
    // had its chance to come into view.
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += Math.round(PHONE.height * 0.8)) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1000);
    const arrived = await page.evaluate(() => document.querySelectorAll("[data-reveal][data-in]").length);
    check(arrived === total, "every reveal arrived during one scroll through the page", `${arrived} of ${total}`);
    const hidden = await page.evaluate(notAtFullOpacity);
    check(hidden === 0, "after the scroll, nothing is still hidden", `${hidden} not at full opacity`);
    const cls = await page.evaluate(() => (window.__clsUnsupported ? null : Number(window.__cls.toFixed(4))));
    check(cls !== null && cls < CLS_LIMIT, `layout shift on / is under ${CLS_LIMIT}`, cls === null ? "layout-shift not supported here" : `CLS ${cls}`);
    lines.push(`- Reveals on /: ${total}. CLS after load and one full scroll (4x CPU throttle, 375px): ${cls ?? "not measured"}.`);
    await context.close();
  }
} finally {
  await browser.close();
}

const report = ["# Motion checks", "", `Against ${BASE} at 375px.`, "", ...lines, "", "Frames: motion-checks/frames/ (home-load-*: the first 1.8 s; home-chooser-*: the first section revealing)."].join("\n");
writeFileSync(`${OUT}/report.md`, `${report}\n`);
console.log(report);
if (failed) {
  console.error(`${failed} motion check(s) failed.`);
  process.exit(1);
}
