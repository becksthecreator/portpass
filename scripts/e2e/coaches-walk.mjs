// The coaches walk (brief 31, Part E), at phone width. Runs against `next
// start` on localhost with the TEST world from seed-coaches-fixture.ts, on
// the throwaway local Supabase stack of .github/workflows/coaches-walk.yml.
// Every step goes through the real screens and routes:
//
//   1. the TEST coach signs in with the staff PIN form;
//   2. sets their working days and blocks a date on My days;
//   3. sees only their own private-session request (another coach's
//      answers 404), and accepts it;
//   4. marks it completed;
//   5. sees its pay line on Coach pay;
//   6. scores the TEST child's Progress Passport on the roster, writes a
//      note, and shares it;
//   7. the TEST parent opens it on /futprep/my/[code];
//   8. the TEST owner (the CEO) sees it all on /futprep/staff/ops, and the
//      TEST admin sees every request.
//
// Each step is checked in the database too, and timed. Screenshots go to
// ./screenshots; a step that fails is reported and the run exits 1. Nothing
// is sent: every parent is @example.com.
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../../lib/localStackOnly.mjs";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
// The secret key reads the database here, so this only ever runs against a
// local Supabase stack and the app on localhost.
assertLocalSupabase();
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Refusing to run against anything but the app on localhost.");
const PIN = process.env.SCREENSHOT_PIN;
if (!PIN) throw new Error("SCREENSHOT_PIN is not set.");
const fixture = JSON.parse(readFileSync(process.env.SCREENSHOT_FIXTURE, "utf8"));
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
mkdirSync("screenshots", { recursive: true });

const NOTE = "TEST: a strong first touch this term. Keep practising the weaker foot.";
const CLIP = "https://youtu.be/test-walk";
const results = [];
let failed = false;

async function step(name, run) {
  const started = Date.now();
  try {
    const note = await run();
    results.push({ name, ok: true, ms: Date.now() - started, note: note ?? "" });
    console.log(`ok   ${name} (${Date.now() - started} ms)${note ? ` — ${note}` : ""}`);
  } catch (error) {
    failed = true;
    results.push({ name, ok: false, ms: Date.now() - started, note: error.message });
    console.error(`FAIL ${name} (${Date.now() - started} ms): ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function row(table, columns, id) {
  const { data, error } = await db.from(table).select(columns).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function shot(page, name) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
}

async function phone(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  return context.newPage();
}

// No horizontal scroll at 375px. A page that scrolls sideways is listed
// with the elements that stick out (the innermost ones, outside any box
// that scrolls on its own), and fails the run at the end, so the walk
// still goes on to the next step.
const tooWide = [];
async function fits(page) {
  const found = await page.evaluate(() => {
    const view = document.documentElement.clientWidth;
    const width = document.documentElement.scrollWidth;
    if (width <= view) return { width, offenders: [] };
    const scrollsOwn = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const over = (el) => el.getBoundingClientRect().right > view + 1;
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}`;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => over(el) && !scrollsOwn(el) && ![...el.children].some(over))
      .slice(0, 6)
      .map((el) => `${name(el)} ${Math.round(el.getBoundingClientRect().width)}px wide, ends at ${Math.round(el.getBoundingClientRect().right)}px; inside ${el.parentElement ? name(el.parentElement) : "body"}`);
    return { width, offenders };
  });
  if (found.offenders.length || found.width > 375) {
    const where = new URL(page.url()).pathname;
    tooWide.push({ where, width: found.width, offenders: found.offenders });
    console.error(`WIDE ${where}: ${found.width}px\n  ${found.offenders.join("\n  ")}`);
  }
}

