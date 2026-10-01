// Captures the drop pages (brief 15) at phone width for the shop
// screenshot job. Runs against `next start` on localhost with the TEST shop
// from seed-shop-fixture.ts. Public pages need no sign-in; the seller's
// pages sign in as the TEST owner through the real routes (a one-time code
// issued by the local Supabase stack). Writes PNGs to ./screenshots.
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
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const verified = await post(page, "/api/auth/verify", { email: fixture.ownerEmail, token: data.properties.email_otp });
  if (verified.status !== 200) throw new Error(`Owner sign-in returned ${verified.status}`);
}

async function shoot(page, name, path, { focus = null, before = null } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  if (before) await before(page);
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  if (focus) {
    await page.locator(focus).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `screenshots/${name}-viewport.png` });
  }
  console.log(`captured ${name}`);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const drop = `/shop/${fixture.slug}/drop/${fixture.dropSlug}`;

  // The public side: the drop page as a buyer first sees it, the same page
  // with sizes picked (the order summary and buyer details), a sold-out
  // size offering the waitlist, the shop page and a buyer's receipt.
  await shoot(page, "brief15-drop-page-375", drop, { focus: ".shop-drop-products" });
  await shoot(page, "brief15-drop-order-375", drop, {
    focus: ".shop-order-form",
    before: async (p) => {
      const cards = p.locator(".shop-card-drop");
      await cards.nth(0).getByRole("radio", { name: /^S/ }).click();
      await cards.nth(0).getByRole("button", { name: /Add S to my order/ }).click();
      await cards.nth(2).getByRole("radio", { name: /One size/ }).click();
      await cards.nth(2).getByRole("button", { name: /Add One size to my order/ }).click();
    },
  });
  await shoot(page, "brief15-drop-waitlist-375", drop, {
    focus: ".shop-waitlist",
    before: async (p) => {
      await p.locator(".shop-card-drop").nth(0).getByRole("radio", { name: /^M/ }).click();
    },
  });
  await shoot(page, "brief15-shop-page-375", `/shop/${fixture.slug}`, { focus: ".shop-returns" });
  await shoot(page, "brief15-receipt-375", `/shop/${fixture.slug}/reservation/${fixture.receiptToken}`, { focus: ".shop-receipt-card" });

  // The seller's side, signed in as the TEST owner.
  await ownerSignIn(page);
  await shoot(page, "brief15-seller-list-375", `/business/${fixture.slug}/shop/drops/${fixture.dropId}`, { focus: ".seller-reservations" });
  await shoot(page, "brief15-seller-release-confirm-375", `/business/${fixture.slug}/shop/drops/${fixture.dropId}`, {
    focus: ".seller-release",
    before: async (p) => {
      await p.getByRole("button", { name: /Release to stock/ }).click();
    },
  });
  await shoot(page, "brief15-seller-shop-home-375", `/business/${fixture.slug}/shop`);
  await context.close();
} finally {
  await browser.close();
}
