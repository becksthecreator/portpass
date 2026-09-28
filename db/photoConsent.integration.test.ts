import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOrganizationListingForPreview, listPublishedOrganizations, listSectionBusinesses } from "./organizations";

// The children's-photo rule: where an organization's photos may include
// children (photo_consent_required), the public data layer returns only
// images with consent_confirmed, and never a hero that isn't one of them.
// An organization without the flag is untouched.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const slug = `test-delete-consent-${Date.now()}`;
let orgId = 0;

beforeAll(async () => {
  const { data, error } = await admin
    .from("organizations")
    .insert({
      name: "TEST — delete Consent Club",
      slug,
      primary_category: "sports-fitness",
      status: "approved",
      is_directory_listed: true,
      photo_consent_required: true,
      hero_image_url: "/test/unconfirmed-hero.jpg",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  orgId = Number(data!.id);
  const { error: imageError } = await admin.from("organization_images").insert([
    { organization_id: orgId, url: "/test/unconfirmed-hero.jpg", alt: "hero, no consent yet", sort_order: 0, consent_confirmed: false },
    { organization_id: orgId, url: "/test/confirmed-wide-shot.jpg", alt: "wide shot, consent confirmed", sort_order: 1, consent_confirmed: true },
    { organization_id: orgId, url: "/test/unconfirmed-faces.jpg", alt: "faces, no consent yet", sort_order: 2, consent_confirmed: false },
  ]);
  expect(imageError).toBeNull();
});

afterAll(async () => {
  if (orgId) {
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    expect(error).toBeNull();
  }
});

describe("photo consent gating", () => {
  it("returns only confirmed images and swaps an unconfirmed hero for a confirmed one", async () => {
    const listing = (await getOrganizationListingForPreview(orgId))!;
    expect(listing.images.map((i) => i.url)).toEqual(["/test/confirmed-wide-shot.jpg"]);
    expect(listing.organization.heroImageUrl).toBe("/test/confirmed-wide-shot.jpg");
  });

  it("gates the hero on section cards and the directory too", async () => {
    const card = (await listSectionBusinesses("sports-fitness")).find((b) => b.slug === slug)!;
    expect(card.heroImageUrl).toBe("/test/confirmed-wide-shot.jpg");
    const entry = (await listPublishedOrganizations("sports-fitness")).find((b) => b.slug === slug)!;
    expect(entry.heroImageUrl).toBe("/test/confirmed-wide-shot.jpg");
  });

  it("drops the hero entirely once nothing is confirmed", async () => {
    await admin.from("organization_images").update({ consent_confirmed: false }).eq("organization_id", orgId);
    const listing = (await getOrganizationListingForPreview(orgId))!;
    expect(listing.images).toEqual([]);
    expect(listing.organization.heroImageUrl).toBeNull();
    const card = (await listSectionBusinesses("sports-fitness")).find((b) => b.slug === slug)!;
    expect(card.heroImageUrl).toBeNull();
  });

  it("leaves organizations without the flag alone", async () => {
    await admin.from("organizations").update({ photo_consent_required: false }).eq("id", orgId);
    const listing = (await getOrganizationListingForPreview(orgId))!;
    expect(listing.images).toHaveLength(3);
    expect(listing.organization.heroImageUrl).toBe("/test/unconfirmed-hero.jpg");
  });
});