// The real PIN form, as a coach does it at the field.
async function signIn(page, account, home, screenshot) {
  await page.goto(`${BASE}/futprep/staff/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Account name").fill(account);
  if (screenshot) await shot(page, screenshot);
  await page.getByLabel("Staff PIN").fill(PIN);
  await Promise.all([page.waitForURL(`**${home}**`, { timeout: 60_000 }), page.locator(".staff-login-form button[type=submit]").click()]);
}

const browser = await chromium.launch();
const coach = await phone(browser);
coach.on("dialog", (dialog) => dialog.accept());

await step("1. The coach signs in", async () => {
  await signIn(coach, "test-walk-coach", "/futprep/staff/coach", "e01-coach-sign-in");
  await coach.waitForLoadState("networkidle");
  await fits(coach);
  await shot(coach, "e01-coach-signed-in");
});

await step("2. Sets their working days and blocks a date", async () => {
  await coach.goto(`${BASE}/futprep/staff/my-days`, { waitUntil: "networkidle" });
  for (const day of ["Mon", "Wed", "Fri"]) await coach.locator(".location-days label", { hasText: day }).locator("input").check();
  await coach.getByRole("button", { name: "Save working days" }).click();
  await coach.getByText("Working days saved.").waitFor({ timeout: 30_000 });
  await coach.locator('input[name="date"]').fill(fixture.dayAway);
  await coach.getByRole("button", { name: "Add day away" }).click();
  await coach.locator(".my-days-remove").first().waitFor({ timeout: 30_000 });
  const profile = await row("coach_profiles", "working_days", fixture.walker);
  expect(JSON.stringify(profile.working_days) === "[1,3,5]", `Working days saved as ${JSON.stringify(profile.working_days)}.`);
  const { data: away } = await db.from("coach_availability").select("id").eq("coach_id", fixture.walker).eq("availability_date", fixture.dayAway).eq("status", "blocked").eq("start_time", "00:00").eq("end_time", "23:59");
  expect(away?.length === 1, `The day away (${fixture.dayAway}) was not saved.`);
  await fits(coach);
  await shot(coach, "e02-my-days");
  return `Mon, Wed, Fri; away ${fixture.dayAway}`;
});

await step("3. Sees only their own request (another coach's answers 404) and accepts it", async () => {
  await coach.goto(`${BASE}/futprep/staff/private-sessions`, { waitUntil: "networkidle" });
  const cards = coach.locator(".private-request-card");
  expect((await cards.count()) === 1, `The coach sees ${await cards.count()} requests, not 1.`);
  const text = await cards.first().innerText();
  expect(text.includes("Private Child 1"), "The coach's own request is missing.");
  expect(!text.includes("Private Child 2"), "The coach sees another coach's request.");
  const other = await coach.evaluate(async (id) => (await fetch(`/api/futprep/private-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) })).status, fixture.otherRequestId);
  expect(other === 404, `Another coach's request answered ${other}, not 404.`);
  await fits(coach);
  await shot(coach, "e03-inbox-own-only");
  await cards.first().getByRole("button", { name: "Accept", exact: true }).click();
  await coach.getByText(/^Accepted\./).waitFor({ timeout: 30_000 });
  const request = await row("private_session_requests", "status,assigned_coach_id", fixture.walkerRequestId);
  expect(request.status === "accepted" && Number(request.assigned_coach_id) === fixture.walker, `The request is ${request.status}, with coach ${request.assigned_coach_id}.`);
  expect((await row("private_session_requests", "status", fixture.otherRequestId)).status === "pending", "The other coach's request changed.");
  await shot(coach, "e04-accepted");
});

await step("4. Marks it completed", async () => {
  await coach.locator(".private-request-card").first().getByRole("button", { name: "Complete", exact: true }).click();
  await coach.getByText("Updated.").waitFor({ timeout: 30_000 });
  expect((await row("private_session_requests", "status", fixture.walkerRequestId)).status === "completed", "The request was not completed.");
  const { data: lines } = await db.from("private_session_pay").select("coach_id,pay_cents,rate_basis,reference_code,paid_at").eq("request_id", fixture.walkerRequestId);
  expect(lines?.length === 1, `${lines?.length ?? 0} pay lines, not 1.`);
  expect(Number(lines[0].coach_id) === fixture.walker && lines[0].rate_basis === "rate_60" && lines[0].paid_at === null, `Pay line: ${JSON.stringify(lines[0])}.`);
  await shot(coach, "e05-completed");
  return `pay line ${lines[0].reference_code}, ${lines[0].pay_cents} cents owed (the TEST 60-minute rate)`;
});

await step("5. Sees the pay line", async () => {
  await coach.goto(`${BASE}/futprep/staff/pay`, { waitUntil: "networkidle" });
  const section = coach.locator("section.pay-section", { has: coach.locator("#pay-private") });
  await section.waitFor({ timeout: 30_000 });
  const text = await section.innerText();
  expect(text.includes("FP-S-WALK1"), "The pay line is not on Coach pay.");
  expect(!text.includes("FP-S-WALK2"), "Another coach's line is on this coach's pay.");
  await section.scrollIntoViewIfNeeded();
  await fits(coach);
  await shot(coach, "e06-pay-line");
});

