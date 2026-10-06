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
// The hero's entrance is CSS and finishes on its own; this waits for it
// (not for the photo's drift, which never ends), 2.5 s at most.
const heroSettled = (page) =>
  page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".pp-hero-centre"))
          .map((a) => a.finished.catch(() => null)),
      ).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 2500)),
    ]),
  );
const notAtFullOpacity = () => Array.from(document.querySelectorAll("[data-reveal], [data-reveal][data-stagger] > *")).filter((el) => getComputedStyle(el).opacity !== "1").length;

// Every animation inside `selector` that ends (not the photo's drift)
// has ended, or `timeout` ms have passed; true when they all ended.
const settledWithin = (page, selector, timeout = 2500) =>
  page.evaluate(
    ({ selector, timeout }) =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => {
              const target = a.effect && a.effect.target;
              const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
              return target && target.closest && target.closest(selector) && timing && timing.iterations !== Infinity;
            })
            .map((a) => a.finished.catch(() => null)),
        ).then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), timeout)),
      ]),
    { selector, timeout },
  );

// The worst-case contrast of a piece of hero text against what is behind
// it (WCAG's ratio). The hero's words are hidden, the area under the
// element photographed, and the 5th percentile of that background (its
// darkest 5% under dark text, its lightest 5% under light text) compared
// with the text's colour, an rgba colour blended over that background
// first. `hide` takes more selectors to leave out of the photograph.
async function heroTextContrast(page, selector, { hide = [] } = {}) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: r.width, height: r.height, color: getComputedStyle(el).color };
  }, selector);
  if (!box || box.width < 1 || box.height < 1) return null;
  const tag = await page.addStyleTag({ content: [".pp-hero-centre{visibility:hidden!important}", ...hide.map((s) => `${s}{display:none!important}`)].join("") });
  await page.waitForTimeout(80);
  const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
  await tag.evaluate((node) => node.remove());
  await page.waitForTimeout(80);
  return page.evaluate(
    async ({ data, color }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const lin = (c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const parts = (color.match(/rgba?\(([^)]+)\)/) ?? [null, "0,0,0"])[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const [tr, tg, tb] = parts;
      const ta = parts.length > 3 ? parts[3] : 1;
      const samples = [];
      for (let i = 0; i < px.length; i += 4) samples.push([lum(px[i], px[i + 1], px[i + 2]), px[i], px[i + 1], px[i + 2]]);
      samples.sort((a, b) => a[0] - b[0]);
      const darkText = lum(tr, tg, tb) < 0.5;
      const [back, br, bg, bb] = samples[Math.floor((darkText ? 0.05 : 0.95) * (samples.length - 1))];
      const mix = (t, b) => ta * t + (1 - ta) * b;
      const text = lum(mix(tr, br), mix(tg, bg), mix(tb, bb));
      return Math.round(((Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05)) * 100) / 100;
    },
    { data: png.toString("base64"), color: box.color },
  );
}

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
    check(await heroSettled(page), "without JavaScript: the hero's CSS entrance finishes within 2.5 s of load");
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
    check(await heroSettled(page), "on a slow phone the hero's entrance finishes within 2.5 s of load");
    const headline = await page.locator(".pp-hero h1").first().evaluate((node) => getComputedStyle(node).opacity);
    check(headline === "1", "the hero headline is at full opacity once settled");
    const total = await page.evaluate(() => document.querySelectorAll("[data-reveal]").length);
    // A visitor who reads the hero for a while must still see the first
    // section rise: well after the failsafe window, a reveal below the
    // fold is still held, and arrives only once it is scrolled to.
    await page.waitForTimeout(3200);
    const held = await page.evaluate(() => {
      const el = document.querySelector("#chooser [data-reveal]");
      return el ? { below: el.getBoundingClientRect().top >= window.innerHeight, arrived: el.hasAttribute("data-in"), opacity: getComputedStyle(el).opacity } : null;
    });
    check(Boolean(held && held.below && !held.arrived && held.opacity === "0"), "a reveal below the fold is still held 3 s after load, so it can rise when reached", JSON.stringify(held));
    await page.evaluate(() => document.querySelector("#chooser")?.scrollIntoView({ behavior: "instant", block: "start" }));
    await page.waitForTimeout(100);
    const rising = await page.evaluate(() => {
      const el = document.querySelector("#chooser [data-reveal]");
      return el ? { arrived: el.hasAttribute("data-in"), opacity: Number(getComputedStyle(el).opacity) } : null;
    });
    check(Boolean(rising && rising.arrived && rising.opacity < 1), "that reveal is on its way in 100 ms after being scrolled to", JSON.stringify(rising));
    for (const t of [100, 250, 400, 550, 700, 1000]) {
      await page.screenshot({ path: `${OUT}/frames/home-chooser-${pad(t)}ms-375.png` });
      await page.waitForTimeout(150);
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

  // 4. The Prow moment, the hero drift and the header (brief 22, M2).
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "commit" });
    const prow = await page.waitForSelector(".prow-moment", { timeout: 5000 }).then(() => true).catch(() => false);
    check(prow, "the Prow moment plays on the first load of / in a session");
    if (prow) await page.screenshot({ path: `${OUT}/frames/prow-moment-375.png`, clip: { x: 0, y: 0, width: PHONE.width, height: 120 } });
    const gone = await page.waitForSelector(".prow-moment", { state: "detached", timeout: 3000 }).then(() => true).catch(() => false);
    check(gone, "the Prow moment is gone within a second");
    await page.waitForLoadState("load");
    await heroSettled(page);
    const drifting = await page.evaluate(() => document.getAnimations().some((a) => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".pp-hero-frame")));
    check(drifting, "the hero photo drifts while the hero is on screen");
    const rowBefore = await page.evaluate(() => document.querySelector(".site-shell-header")?.getBoundingClientRect().height ?? 0);
    await page.evaluate(() => window.scrollTo({ top: 1600, behavior: "instant" }));
    await page.waitForTimeout(400);
    const paused = await page.evaluate(() => {
      const img = document.querySelector(".pp-hero-frame img");
      return Boolean(document.querySelector(".pp-hero")?.hasAttribute("data-offscreen") && img && getComputedStyle(img).animationPlayState === "paused");
    });
    check(paused, "the drift is paused once the hero is off screen");
    const header = await page.evaluate(() => {
      const el = document.querySelector(".site-shell-header");
      return el ? { condensed: el.hasAttribute("data-condensed"), top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height } : null;
    });
    check(Boolean(header && header.condensed), "the header is condensed after scrolling");
    check(Boolean(header && header.top === 0), "the header stays at the top of the screen while scrolled");
    check(Boolean(header && header.height === rowBefore), "condensing changes nothing about the header's height", `${rowBefore} then ${header?.height}`);
    await page.screenshot({ path: `${OUT}/frames/header-condensed-375.png`, clip: { x: 0, y: 0, width: PHONE.width, height: 120 } });
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    const replay = await page.waitForSelector(".prow-moment", { timeout: 1500 }).then(() => true).catch(() => false);
    check(!replay, "the Prow moment does not replay on a second load in the same session");
    await context.close();

    // At 1440px the logo condenses by a transform and the menu fades in.
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wide = await desktop.newPage();
    await wide.goto(`${BASE}/`, { waitUntil: "load" });
    await heroSettled(wide);
    const logo = () =>
      wide.evaluate(() => {
        const img = Array.from(document.querySelectorAll(".site-shell-brand img.brand-logo")).find((el) => el.getBoundingClientRect().width > 0);
        return img ? { transform: getComputedStyle(img).transform, height: img.getBoundingClientRect().height } : null;
      });
    const logoBefore = await logo();
    await wide.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
    await wide.waitForTimeout(500);
    const logoAfter = await logo();
    check(Boolean(logoBefore && logoAfter && logoBefore.transform === "none" && logoAfter.transform !== "none"), "at 1440px the logo condenses with a transform", `${logoBefore?.transform} then ${logoAfter?.transform}`);
    check(Boolean(logoBefore && logoAfter && Math.round(logoAfter.height) === 30), "the condensed logo reads as 30px tall", `${logoAfter?.height}px`);
    await wide.screenshot({ path: `${OUT}/frames/header-condensed-1440.png`, clip: { x: 0, y: 0, width: 1440, height: 120 } });
    await wide.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await wide.waitForTimeout(400);
    const trigger = wide.locator(".nav-trigger").first();
    if ((await trigger.count()) > 0) {
      await trigger.click();
      await wide.waitForTimeout(40);
      const opening = await wide.evaluate(() => {
        const panel = document.querySelector(".nav-item.is-open .nav-panel");
        return panel ? Number(getComputedStyle(panel).opacity) : null;
      });
      await wide.waitForTimeout(400);
      const opened = await wide.evaluate(() => {
        const panel = document.querySelector(".nav-item.is-open .nav-panel");
        return panel ? Number(getComputedStyle(panel).opacity) : null;
      });
      check(opening !== null && opening < 1 && opened === 1, "the category menu fades in and settles", `${opening} then ${opened}`);
      await wide.screenshot({ path: `${OUT}/frames/menu-open-1440.png`, clip: { x: 0, y: 0, width: 1440, height: 420 } });
    } else {
      lines.push("- No category menu trigger at 1440px (no sections seeded), so the menu fade was not exercised.");
    }
    await desktop.close();
  }

  // 5. The hero's words against what is behind them, once everything in
  // the hero that ends has ended (brief 22, M2 step 4: Sun Drift ships only
  // if the headline's contrast still passes). The headline is large text,
  // so WCAG AA asks 3:1 of it; the lede is reported against 4.5:1.
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page
      .waitForFunction(() => {
        const img = document.querySelector(".pp-hero-frame img");
        return Boolean(img && img.complete && img.naturalWidth > 0);
      }, null, { timeout: 15000 })
      .catch(() => null);
    await settledWithin(page, ".pp-hero", 4000);
    const hasSun = await page.evaluate(() => Boolean(document.querySelector(".pp-hero-sun")));
    const headline = await heroTextContrast(page, ".pp-hero h1");
    const lede = await heroTextContrast(page, ".pp-hero-lede");
    const without = hasSun ? await heroTextContrast(page, ".pp-hero h1", { hide: [".pp-hero-sun"] }) : null;
    check(headline !== null && headline >= 3, "the hero headline against what is behind it passes WCAG AA for large text (3:1)", `${headline}:1${without !== null ? `; ${without}:1 without the sun` : ""}`);
    lines.push(`- Hero lede against what is behind it: ${lede}:1 (WCAG AA for body text asks 4.5:1).`);
    await page.screenshot({ path: `${OUT}/frames/hero-settled-375.png` });
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
