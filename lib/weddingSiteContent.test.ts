import { describe, expect, it } from "vitest";
import { readJson } from "./api/body";
import { SiteContentBody, siteContentChanges, siteContentFromBody, type SiteContent } from "./weddingSiteContent";

const GOOD = {
  reviewCount: 100,
  reviewRecommendPct: 100,
  yearsExperience: 26,
  awardYears: [2026, 2023, 2022, 2021, 2020, 2019],
  weddingWireMemberId: "946150",
  showRatingBadge: true,
  showAwardBadge: true,
  showReviews: true,
};

const post = (body: unknown) => new Request("https://portpass.test/api/weddings/admin/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const accepts = (body: unknown) => SiteContentBody.safeParse(body).success;

describe("what the Wedding Desk's content screen may save", () => {
  it("takes the numbers, the award years, a member ID and three yes/no switches", async () => {
    const read = await readJson(post(GOOD), SiteContentBody);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(siteContentFromBody(read.value)).toEqual({
      reviewCount: 100,
      reviewRecommendPct: 100,
      yearsExperience: 26,
      awardYears: [2026, 2023, 2022, 2021, 2020, 2019],
      weddingWire: { memberId: "946150", ratingBadge: true, awardBadge: true, reviews: true },
    });
  });

  it("refuses HTML: the old snippet fields are not fields any more, and the answer names them", async () => {
    for (const field of ["reviewsWidgetHtml", "ratingBadgeHtml", "awardBadgeHtml"]) {
      const read = await readJson(post({ ...GOOD, [field]: "<script>fetch('/api/admin/people')</script>" }), SiteContentBody);
      expect(read.ok, field).toBe(false);
      if (read.ok) continue;
      expect(read.response.status).toBe(400);
      const answer = await read.response.json();
      expect(answer.unknownFields).toEqual([field]);
      expect(JSON.stringify(answer)).not.toContain("script");
    }
    // What the screen sent before this change is refused whole.
    const before = { reviewCount: 100, reviewRecommendPct: 100, yearsExperience: 26, awardYears: "2026, 2023", reviewsWidgetHtml: "<div></div>", ratingBadgeHtml: "", awardBadgeHtml: "" };
    expect((await readJson(post(before), SiteContentBody)).ok).toBe(false);
  });

  it("takes a member ID only as digits, and nothing else in its place", () => {
    for (const memberId of ["946150", "1", "999999999999", " 946150 "]) expect(accepts({ ...GOOD, weddingWireMemberId: memberId }), memberId).toBe(true);
    const refused: unknown[] = [
      "0946150", "1234567890123", "946,150", "9.5", "-1", "1e6", "０", "abc", "946150');alert(1);//", "946150, \"red\"); fetch('/admin'); (",
      "<script>alert(1)</script>", "946150</script>", 946150, null, ["946150"], { id: "946150" }, "9".repeat(21),
    ];
    for (const memberId of refused) expect(accepts({ ...GOOD, weddingWireMemberId: memberId }), JSON.stringify(memberId)).toBe(false);
  });

  it("trims the member ID, and reads an empty one as none", async () => {
    const read = await readJson(post({ ...GOOD, weddingWireMemberId: "  946150 " }), SiteContentBody);
    expect(read.ok && siteContentFromBody(read.value)?.weddingWire.memberId).toBe("946150");
    const none = SiteContentBody.parse({ ...GOOD, weddingWireMemberId: "", showRatingBadge: false, showAwardBadge: false, showReviews: false });
    expect(siteContentFromBody(none)?.weddingWire).toEqual({ memberId: null, ratingBadge: false, awardBadge: false, reviews: false });
  });

  it("will not switch a widget on with no member ID to build it from", () => {
    for (const key of ["showRatingBadge", "showAwardBadge", "showReviews"] as const) {
      const body = SiteContentBody.parse({ ...GOOD, weddingWireMemberId: "", showRatingBadge: false, showAwardBadge: false, showReviews: false, [key]: true });
      expect(siteContentFromBody(body), key).toBeNull();
    }
  });

  it("takes the switches only as true or false", () => {
    for (const value of ["true", 1, null, "on"]) expect(accepts({ ...GOOD, showReviews: value }), JSON.stringify(value)).toBe(false);
  });

  it("takes the numbers only as whole numbers in range", () => {
    expect(accepts({ ...GOOD, reviewCount: 0, reviewRecommendPct: 0, yearsExperience: 0 })).toBe(true);
    const refused: Array<Partial<typeof GOOD> | Record<string, unknown>> = [
      { reviewCount: -1 }, { reviewCount: 100.5 }, { reviewCount: "100" }, { reviewCount: null }, { reviewCount: 100_001 },
      { reviewRecommendPct: 101 }, { yearsExperience: 151 }, { yearsExperience: Number.NaN },
    ];
    for (const change of refused) expect(accepts({ ...GOOD, ...change }), JSON.stringify(change)).toBe(false);
  });

  it("takes the award years only as a list of years", () => {
    expect(accepts({ ...GOOD, awardYears: [] })).toBe(true);
    for (const awardYears of ["2026, 2023", [1999], [2101], [2026.5], ["2026"], Array.from({ length: 31 }, () => 2026)]) {
      expect(accepts({ ...GOOD, awardYears }), JSON.stringify(awardYears)).toBe(false);
    }
  });

  it("needs every field", () => {
    for (const key of Object.keys(GOOD)) {
      const body: Record<string, unknown> = { ...GOOD };
      delete body[key];
      expect(accepts(body), key).toBe(false);
    }
  });
});

describe("the audit entry for a save", () => {
  const before: SiteContent = { reviewCount: 100, reviewRecommendPct: 100, yearsExperience: 26, awardYears: [2026, 2023], weddingWire: { memberId: "946150", ratingBadge: true, awardBadge: true, reviews: true } };

  it("names only what changed, before and after", () => {
    const after: SiteContent = { ...before, reviewCount: 101, weddingWire: { ...before.weddingWire, memberId: "123", reviews: false } };
    expect(siteContentChanges(before, after)).toEqual({
      before: { reviewCount: 100, weddingWireMemberId: "946150", showReviews: true },
      after: { reviewCount: 101, weddingWireMemberId: "123", showReviews: false },
    });
  });

  it("sees a change to the award years, and nothing when nothing changed", () => {
    expect(siteContentChanges(before, { ...before, awardYears: [2026, 2023, 2027] })).toEqual({ before: { awardYears: [2026, 2023] }, after: { awardYears: [2026, 2023, 2027] } });
    expect(siteContentChanges(before, structuredClone(before))).toEqual({ before: {}, after: {} });
  });
});
