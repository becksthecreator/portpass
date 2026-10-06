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
// The section scripts/motion/seed-motion-fixture.ts makes live with a TEST
// business (featured, with a vector logo), so it is a live category page.
const MOTION_SECTION = "entertainment";
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
  const tag = await page.addStyleTag({ content: [".pp-hero-centre{visibility:hidden!important}", ...hide.map((s) => `${s}{visibility:hidden!important}`)].join("") });
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
    const sunAtRest = await page.evaluate(() => {
      const sun = document.querySelector(".pp-hero-sun");
      return sun ? getComputedStyle(sun).opacity : null;
    });
    if (sunAtRest !== null) check(sunAtRest === "1", "reduced motion: the sun is already up (its final state)", `opacity ${sunAtRest}`);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(600);
    const later = await page.evaluate(() => document.getAnimations().length);
    check(later === 0, "reduced motion: nothing animates after scrolling to the end", `${later} running`);
    const hidden = await page.evaluate(notAtFullOpacity);
    check(hidden === 0, "reduced motion: every reveal shows its final state", `${hidden} not at full opacity`);
    const m3 = await page.evaluate(() => {
      const band = document.querySelector(".home-business[data-reveal]");
      const path = document.querySelector(".home-how-line path");
      return {
        numbers: Array.from(document.querySelectorAll(".home-how-num")).filter((el) => getComputedStyle(el).opacity !== "1").length,
        ink: band ? getComputedStyle(band, "::before").opacity : null,
        line: path ? parseFloat(getComputedStyle(path).strokeDashoffset) : null,
      };
    });
    check(m3.numbers === 0 && (m3.ink === null || m3.ink === "1") && (m3.line === null || m3.line < 0.5), "reduced motion: the step numbers, the line and the ink band show their final state", JSON.stringify(m3));
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

  // 2b. The app's script fails after the inline line has run (a chunk that
  // never arrives, an old phone): the page is held as if the script were on
  // its way, and every hold has a failsafe, so within --dur-failsafe
  // everything shows, the step numbers and the ink band (M3) included.
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route("**/_next/static/chunks/**", (route) => route.abort());
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const held = await page.evaluate(() => document.documentElement.hasAttribute("data-motion-js") && !document.documentElement.hasAttribute("data-motion-ready"));
    check(held, "with the app's script blocked, the page is held as before its script runs", "data-motion-js set, data-motion-ready not");
    for (const selector of [".home-how-steps", ".home-business"]) {
      await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: "instant", block: "center" }), selector);
      await page.waitForTimeout(300);
    }
    const shown = await page.evaluate(() => {
      const band = document.querySelector(".home-business[data-reveal]");
      return {
        numbers: Array.from(document.querySelectorAll(".home-how-num")).filter((el) => getComputedStyle(el).opacity !== "1").length,
        ink: band ? getComputedStyle(band, "::before").opacity : null,
      };
    });
    const hidden = await page.evaluate(notAtFullOpacity);
    check(shown.numbers === 0 && (shown.ink === null || shown.ink === "1") && hidden === 0, "with the app's script blocked, the step numbers, the ink band and every reveal show within --dur-failsafe", JSON.stringify({ ...shown, reveals: hidden }));
    await page.screenshot({ path: `${OUT}/frames/script-blocked-375.png` });
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
    // The settled frame first, before any pass hides or shows anything.
    await page.screenshot({ path: `${OUT}/frames/hero-settled-375.png` });
    const hasSun = await page.evaluate(() => Boolean(document.querySelector(".pp-hero-sun")));
    const headline = await heroTextContrast(page, ".pp-hero h1");
    const lede = await heroTextContrast(page, ".pp-hero-lede");
    const without = hasSun ? await heroTextContrast(page, ".pp-hero h1", { hide: [".pp-hero-sun"] }) : null;
    check(headline !== null && headline >= 3, "the hero headline against what is behind it passes WCAG AA for large text (3:1)", `${headline}:1${without !== null ? `; ${without}:1 without the sun` : ""}`);
    lines.push(`- Hero lede against what is behind it: ${lede}:1 (WCAG AA for body text asks 4.5:1).`);
    await context.close();
  }

  // 6. Sun Drift (brief 22, M2 step 4): one animation that plays once and
  // stays risen, nothing that loops; a filmstrip of it at 375px.
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const started = Date.now();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    if (await page.$(".pp-hero-sun")) {
      const runs = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains("pp-hero-sun"))
          .map((a) => a.effect.getComputedTiming().iterations),
      );
      check(runs.length === 1 && runs[0] === 1, "the sunrise is one animation that plays once", `iterations ${JSON.stringify(runs)}`);
      for (const t of [200, 600, 1000, 1400, 2000]) {
        const wait = started + t - Date.now();
        if (wait > 0) await page.waitForTimeout(wait);
        await page.screenshot({ path: `${OUT}/frames/sun-${pad(t)}ms-375.png`, clip: { x: 0, y: 0, width: PHONE.width, height: 640 } });
      }
      const risen = await settledWithin(page, ".pp-hero-sun", 3000);
      const opacity = await page.evaluate(() => getComputedStyle(document.querySelector(".pp-hero-sun")).opacity);
      check(risen && opacity === "1", "the sun is up and still within 3 s of load", `opacity ${opacity}`);
    }
    await context.close();
  }

  // 7. The sections (brief 22, M3).
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await heroSettled(page);
    const staggered = await page.evaluate(() => {
      const grid = document.querySelector(".open-now-grid[data-stagger]");
      return grid && grid.children.length > 1 ? getComputedStyle(grid.children[1]).transitionDelay : null;
    });
    check(staggered === null || staggered === "0.06s", "Open now cards are staggered 60 ms apart", staggered ?? "fewer than two cards, so no stagger to read");
    // Before the steps come near, the line is not drawn yet, so the draw
    // below is the scroll's doing.
    const undrawn = await page.evaluate(() => {
      const path = document.querySelector(".home-how-line path");
      return path ? parseFloat(getComputedStyle(path).strokeDashoffset) : null;
    });
    check(undrawn === null || undrawn > 90, "the How-it-works line is undrawn before its steps come into view", undrawn === null ? "no line" : `dashoffset ${undrawn}`);
    // The line is as long as the steps: an <svg> does not stretch between
    // a top and a bottom on its own.
    const reach = await page.evaluate(() => {
      const line = document.querySelector(".home-how-line");
      const steps = document.querySelector(".home-how-steps");
      return line && steps ? { line: line.getBoundingClientRect().height, steps: steps.getBoundingClientRect().height } : null;
    });
    if (reach) check(reach.line >= reach.steps - 40, "the How-it-works line runs the length of its steps", `${Math.round(reach.line)}px line, ${Math.round(reach.steps)}px of steps`);
    // The line draws with the scroll: bring the first track's steps to the middle
    // of the screen, past the end of its draw range.
    await page.evaluate(() => document.querySelector(".home-how-steps")?.scrollIntoView({ behavior: "instant", block: "center" }));
    await page.waitForTimeout(1200);
    const line = await page.evaluate(() => {
      const path = document.querySelector(".home-how-line path");
      return path ? getComputedStyle(path).strokeDashoffset : null;
    });
    check(line !== null && parseFloat(line) < 0.5, "the How-it-works line is fully drawn once its steps are in the middle of the screen", line ?? "no line");
    const numbers = await page.evaluate(() => Array.from(document.querySelectorAll(".home-how-num")).filter((el) => getComputedStyle(el).opacity !== "1").length);
    check(numbers === 0, "every step number has counted in", `${numbers} still faded`);
    await page.evaluate(() => document.querySelector(".home-business")?.scrollIntoView({ behavior: "instant", block: "center" }));
    await page.waitForTimeout(1300);
    const ink = await page.evaluate(() => {
      const section = document.querySelector(".home-business");
      return section ? { arrived: section.hasAttribute("data-in"), layer: getComputedStyle(section, "::before").opacity, button: getComputedStyle(section.querySelector(".home-business-action")).opacity } : null;
    });
    check(Boolean(ink && ink.arrived && ink.layer === "1" && ink.button === "1"), "the List-with-PortPass section has eased to ink and its button has arrived", JSON.stringify(ink));
    await page.screenshot({ path: `${OUT}/frames/list-with-portpass-375.png` });
    // Nothing re-triggers on the way back up and down again.
    const arrivedBefore = await page.evaluate(() => document.querySelectorAll("[data-reveal][data-in]").length);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(700);
    const stillArrived = await page.evaluate(() => document.querySelectorAll("[data-reveal][data-in]").length);
    // The hero's drift and the scroll-linked line are the two that may run.
    const replaying = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && !a.effect.target.closest(".pp-hero") && !a.effect.target.closest(".home-how-line")).length);
    check(stillArrived === arrivedBefore && replaying === 0, "nothing re-triggers on scrolling back up and down again", `${arrivedBefore} arrived, then ${stillArrived}; ${replaying} running outside the hero and the line`);
    await context.close();

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wide = await desktop.newPage();
    await wide.goto(`${BASE}/`, { waitUntil: "load" });
    await heroSettled(wide);
    const card = wide.locator(".open-now-card:not([data-still])").first();
    if ((await card.count()) > 0) {
      await card.scrollIntoViewIfNeeded();
      await wide.waitForTimeout(1000);
      await card.hover();
      await wide.waitForTimeout(450);
      const lifted = await card.evaluate((node) => getComputedStyle(node).transform);
      const nudged = await card.locator(".home-button span").evaluate((node) => getComputedStyle(node).transform);
      check(lifted.endsWith(", -4)"), "an Open now card lifts 4px on hover", lifted);
      check(nudged.endsWith("4, 0)"), "and its arrow nudges 4px", nudged);
      await wide.screenshot({ path: `${OUT}/frames/open-now-hover-1440.png` });
      // A card that leads to a child's details never lifts.
      const stillCard = wide.locator(".open-now-card[data-still]").first();
      if ((await stillCard.count()) > 0) {
        await stillCard.scrollIntoViewIfNeeded();
        await stillCard.hover();
        await wide.waitForTimeout(450);
        const held = await stillCard.evaluate((node) => getComputedStyle(node).transform);
        check(held === "none", "a card that leads to a child's details never lifts", held);
      }
    } else {
      lines.push("- No Open now card on / (nothing live in the seeded stack), so the hover lift was not exercised.");
    }
    await desktop.close();
  }

  // 8. Squish Buttons, Bounce Badges and the Departure Board (brief 22, M3).
  {
    // Squish: the hero's "Browse what's on" (an anchor on the page) lifts
    // 2px on hover, squashes on press and springs back; a pricing plan's
    // button, which is about money, never moves.
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wide = await desktop.newPage();
    await wide.goto(`${BASE}/`, { waitUntil: "load" });
    await heroSettled(wide);
    const transformOf = (locator) => locator.evaluate((node) => getComputedStyle(node).transform);
    const button = wide.locator('.pp-hero-actions .home-button[href="#open-now"]').first();
    if ((await button.count()) > 0) {
      const box = await button.boundingBox();
      await wide.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await wide.waitForTimeout(400);
      const hovered = await transformOf(button);
      await wide.mouse.down();
      await wide.waitForTimeout(400);
      const pressed = await transformOf(button);
      await wide.mouse.up();
      await wide.waitForTimeout(400);
      check(hovered === "matrix(1, 0, 0, 1, 0, -2)", "a Squish Button lifts 2px on hover", hovered);
      check(pressed === "matrix(1.04, 0, 0, 0.92, 0, 4)", "and squashes 4px down on press", pressed);
      // A press begun at the button's very top edge still clicks it, though
      // the button drops away under the pointer (the invisible margin).
      await wide.goto(`${BASE}/`, { waitUntil: "load" });
      await heroSettled(wide);
      const edge = await button.boundingBox();
      await wide.mouse.move(edge.x + edge.width / 2, edge.y + 1);
      await wide.waitForTimeout(400);
      await wide.mouse.down();
      await wide.waitForTimeout(400);
      await wide.mouse.up();
      await wide.waitForTimeout(300);
      const hash = await wide.evaluate(() => window.location.hash);
      check(hash === "#open-now", "a press begun at a Squish Button's top edge still clicks it", `hash ${hash || "(none)"}`);
    }
    await wide.goto(`${BASE}/pricing`, { waitUntil: "load" });
    const plan = wide.locator(".home-button[data-still]").first();
    if ((await plan.count()) > 0) {
      await plan.scrollIntoViewIfNeeded();
      const box = await plan.boundingBox();
      await wide.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await wide.waitForTimeout(400);
      const hovered = await transformOf(plan);
      await wide.mouse.down();
      await wide.waitForTimeout(400);
      const pressed = await transformOf(plan);
      // Let go off the button, so nothing is followed.
      await wide.mouse.move(2, 2);
      await wide.mouse.up();
      check(hovered === "none" && pressed === "none", "a pricing plan's button (about money) never lifts or squishes", `${hovered} then ${pressed}`);
    } else {
      lines.push("- No pricing plan button in this stack, so the still buttons were not exercised.");
    }
    // Under reduced motion nothing lifts or squashes, not even at once.
    const calmDesk = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const calmPage = await calmDesk.newPage();
    await calmPage.goto(`${BASE}/`, { waitUntil: "load" });
    const calmButton = calmPage.locator('.pp-hero-actions .home-button[href="#open-now"]').first();
    if ((await calmButton.count()) > 0) {
      const box = await calmButton.boundingBox();
      await calmPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const hovered = await transformOf(calmButton);
      await calmPage.mouse.down();
      const pressed = await transformOf(calmButton);
      await calmPage.mouse.move(2, 2);
      await calmPage.mouse.up();
      check(hovered === "none" && pressed === "none", "reduced motion: a Squish Button never lifts or squashes", `${hovered} then ${pressed}`);
    }
    await calmDesk.close();
    await desktop.close();

    // Bounce Badges on the homepage: each pops once when its section is
    // revealed, and nothing pops again on the way back.
    const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const page = await phone.newPage();
    await page.addInitScript(() => {
      window.__flaps = 0;
      new MutationObserver((list) => {
        for (const m of list) if (m.type === "characterData" && m.target.parentElement && m.target.parentElement.classList.contains("board-cell")) window.__flaps += 1;
      }).observe(document, { subtree: true, characterData: true, childList: true });
    });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    // Measured once the fonts are in, so a font swap is not taken for the
    // flicker.
    const boardBefore = await page.evaluate(async () => {
      await document.fonts.ready;
      const board = document.querySelector(".board");
      return board ? { box: board.getBoundingClientRect().toJSON(), label: board.getAttribute("aria-label") } : null;
    });
    await page.waitForLoadState("load");
    await page.evaluate(() => document.querySelector(".board")?.scrollIntoView({ behavior: "instant", block: "center" }));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/frames/board-flicker-375.png` });
    await page.waitForTimeout(1500);
    if (boardBefore) {
      const board = await page.evaluate(() => {
        const node = document.querySelector(".board");
        const cells = Array.from(node.querySelectorAll(".board-cell"));
        return {
          box: node.getBoundingClientRect().toJSON(),
          settled: cells.every((cell) => cell.textContent === cell.getAttribute("data-final")),
          flaps: window.__flaps,
          values: Array.from(node.querySelectorAll(".board-value")).map((v) => Array.from(v.querySelectorAll(".board-cell")).map((c) => c.textContent).join("")),
        };
      });
      check(board.flaps > 0, "the Departure Board flickers when it comes into view", `${board.flaps} character swaps`);
      check(board.settled, "and settles on its true values", board.values.join(", "));
      const spoken = (boardBefore.label.match(/\d+/g) ?? []).map(Number);
      check(JSON.stringify(spoken) === JSON.stringify(board.values.map(Number)), "the board's aria-label carries the same true values, in order", `${boardBefore.label} / ${board.values.join(", ")}`);
      check(Math.abs(board.box.width - boardBefore.box.width) < 0.5 && Math.abs(board.box.height - boardBefore.box.height) < 0.5, "the flicker never changes the board's size", `${boardBefore.box.width}x${boardBefore.box.height} then ${board.box.width}x${board.box.height}`);
      await page.screenshot({ path: `${OUT}/frames/board-settled-375.png` });
    } else {
      lines.push("- No Departure Board on / (no counts above 0 in this stack).");
    }
    const grid = page.locator(".open-now-grid").first();
    if ((await grid.count()) > 0) {
      await grid.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1600);
      const pops = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".open-now-chip")).map((chip) => {
          const runs = chip.getAnimations().filter((a) => a.animationName === "badge-pop");
          return { still: Boolean(chip.closest(".open-now-card[data-still]")), runs: runs.length, done: runs.every((a) => a.playState === "finished"), opacity: getComputedStyle(chip).opacity };
        }),
      );
      const popping = pops.filter((pop) => !pop.still);
      const held = pops.filter((pop) => pop.still);
      check(popping.length > 0 && popping.every((pop) => pop.runs === 1 && pop.done && pop.opacity === "1"), "each Open now chip pops in once with the spring and settles", JSON.stringify(popping));
      check(held.every((pop) => pop.runs === 0 && pop.opacity === "1"), "a chip on a card that leads to a child's details never pops", held.length ? JSON.stringify(held) : "no such card in this stack");
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(300);
      await grid.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const again = await page.evaluate(() => Array.from(document.querySelectorAll(".open-now-chip")).flatMap((chip) => chip.getAnimations()).filter((a) => a.playState === "running").length);
      check(again === 0, "and none pops again on the way back", `${again} running`);
    }
    await phone.close();

    // Reduced motion: the board shows its true values and never flickers.
    const still = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const quiet = await still.newPage();
    await quiet.addInitScript(() => {
      window.__flaps = 0;
      new MutationObserver((list) => {
        for (const m of list) if (m.type === "characterData" && m.target.parentElement && m.target.parentElement.classList.contains("board-cell")) window.__flaps += 1;
      }).observe(document, { subtree: true, characterData: true });
    });
    await quiet.goto(`${BASE}/`, { waitUntil: "load" });
    await quiet.evaluate(() => document.querySelector(".board")?.scrollIntoView({ behavior: "instant", block: "center" }));
    await quiet.waitForTimeout(1500);
    const quietBoard = await quiet.evaluate(() => {
      const cells = Array.from(document.querySelectorAll(".board-cell"));
      return cells.length ? { flaps: window.__flaps, settled: cells.every((cell) => cell.textContent === cell.getAttribute("data-final")) } : null;
    });
    if (quietBoard) check(quietBoard.flaps === 0 && quietBoard.settled, "reduced motion: the board shows its true values and never flickers", `${quietBoard.flaps} swaps`);
    await still.close();

    // Bounce Badges on a category page pop on load, chips then labels. The
    // motion job seeds a TEST business in Entertainment
    // (scripts/motion/seed-motion-fixture.ts), so that section's page is a
    // live category page here.
    const category = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const cat = await category.newPage();
    await cat.goto(`${BASE}/${MOTION_SECTION}`, { waitUntil: "load" });
    if (await cat.$(".category-page .feature-card")) {
      // Its first screen: nothing starts hidden, however far into its pop.
      const early = await cat.evaluate(() => Array.from(document.querySelectorAll(".category-page :is(.subsection-chip,.feature-card-label)")).filter((el) => getComputedStyle(el).opacity !== "1").length);
      await cat.waitForTimeout(2200);
      const badges = await cat.evaluate(() =>
        Array.from(document.querySelectorAll(".category-page :is(.subsection-chip,.feature-card-label)")).map((el) => {
          const runs = el.getAnimations().filter((a) => a.animationName === "badge-pop-visible");
          return { kind: el.classList.contains("subsection-chip") ? "chip" : "label", still: Boolean(el.closest("[data-still]")), runs: runs.length, opacity: getComputedStyle(el).opacity };
        }),
      );
      const chips = badges.filter((badge) => badge.kind === "chip");
      const labels = badges.filter((badge) => badge.kind === "label");
      check(early === 0, "on a category page no chip or label starts hidden", `${early} below full opacity right after load`);
      check(chips.length > 0 && chips.every((badge) => badge.runs === 1 && badge.opacity === "1"), "its subsection chips pop in once from a visible start and settle", `${chips.length} chips`);
      check(labels.every((badge) => (badge.still ? badge.runs === 0 : badge.runs === 1) && badge.opacity === "1"), "a card that shows a price holds its Open now label still; any other label pops once", JSON.stringify(labels));
      await cat.screenshot({ path: `${OUT}/frames/category-badges-375.png` });
    } else {
      lines.push(`- /${MOTION_SECTION} has no live business in this stack, so the category page's badges were not exercised.`);
    }
    await category.close();
  }

  // 9. Moving between pages (brief 22, M4). A section card to its page
  // cross-fades and morphs its icon and title; a header link between main
  // pages runs the Tide Wipe; Back runs neither and restores the scroll;
  // under reduced motion every transition takes no time.
  {
    // Every view-transition animation seen while a navigation runs, with
    // its duration.
    const watch = (page) =>
      page.evaluate(() => {
        window.__vtSeen = [];
        clearInterval(window.__vtTimer);
        window.__vtTimer = setInterval(() => {
          for (const a of document.getAnimations()) {
            const pseudo = a.effect && a.effect.pseudoElement;
            if (pseudo && pseudo.startsWith("::view-transition")) window.__vtSeen.push(`${pseudo}|${a.effect.getComputedTiming().duration}`);
          }
        }, 20);
      });
    const seenBy = (page) =>
      page.evaluate(() => {
        clearInterval(window.__vtTimer);
        return Array.from(new Set(window.__vtSeen));
      });

    const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const page = await phone.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await heroSettled(page);
    const supported = await page.evaluate(() => typeof document.startViewTransition === "function");
    const card = page.locator(`.home-section-card.is-live[href="/${MOTION_SECTION}"]`).first();
    if ((await card.count()) === 0) {
      lines.push("- No live section card on / in this stack, so the card move was not exercised.");
    } else {
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      const href = await card.getAttribute("href");
      const scrolledTo = await page.evaluate(() => window.scrollY);
      await watch(page);
      await card.click();
      await page.waitForURL((url) => url.pathname === href, { timeout: 10000 });
      await page.waitForTimeout(900);
      const seen = await seenBy(page);
      check(await page.locator(".category-hero h1").first().isVisible(), "the section page's heading is there after a card move");
      if (supported) {
        // A real morph pairs the card's element with the page's: the browser
        // builds a group for the name with a new image in it. An old image
        // alone only means the card faded out where it was.
        const paired = (name) => seen.some((s) => s.startsWith(`::view-transition-group(${name}`)) && seen.some((s) => s.startsWith(`::view-transition-new(${name}`));
        check(paired("section-title-") && paired("section-icon-"), "the card's icon and title morph into the section page's", seen.filter((s) => s.includes("section-")).slice(0, 6).join(" ") || "none observed");
        check(!seen.some((s) => s.includes("tide-panel")), "a card move does not run the Tide Wipe", `${seen.length} transition animations`);
      } else {
        lines.push("- This browser has no View Transitions API, so the navigation was plain, as designed.");
      }
      await page.screenshot({ path: `${OUT}/frames/section-page-after-card-375.png` });
      await watch(page);
      await page.goBack({ waitUntil: "load" });
      await page.waitForTimeout(900);
      const back = await seenBy(page);
      const restored = await page.evaluate(() => window.scrollY);
      check(!back.some((s) => s.includes("tide-panel")), "Back runs no Tide Wipe", `${back.length} transition animations`);
      check(Math.abs(restored - scrolledTo) < 200, "Back returns to where the visitor was on /", `${scrolledTo} then ${restored}`);
      // Focus is on the page itself or on something in the page now shown,
      // never on an element that left with the old page.
      const liveFocus = await page.evaluate(() => {
        const el = document.activeElement;
        return { ok: !el || el === document.body || Boolean(document.querySelector("main")?.contains(el)), on: el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}` : "none" };
      });
      check(liveFocus.ok, "focus is on the page shown after Back", liveFocus.on);
    }
    await phone.close();

    // The Tide Wipe: from / to a section by the header's menu, at 1440px.
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wide = await desktop.newPage();
    await wide.goto(`${BASE}/`, { waitUntil: "load" });
    await heroSettled(wide);
    const trigger = wide.locator(".nav-trigger").first();
    if (supported && (await trigger.count()) > 0) {
      await trigger.click();
      await wide.waitForTimeout(400);
      const link = wide.locator(".nav-item.is-open .nav-panel-all").first();
      const href = await link.getAttribute("href");
      await watch(wide);
      await link.click();
      await wide.waitForURL((url) => url.pathname === href, { timeout: 10000 });
      await wide.waitForTimeout(400);
      await wide.screenshot({ path: `${OUT}/frames/tide-after-1440.png` });
      await wide.waitForTimeout(500);
      const seen = await seenBy(wide);
      const tide = seen.filter((s) => s.includes("tide-panel"));
      check(tide.length > 0 && tide.every((s) => Number(s.split("|")[1]) > 0), "a header link between main pages runs the Tide Wipe", tide.join(" ") || "none observed");
      check(!seen.some((s) => s.includes("section-title-")), "and no morph with it", `${seen.length} transition animations`);
      await watch(wide);
      await wide.goBack({ waitUntil: "load" });
      await wide.waitForTimeout(900);
      const back = await seenBy(wide);
      check(!back.some((s) => s.includes("tide-panel")), "Back from it runs no Tide Wipe", `${back.length} transition animations`);
    } else {
      lines.push("- No View Transitions API or no header menu here, so the Tide Wipe was not exercised.");
    }
    await desktop.close();

    // Reduced motion: the same move takes no time at all.
    const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const still = await calm.newPage();
    await still.goto(`${BASE}/`, { waitUntil: "load" });
    const calmTrigger = still.locator(".nav-trigger").first();
    if (supported && (await calmTrigger.count()) > 0) {
      await calmTrigger.click();
      await still.waitForTimeout(300);
      const link = still.locator(".nav-item.is-open .nav-panel-all").first();
      const href = await link.getAttribute("href");
      await watch(still);
      await link.click();
      await still.waitForURL((url) => url.pathname === href, { timeout: 10000 });
      await still.waitForTimeout(700);
      const seen = await seenBy(still);
      check(seen.every((s) => Number(s.split("|")[1]) === 0), "reduced motion: a move between main pages takes no time", seen.slice(0, 3).join(" ") || "no transition animations");
    }
    await calm.close();

    // Featured logos (M4): on a category list a featured listing's vector
    // mark gives one small bounce every --dur-idle while half of it is in
    // view, one mark at a time; under reduced motion nothing is scheduled.
    // The fixture's venue is featured and its logo is a vector file.
    const idleBounces = async (options) => {
      const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, ...options });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__idle = 0;
        new MutationObserver((list) => {
          for (const m of list) if (m.type === "attributes" && m.attributeName === "data-idle" && m.target.hasAttribute("data-idle")) window.__idle += 1;
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-idle"] });
      });
      await page.goto(`${BASE}/${MOTION_SECTION}`, { waitUntil: "load" });
      const mark = page.locator(".idle-logo").first();
      let result = null;
      if ((await mark.count()) > 0) {
        await mark.scrollIntoViewIfNeeded();
        // One --dur-idle (5 s) and a little more.
        await page.waitForTimeout(6500);
        result = await page.evaluate(() => ({ bounces: window.__idle, marks: document.querySelectorAll(".idle-logo").length }));
      }
      await context.close();
      return result;
    };
    const idling = await idleBounces({});
    if (idling) {
      check(idling.bounces >= 1 && idling.bounces <= 2, "a featured listing's vector logo mark idles on the category list, once each --dur-idle", `${idling.bounces} bounce(s) in 6.5 s, ${idling.marks} mark(s)`);
      const calmIdle = await idleBounces({ reducedMotion: "reduce" });
      check(calmIdle && calmIdle.bounces === 0, "reduced motion: the featured logo stays still", calmIdle ? `${calmIdle.bounces} bounce(s) in 6.5 s` : "no mark");
    } else {
      lines.push(`- No featured vector logo on /${MOTION_SECTION} in this stack, so the idle bounce was not exercised.`);
    }

    // A business's own page is not a main page: its header carries no
    // transition type, so leaving it (here by the logo, back to /) swaps
    // at once, with no Tide Wipe and no fade.
    const business = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const bizPage = await business.newPage();
    const bizResponse = await bizPage.goto(`${BASE}/${MOTION_SECTION}/test-delete-motion-venue`, { waitUntil: "load" });
    const brand = bizPage.locator('.site-shell-header a[href="/"]').first();
    if (bizResponse && bizResponse.ok() && (await brand.count()) > 0) {
      const tidePanel = await bizPage.locator(".tide-panel").count();
      await watch(bizPage);
      await brand.click();
      await bizPage.waitForURL((url) => url.pathname === "/", { timeout: 10000 });
      await bizPage.waitForTimeout(900);
      const left = await seenBy(bizPage);
      // React may still start a view transition for this move; whatever it
      // shows must take no time, the same test as under reduced motion.
      check(tidePanel === 0 && left.every((s) => Number(s.split("|")[1]) === 0), "leaving a business's own page swaps at once", `${tidePanel} tide panel(s); ${left.join(" ") || "no transition animations"}`);
    } else {
      lines.push("- The TEST venue's own page or its header logo link was not found, so leaving a business page was not exercised.");
    }
    await business.close();
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
