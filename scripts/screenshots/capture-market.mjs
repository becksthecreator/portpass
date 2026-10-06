// Captures PortPass Market (brief 25) at phone width for the Market
// screenshot job. Runs against `next start` on localhost with the TEST data
// from seed-shop-fixture.ts and seed-market-fixture.ts. Public pages need no
// sign-in; the seller's pages sign in as the TEST shop owner and the admin
// pages as the TEST platform owner, through the real routes (one-time codes
// issued by the local Supabase stack, and an authenticator code computed
// here). Writes PNGs to ./screenshots.
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
// A secret key issues the sign-in codes here, so this only ever runs
// against a local Supabase stack and the app on localhost.
if (!process.env.SUPABASE_URL?.includes("127.0.0.1") && !process.env.SUPABASE_URL?.includes("localhost")) throw new Error("Refusing to sign in to anything but a local Supabase stack.");
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Refusing to run against anything but the app on localhost.");
const shop = JSON.parse(readFileSync(process.env.SCREENSHOT_FIXTURE, "utf8"));
const market = JSON.parse(readFileSync(process.env.MARKET_FIXTURE, "utf8"));
mkdirSync("screenshots", { recursive: true });

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

async function codeSignIn(page, email) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.email_otp) throw new Error(`Could not issue a sign-in code: ${error?.message ?? "no code"}`);
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  const verified = await post(page, "/api/auth/verify", { email, token: data.properties.email_otp });
  if (verified.status !== 200) throw new Error(`Sign-in returned ${verified.status}`);
}

async function adminSignIn(page) {
  await codeSignIn(page, market.adminEmail);
  const enrolled = await post(page, "/api/admin/mfa/enroll", {});
  if (enrolled.status !== 200 || !enrolled.data.secret) throw new Error(`Two-step enrolment returned ${enrolled.status}`);
  const stepUp = await post(page, "/api/admin/mfa/verify", { factorId: enrolled.data.factorId, code: totp(enrolled.data.secret) });
  if (stepUp.status !== 200) throw new Error(`Two-step verification returned ${stepUp.status}`);
}

// "load" plus a short settle, not "networkidle" (see capture-shop.mjs). A
// failed shot is logged and the rest still run; the job fails at the end.
const failures = [];
async function shoot(page, name, path, { focus = null, before = null } = {}) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
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
const viewport = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
try {
  // A visitor: /sell before signing in, and a verified seller's storefront.
  const visitor = await browser.newContext(viewport);
  const anon = await visitor.newPage();
  await shoot(anon, "market-a-sell-signed-out-375", "/sell", { focus: ".sell-signin" });
  await shoot(anon, "market-a-storefront-375", `/shop/${shop.slug}`, { focus: ".shop-getting" });
  await visitor.close();

  // The TEST shop owner: /sell (offers their own shop first) and the
  // PortPass Market block on their shop page.
  const owner = await browser.newContext(viewport);
  const seller = await owner.newPage();
  await codeSignIn(seller, shop.ownerEmail);
  await shoot(seller, "market-a-sell-form-375", "/sell", { focus: ".application-form" });
  await shoot(seller, "market-a-seller-market-375", `/business/${shop.slug}/shop`, { focus: "#seller-market" });
  await owner.close();

  // The TEST platform owner: Admin -> Market -> Sellers.
  const founders = await browser.newContext(viewport);
  const admin = await founders.newPage();
  await adminSignIn(admin);
  await shoot(admin, "market-a-admin-sellers-375", "/admin/market", { focus: ".mkt-admin-table" });
  await founders.close();
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`Shots that failed: ${failures.join(", ")}`);
  process.exit(1);
}
