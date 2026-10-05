// "Photos from a phone" end to end (brief 19, part E), at phone width.
// Runs against `next start` on localhost with the TEST business and the
// TEST photos from seed-photos-fixture.ts, on a local Supabase stack with
// storage switched on. It signs in as the TEST owner through the real
// routes and uses the real Look step:
//
//   1. switches on "Children appear in some of my photos";
//   2. adds a 10 MB+ JPEG saved on its side with a location in it;
//   3. adds a small HEIC (one request) and a large HEIC (sent in pieces);
//   4. sends the 10 MB JPEG untouched, in pieces, so the server resizes it;
//   5. checks every stored photo is an upright JPEG no longer than 2048 px
//      with nothing of the phone's left in it;
//   6. ticks consent on a photo, makes one the main photo, adds a logo;
//   7. is told plainly when a file isn't a photo;
//   8. finds no pieces left behind.
//
// Each step is timed. Screenshots go to ./screenshots; a step that fails
// is reported and the run exits 1.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const fixture = JSON.parse(readFileSync(process.env.SCREENSHOT_FIXTURE, "utf8"));
const dir = process.env.PHOTO_DIR;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
mkdirSync("screenshots", { recursive: true });

const CHUNK = 3 * 1024 * 1024;
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

async function images() {
  const { data, error } = await admin.from("organization_images").select("id,url,consent_confirmed,sort_order").eq("organization_id", fixture.orgId).order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

// What is actually in storage for a photo: its format, its size, and
// whether anything the phone wrote is still in it.
async function stored(url) {
  const response = await fetch(url);
  expect(response.ok, `The stored photo did not load (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(bytes).metadata();
  return { bytes: bytes.length, format: meta.format, width: meta.width, height: meta.height, hasExif: Boolean(meta.exif), orientation: meta.orientation ?? null, hasMake: bytes.includes(Buffer.from("TESTPHONE")) };
}

function checkPhoto(photo, what) {
  expect(photo.format === "jpeg", `${what}: stored as ${photo.format}, not a JPEG.`);
  expect(Math.max(photo.width, photo.height) <= 2048, `${what}: ${photo.width}x${photo.height} is larger than 2048 px.`);
  expect(!photo.hasExif && photo.orientation === null && !photo.hasMake, `${what}: the phone's details are still in the file.`);
  expect(photo.bytes < 4 * 1024 * 1024, `${what}: ${photo.bytes} bytes is not a web-sized photo.`);
}

async function incomingLeft() {
  const { data } = await admin.storage.from("org-uploads").list(`org/${fixture.orgId}/incoming`, { limit: 100 });
  let left = 0;
  for (const upload of data ?? []) {
    const { data: parts } = await admin.storage.from("org-uploads").list(`org/${fixture.orgId}/incoming/${upload.name}`, { limit: 20 });
    left += (parts ?? []).length;
  }
  return left;
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const settings = `/business/${fixture.slug}/settings?step=3`;
  const photoInput = 'input[aria-label="Add a photo"]';
  const figures = page.locator(".wiz-photos figure");

  async function addPhoto(file, expectedCount) {
    await page.setInputFiles(photoInput, join(dir, file));
    await figures.nth(expectedCount - 1).waitFor({ state: "visible", timeout: 90_000 });
    expect((await figures.count()) === expectedCount, `Expected ${expectedCount} photos on the screen.`);
    const all = await images();
    expect(all.length === expectedCount, `Expected ${expectedCount} photos saved, found ${all.length}.`);
    return stored(all[all.length - 1].url);
  }

  await step("The owner signs in and opens the Look step", async () => {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: fixture.ownerEmail });
    if (error || !data?.properties?.email_otp) throw new Error(`Could not issue a sign-in code: ${error?.message ?? "no code"}`);
    await page.goto(`${BASE}/login`, { waitUntil: "load" });
    const status = await page.evaluate(async ({ email, token }) => (await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, token }) })).status, { email: fixture.ownerEmail, token: data.properties.email_otp });
    expect(status === 200, `Sign-in returned ${status}.`);
    await page.goto(`${BASE}${settings}`, { waitUntil: "load" });
    await page.locator(photoInput).waitFor({ state: "attached", timeout: 30_000 });
    await page.screenshot({ path: "screenshots/brief19-e-look-step-empty-375.png", fullPage: true });
  });

  await step("Switches on \"Children appear in some of my photos\"", async () => {
    const tick = page.getByLabel(/Children appear in some of my photos/);
    expect(!(await tick.isChecked()), "The tick should start off for this business.");
    page.once("dialog", (dialog) => dialog.accept());
    await tick.click();
    await page.getByText(/each photo needs your tick below/).waitFor({ timeout: 15_000 });
    const { data } = await admin.from("organizations").select("photo_consent_required").eq("id", fixture.orgId).single();
    expect(data.photo_consent_required === true, "The business should now need consent on each photo.");
  });

  await step("Adds a 10 MB+ JPEG from the camera roll", async () => {
    const photo = await addPhoto("big.jpg", 1);
    checkPhoto(photo, "The big JPEG");
    // Saved on its side by the phone (6000 x 4000 with a "turn me" tag):
    // stored upright.
    expect(photo.height > photo.width, `The big JPEG should be stored upright, not ${photo.width}x${photo.height}.`);
    return `${(fixture.bigJpegBytes / 1024 / 1024).toFixed(1)} MB in, ${photo.width}x${photo.height} and ${(photo.bytes / 1024).toFixed(0)} KB stored`;
  });

  await step("Adds a small HEIC (one request)", async () => {
    const photo = await addPhoto("small.heic", 2);
    checkPhoto(photo, "The small HEIC");
    expect(photo.width === 1600 && photo.height === 1200, `The small HEIC should keep its 1600x1200, not ${photo.width}x${photo.height}.`);
    return `${photo.width}x${photo.height} JPEG`;
  });

  await step("Adds a large HEIC (sent in pieces, converted on the server)", async () => {
    const photo = await addPhoto("big.heic", 3);
    checkPhoto(photo, "The large HEIC");
    expect(photo.width === 2048 && photo.height === 1536, `The large HEIC should be resized to 2048x1536, not ${photo.width}x${photo.height}.`);
    return `${photo.width}x${photo.height} JPEG`;
  });

  await step("The server resizes a 10 MB JPEG sent untouched, in pieces", async () => {
    const bytes = readFileSync(join(dir, "big.jpg"));
    const total = Math.ceil(bytes.length / CHUNK);
    const uploadId = crypto.randomUUID();
    let last = null;
    for (let index = 0; index < total; index += 1) {
      last = await context.request.post(`${BASE}/api/business/orgs/${fixture.orgId}/images`, {
        multipart: { kind: "photo", uploadId, index: String(index), total: String(total), file: { name: "big.jpg", mimeType: "image/jpeg", buffer: bytes.subarray(index * CHUNK, (index + 1) * CHUNK) } },
        timeout: 120_000,
      });
      expect(last.status() === (index === total - 1 ? 201 : 202), `Piece ${index + 1} of ${total} answered ${last.status()}: ${await last.text()}`);
    }
    const all = await images();
    expect(all.length === 4, `Expected 4 photos saved, found ${all.length}.`);
    const photo = await stored(all[3].url);
    checkPhoto(photo, "The JPEG the server resized");
    expect(photo.width === 1365 && photo.height === 2048, `Expected 1365x2048 upright, got ${photo.width}x${photo.height}.`);
    return `${total} pieces, ${photo.width}x${photo.height} stored`;
  });

  await step("A piece from someone who isn't signed in is refused", async () => {
    const anonymous = await browser.newContext();
    const response = await anonymous.request.post(`${BASE}/api/business/orgs/${fixture.orgId}/images`, { multipart: { kind: "photo", uploadId: crypto.randomUUID(), index: "0", total: "2", file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(1024, 1) } } });
    await anonymous.close();
    expect(response.status() === 401, `Expected 401, got ${response.status()}.`);
    const bad = await context.request.post(`${BASE}/api/business/orgs/${fixture.orgId}/images`, { multipart: { kind: "photo", uploadId: "../../org/1/photo", index: "0", total: "2", file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(1024, 1) } } });
    expect(bad.status() === 400, `A made-up upload id should be refused, got ${bad.status()}.`);
  });

  await step("Photos stay hidden until consent is ticked; one is made the main photo", async () => {
    await page.goto(`${BASE}${settings}`, { waitUntil: "load" });
    await figures.nth(3).waitFor({ state: "visible", timeout: 30_000 });
    expect((await page.locator(".wiz-photos figure.is-hidden").count()) === 4, "All four photos should be hidden until consent is ticked.");
    // The tick shows once the server has saved it, so this is a click and a wait.
    await figures.nth(0).getByRole("checkbox").click();
    await figures.nth(0).getByText("Consent confirmed · shown").waitFor({ timeout: 15_000 });
    await figures.nth(1).getByRole("button", { name: "Make main" }).click();
    await figures.nth(1).getByRole("button", { name: "★ Main" }).waitFor({ timeout: 15_000 });
    const all = await images();
    expect(all[0].consent_confirmed === true && all[1].consent_confirmed === false, "Only the first photo should have consent confirmed.");
    const { data } = await admin.from("organizations").select("hero_image_url").eq("id", fixture.orgId).single();
    expect(data.hero_image_url === all[1].url, "The second photo should be the main photo.");
    await page.screenshot({ path: "screenshots/brief19-e-photos-from-phone-375.png", fullPage: true });
    await page.locator(".wiz-children").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "screenshots/brief19-e-photos-from-phone-375-viewport.png" });
  });

  await step("Adds a logo, kept see-through", async () => {
    await page.setInputFiles('input[aria-label="Choose a logo"]', join(dir, "logo.png"));
    await page.locator("img.wiz-logo").waitFor({ state: "visible", timeout: 60_000 });
    const { data } = await admin.from("organizations").select("logo_url").eq("id", fixture.orgId).single();
    const response = await fetch(data.logo_url);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.format === "png" && meta.hasAlpha && meta.width === 512 && meta.height === 512, `The logo should be a 512x512 PNG with transparency, not ${meta.format} ${meta.width}x${meta.height}.`);
  });

  await step("A file that isn't a photo is refused in plain words", async () => {
    await page.setInputFiles(photoInput, join(dir, "not-a-photo.jpg"));
    await page.getByText("Use a JPEG, PNG, WebP or HEIC photo.").waitFor({ timeout: 30_000 });
    expect((await images()).length === 4, "A refused file must not be saved.");
  });

  await step("No pieces are left behind", async () => {
    const left = await incomingLeft();
    expect(left === 0, `${left} pieces are still in the private bucket.`);
  });

  await context.close();
} finally {
  await browser.close();
}

console.log("\n| Step | Result | Time |\n|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.ok ? "pass" : "FAIL"}${r.note ? `: ${r.note}` : ""} | ${(r.ms / 1000).toFixed(1)} s |`);
if (failed) process.exit(1);
