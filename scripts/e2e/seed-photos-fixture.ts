// Seeds a TEST business and TEST owner, and makes the TEST photos, for the
// "photos from a phone" job (.github/workflows/photos-e2e.yml, brief 19
// part E). Runs only against the throwaway local Supabase stack that job
// starts -- never against a real project. The photos are noise and flat
// colour made here: no real picture of anyone.
//
// Writes what the test needs to $SCREENSHOT_FIXTURE (JSON), and the source
// pictures to $PHOTO_DIR.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const noise = (width: number, height: number, sigma: number) => sharp({ create: { width, height, channels: 3, noise: { type: "gaussian", mean: 128, sigma } } });

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const out = process.env.SCREENSHOT_FIXTURE;
  const dir = process.env.PHOTO_DIR;
  if (!url || !key || !out || !dir) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY, SCREENSHOT_FIXTURE and PHOTO_DIR must be set.");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to seed anything but a local Supabase stack.");
  const db = createClient(url, key);

  // The two buckets, as the migrations make them where storage is on.
  for (const bucket of [
    { id: "org-assets", options: { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] } },
    { id: "org-uploads", options: { public: false, fileSizeLimit: 4 * 1024 * 1024 } },
  ]) {
    const { error } = await db.storage.createBucket(bucket.id, bucket.options);
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Could not make the ${bucket.id} bucket: ${error.message}`);
  }

  const ownerEmail = "test-delete-photos-owner@test.portpass.local";
  const { data: created, error: userError } = await db.auth.admin.createUser({ email: ownerEmail, email_confirm: true });
  if (userError || !created.user) throw new Error(`Could not seed the TEST owner: ${userError?.message}`);
  await db.from("profiles").upsert({ user_id: created.user.id, full_name: "TEST Owner" });

  const slug = "test-photo-studio";
  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({ name: "TEST Photo Studio", slug, primary_category: "entertainment", status: "draft", one_liner: "TEST — delete. For the photo upload test only.", whatsapp_e164: "+12425550100", brand_color: "#0E7C86", photo_consent_required: false })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`Could not seed the TEST business: ${orgError?.message}`);
  const orgId = Number(org.id);
  const member = await db.from("organization_members").insert({ organization_id: orgId, user_id: created.user.id, role: "org_owner" });
  if (member.error) throw new Error(`Could not seed the owner's membership: ${member.error.message}`);

  // The pictures. A phone's 10 MB JPEG, saved on its side with a tag that
  // says so and the place it was taken; and the sources the job turns
  // into HEIC files with heif-enc.
  mkdirSync(dir, { recursive: true });
  // Noise doesn't compress, so the quality is stepped down until the file
  // is the size of a large phone photo: over 10 MB, under 20.
  let big: Buffer | null = null;
  for (const quality of [100, 97, 94, 90, 85, 80, 72, 64]) {
    const candidate = await noise(6000, 4000, 60)
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Make: "TESTPHONE" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "25/1 3/1 36/1", GPSLongitudeRef: "W", GPSLongitude: "77/1 20/1 42/1" } })
      .jpeg({ quality })
      .toBuffer();
    console.log(`big.jpg at quality ${quality}: ${(candidate.length / 1024 / 1024).toFixed(1)} MB`);
    if (candidate.length < 10 * 1024 * 1024) break;
    if (candidate.length <= 20 * 1024 * 1024) {
      big = candidate;
      break;
    }
  }
  if (!big) throw new Error("Could not make a TEST photo between 10 and 20 MB.");
  writeFileSync(join(dir, "big.jpg"), big);
  // A flat picture compresses to a small HEIC (one request); a noisy one
  // to a large HEIC (sent in pieces).
  writeFileSync(join(dir, "heic-small-source.png"), await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 14, g: 124, b: 134 } } }).png().toBuffer());
  writeFileSync(join(dir, "heic-big-source.png"), await noise(4000, 3000, 50).png({ compressionLevel: 1 }).toBuffer());
  writeFileSync(join(dir, "logo.png"), await sharp({ create: { width: 900, height: 900, channels: 4, background: { r: 14, g: 124, b: 134, alpha: 0.6 } } }).png().toBuffer());
  writeFileSync(join(dir, "not-a-photo.jpg"), Buffer.from("%PDF-1.7 TEST — this is not a photo".padEnd(2048, " ")));

  writeFileSync(out, JSON.stringify({ ownerEmail, slug, orgId, bigJpegBytes: big.length }));
  console.log(`Seeded ${slug} (org ${orgId}); big.jpg is ${(big.length / 1024 / 1024).toFixed(1)} MB.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
