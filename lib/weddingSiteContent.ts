import { z } from "zod";
import { WEDDINGWIRE_MEMBER_ID, type WeddingWireSettings } from "./weddingWire";

// What the Wedding Desk's content screen shows and saves
// (/weddings/admin/content): the trust numbers and the WeddingWire widgets.
export type SiteContent = {
  reviewCount: number;
  reviewRecommendPct: number;
  yearsExperience: number;
  awardYears: number[];
  weddingWire: WeddingWireSettings;
};

// The body app/api/weddings/admin/content reads, through readJson
// (lib/api/body.ts). Every field is a whole number, a year, a member ID or a
// yes/no, and all eight must be there. No field carries HTML, and a body
// with any other field is refused whole, the old reviewsWidgetHtml,
// ratingBadgeHtml and awardBadgeHtml included.
const count = (max: number) => z.number().int().min(0).max(max);

export const SiteContentBody = z.strictObject({
  reviewCount: count(100_000),
  reviewRecommendPct: count(100),
  yearsExperience: count(150),
  awardYears: z.array(z.number().int().min(2000).max(2100)).max(30),
  // "" for none.
  weddingWireMemberId: z.string().max(20).trim().refine((value) => value === "" || WEDDINGWIRE_MEMBER_ID.test(value)),
  showRatingBadge: z.boolean(),
  showAwardBadge: z.boolean(),
  showReviews: z.boolean(),
});

export type SiteContentBody = z.output<typeof SiteContentBody>;

// The content a valid body saves, or null when it switches a widget on with
// no member ID to build it from (the route says so in words).
export function siteContentFromBody(body: SiteContentBody): SiteContent | null {
  const memberId = body.weddingWireMemberId || null;
  if (!memberId && (body.showRatingBadge || body.showAwardBadge || body.showReviews)) return null;
  return {
    reviewCount: body.reviewCount,
    reviewRecommendPct: body.reviewRecommendPct,
    yearsExperience: body.yearsExperience,
    awardYears: body.awardYears,
    weddingWire: { memberId, ratingBadge: body.showRatingBadge, awardBadge: body.showAwardBadge, reviews: body.showReviews },
  };
}

// For the audit entry: the fields a save changed, before and after. All of
// them are shown on the public page anyway.
function flat(content: SiteContent): Record<string, unknown> {
  return {
    reviewCount: content.reviewCount,
    reviewRecommendPct: content.reviewRecommendPct,
    yearsExperience: content.yearsExperience,
    awardYears: content.awardYears,
    weddingWireMemberId: content.weddingWire.memberId,
    showRatingBadge: content.weddingWire.ratingBadge,
    showAwardBadge: content.weddingWire.awardBadge,
    showReviews: content.weddingWire.reviews,
  };
}

export function siteContentChanges(before: SiteContent, after: SiteContent): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const was = flat(before);
  const now = flat(after);
  const changed = Object.keys(now).filter((key) => JSON.stringify(was[key]) !== JSON.stringify(now[key]));
  return {
    before: Object.fromEntries(changed.map((key) => [key, was[key]])),
    after: Object.fromEntries(changed.map((key) => [key, now[key]])),
  };
}
