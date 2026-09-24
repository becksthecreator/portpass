import { ExternalWidget } from "./ExternalWidget";

// Block 2 of 8 -- renders only when at least one value is true. Never
// invents a number: an organization with nothing confirmed yet (no years,
// no rating, no awards) simply skips this block entirely.
//
// awards is a list of distinct award names, not a pre-formatted count --
// passing a single string like "6 Foo Awards" wrapped in a 1-element array
// hits the awards.length===1 branch below and renders a "1" tile next to
// that whole sentence (the "16 Couples' Choice Awards" bug). A caller with
// N of the *same* named award should pass that name N times; this block
// pluralizes it once, correctly, in one place.
//
// ratingBadgeHtml/awardBadgeHtml are optional real third-party widget
// embeds (e.g. WeddingWire) -- when supplied, each one REPLACES the
// corresponding hand-entered figure rather than sitting alongside it, so a
// business's real rating/award badge is never shown next to (and possibly
// contradicting) a stale manually-entered number for the same fact. Both
// render as ordinary items in this same row, so a rating badge and an
// award badge sit side by side the same way the hand-entered figures did.
export function ProofBlock({
  yearsInBusiness,
  rating,
  reviewCount,
  awards,
  reviewsUrl,
  reviewsPlatform,
  ratingBadgeHtml,
  awardBadgeHtml,
}: {
  yearsInBusiness: number | null;
  rating: number | null;
  reviewCount: number | null;
  awards: string[];
  reviewsUrl?: string | null;
  reviewsPlatform?: string | null;
  ratingBadgeHtml?: string | null;
  awardBadgeHtml?: string | null;
}) {
  const items: { value: string; label: string; href?: string }[] = [];
  if (yearsInBusiness) items.push({ value: `${yearsInBusiness}+`, label: "Years in business" });

  if (!ratingBadgeHtml) {
    if (reviewsUrl && reviewCount) {
      const platform = reviewsPlatform ? ` on ${reviewsPlatform}` : "";
      items.push({
        value: rating !== null ? rating.toFixed(1) : String(reviewCount),
        label: `Read ${reviewCount} five-star reviews${platform}`,
        href: reviewsUrl,
      });
    } else if (rating !== null) {
      items.push({ value: rating.toFixed(1), label: reviewCount ? `${reviewCount} reviews` : "Rating" });
    } else if (reviewCount) {
      items.push({ value: String(reviewCount), label: "Reviews" });
    }
  }

  if (!awardBadgeHtml) {
    if (awards.length === 1) items.push({ value: "1", label: awards[0] });
    else if (awards.length > 1) {
      const allSameAward = awards.every((award) => award === awards[0]);
      items.push({ value: String(awards.length), label: allSameAward ? `${awards[0]}s` : "Awards & recognition" });
    }
  }

  if (items.length === 0 && !ratingBadgeHtml && !awardBadgeHtml) return null;

  return (
    <section className="tpl-proof" aria-label="Trust and experience">
      {items.map((item) =>
        item.href ? (
          <a key={item.label} className="tpl-proof-link" href={item.href} target="_blank" rel="noopener noreferrer">
            <strong>{item.value}</strong>
            <span>{item.label} <span aria-hidden="true">↗</span></span>
          </a>
        ) : (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        )
      )}
      {ratingBadgeHtml && <ExternalWidget className="tpl-proof-widget" html={ratingBadgeHtml} />}
      {awardBadgeHtml && <ExternalWidget className="tpl-proof-widget" html={awardBadgeHtml} />}
    </section>
  );
}