await step("6. Scores the passport, writes a note and shares it", async () => {
  await coach.goto(`${BASE}/futprep/staff/coach?session=${fixture.sessionId}`, { waitUntil: "networkidle" });
  const panel = coach.locator(".passport-panel").first();
  await panel.locator("summary").click();
  await panel.locator(".passport-body").waitFor({ timeout: 30_000 });
  const skills = panel.locator(".passport-skill");
  const count = await skills.count();
  expect(count > 0, "The passport has no skills.");
  for (let i = 0; i < count; i += 1) {
    const groups = skills.nth(i).locator(".passport-scores");
    for (const [group, score] of [[0, "2"], [1, "4"]]) {
      await Promise.all([
        coach.waitForResponse((r) => r.url().endsWith("/api/futprep/staff/passports") && r.request().method() === "POST" && r.status() === 200),
        groups.nth(group).getByRole("button", { name: score, exact: true }).click(),
      ]);
    }
  }
  await panel.locator('textarea[name="note"]').fill(NOTE);
  await panel.locator('input[name="clipUrl"]').fill(CLIP);
  await panel.getByRole("button", { name: "Save note" }).click();
  await coach.getByText("Note saved.").waitFor({ timeout: 30_000 });
  await fits(coach);
  await panel.scrollIntoViewIfNeeded();
  await shot(coach, "e07-passport-scored");
  await panel.getByRole("button", { name: "Share with the family" }).click();
  await coach.getByText(/^Shared\./).waitFor({ timeout: 30_000 });
  const { data: passport } = await db.from("passports").select("id,status").eq("registration_id", fixture.registrationId).single();
  expect(passport?.status === "shared", `The passport is ${passport?.status}.`);
  const { count: marks } = await db.from("passport_marks").select("id", { count: "exact", head: true }).eq("passport_id", passport.id).not("start_score", "is", null).not("end_score", "is", null);
  expect(marks === count, `${marks} of ${count} skills have both marks.`);
  await shot(coach, "e08-passport-shared");
  return `${count} skills, start 2 and end 4 each`;
});

await step("7. The parent opens it on /futprep/my/[code]", async () => {
  const parent = await phone(browser);
  await parent.goto(`${BASE}/futprep/my/${fixture.referenceCode}`, { waitUntil: "networkidle" });
  await parent.locator('input[type="date"]').fill(fixture.childDob);
  await parent.locator(".my-lookup-form button[type=submit]").click();
  const passport = parent.locator(".my-status-passport");
  await passport.waitFor({ timeout: 30_000 });
  const text = await passport.innerText();
  expect(text.includes(NOTE), "The coach's note is missing.");
  expect((await parent.locator(`a[href="${CLIP}"]`).count()) === 1, "The clip link is missing (photo permission is yes).");
  // Rule 3: the passport carries no emergency, pickup or health detail,
  // and only the child's first name.
  for (const hidden of ["Emergency", "242-555-0132", "Walk Parent", "Walk Child"]) expect(!text.includes(hidden), `The passport shows "${hidden}".`);
  await passport.scrollIntoViewIfNeeded();
  await fits(parent);
  await shot(parent, "e09-family-passport");
  await parent.context().close();
});

await step("8. The owner sees it all on /futprep/staff/ops", async () => {
  const owner = await phone(browser);
  await signIn(owner, "test-walk-owner", "/futprep/staff/ceo");
  await owner.goto(`${BASE}/futprep/staff/ops`, { waitUntil: "networkidle" });
  const text = await owner.locator("body").innerText();
  for (const seen of ["Coach Walker", "walk field", "Walk Class"]) expect(text.includes(seen), `The ops map is missing "${seen}".`);
  await fits(owner);
  await shot(owner, "e10-owner-ops");
  await owner.context().close();
});

await step("9. The admin sees every request", async () => {
  const admin = await phone(browser);
  await signIn(admin, "test-walk-admin", "/futprep/staff/admin");
  await admin.goto(`${BASE}/futprep/staff/private-sessions`, { waitUntil: "networkidle" });
  const text = await admin.locator("body").innerText();
  expect(text.includes("Private Child 1") && text.includes("Private Child 2"), "The admin doesn't see both requests.");
  await fits(admin);
  await shot(admin, "e11-admin-inbox");
  await admin.context().close();
});

await browser.close();

console.log("\n| Step | Result | Time | Note |\n|---|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.ok ? "ok" : "**FAIL**"} | ${(r.ms / 1000).toFixed(1)} s | ${r.note.replace(/\|/g, "/")} |`);
const uniqueWide = [...new Map(tooWide.map((w) => [w.where, w])).values()];
console.log(`\n| Page at 375px | Width | Sticks out |\n|---|---|---|`);
for (const w of uniqueWide) console.log(`| ${w.where} | ${w.width}px | ${w.offenders.join("; ").replace(/\|/g, "/") || "—"} |`);
if (!uniqueWide.length) console.log("| every page | 375px | nothing |");
if (failed || uniqueWide.length) process.exit(1);
