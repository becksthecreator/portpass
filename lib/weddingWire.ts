// The WeddingWire widgets on Bahamas Weddings By The Sea's page: the rating
// badge, the Couples' Choice Award badge and the reviews.
//
// Until the security review of PR #183 these were stored as HTML that any
// Wedding Desk account could replace, and the page ran every <script> in it
// as PortPass, with the visitor's session. Now only the member ID and which
// widgets to show are stored (supabase/migrations/202610190002), and each
// snippet is built here from WeddingWire's own embed code, exactly as
// Antonio supplied it on 24 Sept 2026 (202609241015). The member ID is the
// only stored value that reaches a snippet, and it is digits or nothing.
//
// No imports and nothing server-only, so the page's client components build
// the snippet themselves from the member ID: no prop anywhere carries HTML.

export type WeddingWireWidget = "rating" | "award" | "reviews";

export type WeddingWireSettings = {
  memberId: string | null;
  ratingBadge: boolean;
  awardBadge: boolean;
  reviews: boolean;
};

export const NO_WEDDINGWIRE: WeddingWireSettings = { memberId: null, ratingBadge: false, awardBadge: false, reviews: false };

// Digits only, at most 12, and no leading zero: the reviews call passes the
// ID as a bare number, where a leading 0 would be read as octal. The
// database holds the same rule (wedding_site_settings_weddingwire_member_id).
export const WEDDINGWIRE_MEMBER_ID = /^[1-9][0-9]{0,11}$/;

export function isWeddingWireMemberId(value: unknown): value is string {
  return typeof value === "string" && WEDDINGWIRE_MEMBER_ID.test(value);
}

// The business's own pages on WeddingWire, from its embed code.
const LISTING = "bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html";
const PROFILE_URL = `https://www.weddingwire.com/biz/${LISTING}`;
const REVIEWS_URL = `https://www.weddingwire.com/reviews/${LISTING}`;

// WeddingWire's loaders, from cdn1.weddingwire.com only. Each snippet loads
// one, then calls the function it defines.
const RATED_LOADER = "https://cdn1.weddingwire.com/_js/wp-rated.js?v=4";
const REVIEWS_LOADER = "https://cdn1.weddingwire.com/js/wp-widget.js?symfnw-US248-1-20260923-006-1_www_m_";

// The award the badge shows. A new year's badge comes with a new embed code
// from WeddingPro: change the year here and in the award call
// lib/weddingWire.test.ts expects.
const AWARD_YEAR = "2026";

// Line for line, WeddingWire's embed code, with the member ID put in.
const TEMPLATES: Record<WeddingWireWidget, (memberId: string) => string> = {
  rating: (memberId) =>
    [
      `<script src="${RATED_LOADER}"></script>`,
      `<a target="_blank" id="wp-rated-img" rel="nofollow"`,
      `   href="${PROFILE_URL}"`,
      `   title="Reviewed on WeddingWire">`,
      `  <span id="wp-rated-reviews"></span>`,
      `</a>`,
      `<script>wpShowRatedWW('${memberId}');</script>`,
    ].join("\n"),
  award: (memberId) =>
    [
      `<div id="wp-ratedWA">`,
      `  <a target="_blank" rel="nofollow"`,
      `     href="${PROFILE_URL}"`,
      `     title="WeddingWire Couples' Choice Award Winner ${AWARD_YEAR}">`,
      `    <img width="125" height="125" alt="Bahamas Weddings By The Sea"`,
      `         id="wp-ratedWA-img-${AWARD_YEAR}"`,
      `         src="https://cdn1.weddingwire.com/img/badges/${AWARD_YEAR}/badge-weddingawards_en_US.png">`,
      `  </a>`,
      `</div>`,
      `<script type="text/javascript" src="${RATED_LOADER}"></script>`,
      `<script>wpShowRatedWAv3('${memberId}','${AWARD_YEAR}');</script>`,
    ].join("\n"),
  reviews: (memberId) =>
    [
      `<script src="${REVIEWS_LOADER}"></script>`,
      `<div id="wp-widget-reviews">`,
      `  <div id="wp-widget-preview">`,
      `    Read <a href="${REVIEWS_URL}" rel="nofollow">View reviews:</a> in &nbsp;`,
      `    <a href='https://www.weddingwire.com' rel="nofollow">`,
      `      <img src="https://cdn1.weddingwire.com/assets/img/logos/gen_logoHeader.svg" height="20">`,
      `    </a>`,
      `  </div>`,
      `</div>`,
      `<script>wpShowReviews(${memberId}, "red");</script>`,
    ].join("\n"),
};

// The snippet for one widget, or null when the ID is not a member ID, so a
// bad value shows nothing rather than something.
export function weddingWireSnippet(widget: WeddingWireWidget, memberId: string): string | null {
  return isWeddingWireMemberId(memberId) ? TEMPLATES[widget](memberId) : null;
}
