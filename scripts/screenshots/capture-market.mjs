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

async function patch(page, url, body) {
  return page.evaluate(async ({ url, body }) => {
    const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }, { url, body });
}

// Ids from the local TEST stack (the secret key there is the stack's own).
async function variantId(orgSlug, productSlug, label) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", orgSlug).single();
  const { data, error } = await supabase.from("products").select("product_variants(id,label)").eq("organization_id", org.id).eq("slug", productSlug).single();
  const variant = (data?.product_variants ?? []).find((v) => v.label === label);
  if (error || !variant) throw new Error(`No TEST size ${label} on ${productSlug}`);
  return variant.id;
}

async function orderIdsByCode(orgId, codes) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.from("reservations").select("id,reference_code").eq("organization_id", orgId).in("reference_code", codes);
  if (error || !data?.length) throw new Error("Could not find the TEST orders");
  return codes.map((code) => data.find((row) => row.reference_code === code).id);
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
      // Long enough for a <Reveal> section to finish rising in.
      await page.waitForTimeout(1000);
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
  // Part B: the Market, a category, a product page, Things to do and the
  // homepage's "From the Market" strip.
  await shoot(anon, "market-b-market-375", "/market", { focus: ".mkt-grid" });
  await shoot(anon, "market-b-category-375", "/market/kits-apparel", { focus: ".mkt-chips" });
  await shoot(anon, "market-b-search-375", "/market?q=jersey", { focus: ".mkt-results-head" });
  await shoot(anon, "market-b-product-375", `/market/p/${shop.slug}/home-jersey`, { focus: ".mkt-sizes" });
  await shoot(anon, "market-b-things-to-do-375", "/market?tab=do", { focus: ".mkt-tabs" });
  await shoot(anon, "market-b-home-strip-375", "/", { focus: ".home-market" });

  // Part C: the order form, then two TEST orders through the real route
  // (an example address: nothing is ever sent), arriving from /market so
  // they count as brought by PortPass, and the buyer's order page.
  // The TEST tee is outside the shop's open drop (a product in an open
  // drop is reserved in the drop instead).
  await anon.goto(`${BASE}/market/p/${shop.slug}/training-tee`, { waitUntil: "load", timeout: 60_000, referer: `${BASE}/market` });
  await shoot(anon, "market-c-order-form-375", `/market/p/${shop.slug}/training-tee`, { focus: "#order" });
  const sizeL = await variantId(shop.slug, "training-tee", "L");
  const orderBody = (name, phone) => ({ org: shop.slug, product: "training-tee", items: [{ variantId: sizeL, qty: 1 }], buyerName: name, buyerPhone: phone, buyerEmail: "test-delete-market-buyer@example.com", fulfilment: "pickup", paymentMethod: "bank_transfer" });
  const first = await post(anon, "/api/market/orders", orderBody("TEST Buyer Market One", "242-555-0171"));
  const second = await post(anon, "/api/market/orders", orderBody("TEST Buyer Market Two", "242-555-0172"));
  if (first.status !== 201 || second.status !== 201) throw new Error(`Placing the TEST orders returned ${first.status} / ${second.status}: ${first.data.error ?? second.data.error ?? ""}`);
  await shoot(anon, "market-c-order-375", `/order/${first.data.referenceCode}`, { focus: ".ord-steps" });
  await visitor.close();

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const wide = await desk.newPage();
  await shoot(wide, "market-b-market-1440", "/market", { focus: ".mkt-grid" });
  await shoot(wide, "market-b-product-1440", `/market/p/${shop.slug}/home-jersey`);
  await desk.close();

  // The TEST shop owner: /sell (offers their own shop first) and the
  // PortPass Market block on their shop page.
  const owner = await browser.newContext(viewport);
  const seller = await owner.newPage();
  await codeSignIn(seller, shop.ownerEmail);
  await shoot(seller, "market-a-sell-form-375", "/sell", { focus: ".application-form" });
  await shoot(seller, "market-a-seller-market-375", `/business/${shop.slug}/shop`, { focus: "#seller-market" });
  // Part C: the seller marks the first TEST order paid and ready, through
  // the real route; the orders list, and the buyer's page after.
  const orderIds = await orderIdsByCode(market.kitShopId, [first.data.referenceCode]);
  for (const action of ["paid", "ready"]) {
    const moved = await patch(seller, `/api/business/orgs/${market.kitShopId}/shop/orders/${orderIds[0]}`, { action });
    if (moved.status !== 200) throw new Error(`Marking the TEST order ${action} returned ${moved.status}`);
  }
  await shoot(seller, "market-c-seller-orders-375", `/business/${shop.slug}/shop/orders`, { focus: ".seller-reservations" });
  await shoot(seller, "market-c-order-paid-375", `/order/${first.data.referenceCode}`, { focus: ".ord-steps" });
  // Part D: the owner's own PortPass Points on the account page.
  await shoot(seller, "market-d-account-points-375", "/account", { focus: "#account-points" });
  await owner.close();

  // The TEST platform owner: Admin -> Market -> Sellers.
  const founders = await browser.newContext(viewport);
  const admin = await founders.newPage();
  await adminSignIn(admin);
  await shoot(admin, "market-a-admin-sellers-375", "/admin/market", { focus: ".mkt-admin-table" });
  await shoot(admin, "market-c-admin-income-375", "/admin/market/income", { focus: ".mkt-admin-settings" });
  await founders.close();
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`Shots that failed: ${failures.join(", ")}`);
  process.exit(1);
}
