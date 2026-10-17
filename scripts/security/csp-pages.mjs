#!/usr/bin/env node
// The content security policy, page by page (brief 26). Run by
// .github/workflows/csp-pages.yml against `next start` on localhost with
// the local Supabase stack's TEST data, the branch's own build and so its
// own headers (next.config.ts sends them, as on Vercel). Each page the
// brief names is opened at 375px, scrolled through so anything loaded on
// the way loads, and photographed; every violation the browser raises is
// collected (the `securitypolicyviolation` event, and any console message
// about the policy). A page fails when it answers without the enforced
// header or raises a single violation.
//
// Signs in only to this local stack, with the TEST accounts the fixtures
// seed: a sign-in code is asked of the stack and used at once, and the
// admin's authenticator step is computed here. Neither code, nor any key or
// payment token, is ever printed.
//
// Writes csp-pages/report.md and csp-pages/<page>-375.png; exits 1 on any
// failure.
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.CSP_BASE_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Refusing to run against anything but the app on localhost.");
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(SUPABASE_URL)) throw new Error("Refusing to sign in to anything but a local Supabase stack.");
if (!process.env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not set.");
if (!process.env.PAYMENTS_FIXTURE) throw new Error("PAYMENTS_FIXTURE is not set.");

const OUT = "csp-pages";
mkdirSync(OUT, { recursive: true });
const PHONE = { width: 375, height: 812 };
const payments = JSON.parse(readFileSync(process.env.PAYMENTS_FIXTURE, "utf8"));
const adminEmail = (process.env.PLATFORM_OWNER_EMAILS ?? "").split(",")[0].trim();

const lines = [];
let failed = 0;
function check(ok, label, detail = "") {
  lines.push(`- ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed += 1;
}

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

const call = (page, method, url, body) =>
  page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json().catch(() => ({})) };
    },
    { method, url, body },
  );

// Signs a TEST account in through the real routes; with `stepUp`, also the
// admin's authenticator step. True when every step answered 200.
async function signIn(page, email, { stepUp = false } = {}) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  const code = link.data?.properties?.email_otp;
  if (!code) return false;
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  const verified = await call(page, "POST", "/api/auth/verify", { email, token: code });
  if (verified.status !== 200) return false;
  if (!stepUp) return true;
  const enrolled = await call(page, "POST", "/api/admin/mfa/enroll", {});
  if (enrolled.status !== 200 || !enrolled.data.secret) return false;
  const verifiedStep = await call(page, "POST", "/api/admin/mfa/verify", { factorId: enrolled.data.factorId, code: totp(enrolled.data.secret) });
  return verifiedStep.status === 200;
}

async function context() {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__csp.push(`${event.effectiveDirective} ${event.blockedURI || "inline"}`);
    });
  });
  return ctx;
}

async function visit(page, name, path) {
  const policyErrors = [];
  const onConsole = (message) => {
    const text = message.text();
    if (/content.security.policy/i.test(text)) policyErrors.push(text.slice(0, 200));
  };
  page.on("console", onConsole);
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  const header = response ? (response.headers()["content-security-policy"] ?? null) : null;
  const reportOnly = response ? Boolean(response.headers()["content-security-policy-report-only"]) : false;
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  const violations = await page.evaluate(() => window.__csp ?? []);
  page.off("console", onConsole);
  await page.screenshot({ path: `${OUT}/${name}-375.png` });
  const landed = new URL(page.url()).pathname;
  // A payment link's token never reaches the report.
  const mask = (value) => value.replace(/\/pay\/[0-9a-f]{12,}/g, "/pay/<TEST link>");
  const where = landed === new URL(`${BASE}${path}`).pathname ? mask(path) : `${mask(path)}, landed on ${mask(landed)}`;
  const problems = [...violations, ...policyErrors];
  const detail = header === null ? "no content-security-policy header" : reportOnly ? "report-only header sent as well" : problems.slice(0, 4).join(" | ") || "no violations, no console errors about the policy";
  check(header !== null && !reportOnly && problems.length === 0, `${name} (${where}) is served with the enforced policy and raises no violation`, detail);
}

const browser = await chromium.launch();
try {
  // Pages anyone can open.
  {
    const ctx = await context();
    const page = await ctx.newPage();
    const open = [
      ["home", "/"],
      ["pricing", "/pricing"],
      ["about", "/about"],
      ["section", "/entertainment"],
      ["business-page", "/entertainment/test-delete-motion-venue"],
      ["weddings", "/weddings"],
      ["futprep-register", "/futprep/register"],
      ["apply", "/apply"],
      ["sign-in", "/login"],
      ["sign-up", "/signup"],
      ["payment-request", `/pay/${payments.unpaid.token}`],
      ["payment-receipt", `/pay/${payments.paid.token}/receipt`],
    ];
    for (const [name, path] of open) await visit(page, name, path);
    await ctx.close();
  }

  // The business area, as the TEST business owner.
  {
    const ctx = await context();
    const page = await ctx.newPage();
    if (payments.ownerEmail && (await signIn(page, payments.ownerEmail))) {
      await visit(page, "business-payments", `/business/${payments.slug}/payments`);
    } else {
      check(false, "the TEST business owner signs in to the business area");
    }
    await ctx.close();
  }

  // Admin, as the TEST platform owner (sign-in code, then the authenticator step).
  {
    const ctx = await context();
    const page = await ctx.newPage();
    if (adminEmail && (await signIn(page, adminEmail, { stepUp: true }))) {
      await visit(page, "admin", "/admin");
      await visit(page, "admin-content", "/admin/content");
    } else {
      check(false, "the TEST platform owner signs in to Admin");
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const report = [
  "# The content security policy, page by page",
  "",
  `Against ${BASE} at 375px, the branch's own build with TEST data. Screenshots: csp-pages/<page>-375.png.`,
  "",
  ...lines,
  "",
  "Vercel's analytics and speed-insights scripts are served only on Vercel (under /_vercel/, from the site's own origin), so they are checked on the live site after the merge.",
].join("\n");
writeFileSync(`${OUT}/report.md`, `${report}\n`);
console.log(report);
if (failed) {
  console.error(`${failed} page check(s) failed.`);
  process.exit(1);
}
