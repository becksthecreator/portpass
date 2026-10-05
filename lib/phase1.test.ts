import { describe, expect, it } from "vitest";
import { pageChecklist, type PageFacts } from "./pageChecklist";
import { phase1Checks, phase1Summary, SCOUT_SETTINGS, settingsSet, type Phase1Facts } from "./phase1";

const NOW = new Date("2026-10-05T16:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const page = (over: Partial<PageFacts> = {}): PageFacts => ({ slug: "island-booth", hasHero: true, photos: 6, pricedOfferings: 2, openOfferings: 2, openProgrammes: 0, hasWhatsApp: true, hasInstagram: true, hasGoogleBusiness: true, getPaidDone: true, livePerks: 1, ...over });
const business = (id: number, name: string, status: string, isPublished: boolean, over: Partial<PageFacts> = {}) => ({ organizationId: id, slug: page(over).slug, name, status, isPublished, items: pageChecklist(page(over)) });

const allSet = Object.fromEntries(["CRON_SECRET", ...SCOUT_SETTINGS].map((name) => [name, true]));
const good = (over: Partial<Phase1Facts> = {}): Phase1Facts => ({
  settings: allSet,
  backup: { at: hoursAgo(10), ok: true },
  signInCodeUsedAt: hoursAgo(3),
  businesses: [business(1, "Island Booth", "live", true)],
  livePerks: 2,
  publishedGuides: 1,
  carv: { status: "live", isPublished: true },
  demoResetAt: hoursAgo(9),
  ...over,
});
const check = (facts: Phase1Facts, key: string) => phase1Checks(facts, NOW).find((c) => c.key === key)!;

describe("Admin -> Phase 1", () => {
  it("everything in place is all ticks", () => {
    const checks = phase1Checks(good(), NOW);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(phase1Summary(checks)).toBe(`All ${checks.length} in place.`);
    expect(checks.map((c) => c.key)).toEqual(["cron_secret", "scout_keys", "backup_heartbeat", "sign_in_email", "demo_reset", "business_1", "carv_published", "perks", "guides"]);
  });

  it("says which settings are not set, by name", () => {
    const facts = good({ settings: { ...allSet, CRON_SECRET: false, ANTHROPIC_API_KEY: false, GOOGLE_PLACES_API_KEY: false } });
    expect(check(facts, "cron_secret").ok).toBe(false);
    expect(check(facts, "scout_keys")).toMatchObject({ ok: false, detail: "Not set: GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY." });
    // A setting nobody told us about counts as not set.
    expect(check(good({ settings: {} }), "scout_keys").ok).toBe(false);
  });

  it("never carries a setting's value, only whether it is set", () => {
    const env = { CRON_SECRET: "s3cr3t-cron-value", GOOGLE_PLACES_API_KEY: "AIza-places-value", INSTAGRAM_BUSINESS_ACCOUNT_ID: " ", ANTHROPIC_API_KEY: "sk-ant-value" };
    const settings = settingsSet(env, ["CRON_SECRET", ...SCOUT_SETTINGS]);
    expect(settings).toEqual({ CRON_SECRET: true, GOOGLE_PLACES_API_KEY: true, INSTAGRAM_BUSINESS_ACCOUNT_ID: false, INSTAGRAM_GRAPH_ACCESS_TOKEN: false, ANTHROPIC_API_KEY: true });
    const shown = JSON.stringify(phase1Checks(good({ settings }), NOW));
    for (const value of ["s3cr3t-cron-value", "AIza-places-value", "sk-ant-value"]) expect(shown).not.toContain(value);
  });

  it("the backup must have reported in, without failing, within 7 days", () => {
    expect(check(good({ backup: { at: hoursAgo(24 * 6), ok: true } }), "backup_heartbeat").ok).toBe(true);
    expect(check(good({ backup: { at: hoursAgo(24 * 8), ok: true } }), "backup_heartbeat")).toMatchObject({ ok: false, detail: "Last heard from 8 days ago: more than 7 days." });
    expect(check(good({ backup: { at: hoursAgo(2), ok: false } }), "backup_heartbeat")).toMatchObject({ ok: false, detail: "The last backup reported a failure, 2 hours ago." });
    expect(check(good({ backup: null }), "backup_heartbeat")).toMatchObject({ ok: false, detail: "No backup has ever reported in." });
    expect(check(good({ backup: undefined }), "backup_heartbeat").ok).toBe(false);
  });

  it("sign-in email counts as delivered when an emailed code was used in the last 24 hours", () => {
    expect(check(good({ signInCodeUsedAt: hoursAgo(23) }), "sign_in_email").ok).toBe(true);
    expect(check(good({ signInCodeUsedAt: hoursAgo(25) }), "sign_in_email").ok).toBe(false);
    expect(check(good({ signInCodeUsedAt: null }), "sign_in_email").ok).toBe(false);
    expect(check(good({ signInCodeUsedAt: "not a date" }), "sign_in_email").ok).toBe(false);
  });

  it("the demo must have been reset within two days", () => {
    expect(check(good({ demoResetAt: hoursAgo(30) }), "demo_reset")).toMatchObject({ ok: true, detail: "Last reset 30 hours ago." });
    expect(check(good({ demoResetAt: hoursAgo(72) }), "demo_reset")).toMatchObject({ ok: false, detail: "Last reset 3 days ago: the nightly reset has missed a night." });
    expect(check(good({ demoResetAt: null }), "demo_reset").ok).toBe(false);
  });

  it("lists each live business with what its page is missing, and leaves out ones that aren't live", () => {
    const facts = good({
      businesses: [business(1, "Island Booth", "live", true, { hasInstagram: false, livePerks: 0 }), business(2, "Reef Tours", "live", true), business(3, "Draft Co", "draft", false, { hasHero: false }), business(4, "Approved Co", "approved", false)],
    });
    const checks = phase1Checks(facts, NOW).filter((c) => c.group === "Businesses");
    expect(checks.map((c) => c.key)).toEqual(["business_1", "business_2", "carv_published"]);
    expect(checks[0]).toMatchObject({ ok: false, detail: "2 items missing:", missing: [{ label: "Instagram", href: "/business/island-booth/settings?step=2" }, { label: "A member perk", href: "/business/island-booth/perks" }] });
    expect(checks[1]).toMatchObject({ ok: true, detail: "All 9 items are in place.", missing: [] });
  });

  it("says so when no business is live, and when Carv isn't public yet", () => {
    expect(check(good({ businesses: [] }), "businesses")).toMatchObject({ ok: false, detail: "No business is live yet." });
    expect(check(good({ carv: { status: "approved", isPublished: false } }), "carv_published")).toMatchObject({ ok: false });
    expect(check(good({ carv: { status: "approved", isPublished: false } }), "carv_published").detail).toContain("approved and not public");
    expect(check(good({ carv: null }), "carv_published").ok).toBe(false);
  });

  it("counts perks and guides", () => {
    expect(check(good({ livePerks: 0 }), "perks")).toMatchObject({ ok: false, detail: "No business has a live member perk yet." });
    expect(check(good({ livePerks: 1 }), "perks").detail).toBe("1 perk is live.");
    expect(check(good({ publishedGuides: 3 }), "guides").detail).toBe("3 guides are published.");
    expect(check(good({ publishedGuides: 0 }), "guides").ok).toBe(false);
  });

  it("a fact that couldn't be read is a cross that says so, not a tick", () => {
    const checks = phase1Checks(good({ backup: undefined, signInCodeUsedAt: undefined, businesses: undefined, livePerks: undefined, publishedGuides: undefined, carv: undefined, demoResetAt: undefined }), NOW);
    const unread = checks.filter((c) => c.detail.startsWith("Could not be read"));
    expect(unread.map((c) => c.key)).toEqual(["backup_heartbeat", "sign_in_email", "demo_reset", "businesses", "carv_published", "perks", "guides"]);
    expect(unread.every((c) => !c.ok)).toBe(true);
    expect(phase1Summary(checks)).toBe("2 of 9 in place, 7 left.");
  });
});
