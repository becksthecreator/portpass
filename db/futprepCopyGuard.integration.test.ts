import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAllCoachProfiles, listPublicCoachProfiles } from "./coaches";
import { getOrganizationListingBySlug } from "./organizations";
import { ensureFutprepPilotData, getFutprepAvailability, resetFutprepSeedThrottleForTests } from "./registrations";

// Brief 16, A: Futprep's one-liner, description and the six coach profiles
// were corrected in the database on 1 Oct 2026 ("ages 1½–6", nicknames,
// bios). Nothing in the code may put the old text back: the pilot seed and
// the coach-schema check are the only writers that run on public reads, so
// this proves a public read leaves hand-edited rows exactly as they were.
// Runs against CI's local stack; the marker rows are restored or deleted.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const COACH_SLUG = `test-delete-coach-${crypto.randomUUID().slice(0, 6)}`;
let orgId = 0;
let before: { one_liner: string | null; description: string | null } = { one_liner: null, description: null };

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id,one_liner,description").eq("slug", "futprep").single();
  orgId = org!.id;
  before = { one_liner: org!.one_liner, description: org!.description };
  await db().from("organizations").update({ one_liner: `${MARK} one-liner`, description: `${MARK} description` }).eq("id", orgId);
  await db().from("coach_profiles").insert({
    organization_id: orgId, slug: COACH_SLUG, display_name: `${MARK} Coach`, nickname: `${MARK} Nick`, member_type: "coach",
    bio: `${MARK} bio`, active: true, public_visible: true, bookable: false, sort_order: 999,
  });
});

afterAll(async () => {
  await db().from("organizations").update(before).eq("id", orgId);
  await db().from("coach_profiles").delete().eq("slug", COACH_SLUG);
});

describe("public reads never overwrite Futprep's copy or team (brief 16, A)", () => {
  it("keeps the hand-edited one-liner, description, nickname and bio after the seed paths run", async () => {
    resetFutprepSeedThrottleForTests();
    await ensureFutprepPilotData();
    await getFutprepAvailability();
    // CI's Futprep row is not published, so the public listing can be null
    // there; the row itself is what must hold after every seed path ran.
    const listing = await getOrganizationListingBySlug("futprep");
    const { coaches: publicCoaches } = await listPublicCoachProfiles();
    const { coaches: allCoaches } = await listAllCoachProfiles();

    if (listing) {
      expect(listing.organization.oneLiner).toBe(`${MARK} one-liner`);
      expect(listing.organization.description).toBe(`${MARK} description`);
    }
    const { data: org } = await db().from("organizations").select("one_liner,description").eq("id", orgId).single();
    expect(org).toEqual({ one_liner: `${MARK} one-liner`, description: `${MARK} description` });

    const shown = publicCoaches.find((c) => c.slug === COACH_SLUG);
    expect(shown?.nickname).toBe(`${MARK} Nick`);
    expect(shown?.bio).toBe(`${MARK} bio`);
    expect(shown?.public_visible).toBe(true);
    expect(allCoaches.find((c) => c.slug === COACH_SLUG)?.bookable).toBe(false);
  });
});
